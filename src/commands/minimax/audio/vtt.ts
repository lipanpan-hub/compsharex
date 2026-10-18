// cps minimax audio vtt: 读取 VTT 字幕文件, 逐行批量配音并下载到指定目录
// 设计说明: 命令骨架沿用模板方法基类(CompshareBaseCommand); 提交/轮询/下载三个批量 IO
// 阶段均由固定并发度的工作池(信号量限流)驱动, 在保证批量速度的同时限制 API 瞬时压力。

import {Args, Flags} from '@oclif/core'
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
import {join as joinPath, resolve as resolvePath} from 'node:path'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {SilentExit, UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient, newIdempotencyKey} from '../../../lib/compshare/minimax-api.js'
import {
  AUDIO_LANGUAGES,
  MINIMAX_AUDIO_PATH,
  floatFlag,
  selectVoiceIdInteractively,
} from '../../../lib/compshare/minimax-helpers.js'
import {timedSelect} from '../../../lib/prompts.js'

// #region 常量与类型
// 轮询间隔与总时长上限(短文本生成快, 2s 轮询足够及时)
const POLL_INTERVAL_MS = 2000
const MAX_POLL_DURATION_MS = 15 * 60 * 1000
// 列表接口单页大小(轮询用列表批量查询代替逐任务单查, 降低限流压力)
const POLL_PAGE_SIZE = 100
const DOWNLOAD_TIMEOUT_MS = 120_000
// 到达即不再轮询的终态集合
const TERMINAL_AUDIO_STATUSES = new Set(['cancelled', 'failed', 'succeeded'])

// 结果表列定义
const BATCH_RESULT_COLUMNS = [
  ['line', 'LINE'],
  ['time', 'TIME'],
  ['status', 'STATUS'],
  ['file', 'FILE'],
  ['task_id', 'TASK ID'],
  ['error', 'ERROR'],
] as const satisfies readonly (readonly [string, string])[]

// 单行字幕的任务执行状态(提交 → 轮询 → 下载 逐阶段填充)
interface CueJobResult {
  cue: VttCue
  status: 'pending' | 'succeeded' | 'failed'
  taskId?: string
  outputUrl?: string
  fileName?: string
  filePath?: string
  pointCost: number
  error?: string
}
// #endregion

// #region VTT 解析(纯函数, 导出便于测试)
export interface VttCue {
  // 行号(按文件内有效 cue 顺序, 从 1 开始), 用于输出文件命名与结果对齐
  lineNumber: number
  startMs: number
  endMs: number
  text: string
}

// 时间轴行示例: 00:00:01.000 --> 00:00:04.000 或 01:02.500 --> 01:05.000(支持逗号小数)
const VTT_TIMING_PATTERN = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{3})/

// 时间分组转毫秒: offset 起的四组为 [时?, 分, 秒, 毫秒]
function timingGroupsToMs(match: RegExpExecArray, offset: number): number {
  const hours = match[offset] ? Number(match[offset]) : 0
  const minutes = Number(match[offset + 1])
  const seconds = Number(match[offset + 2])
  const millis = Number(match[offset + 3])
  // ((时*60 + 分)*60 + 秒)*1000 + 毫秒, 括号明确运算顺序
  return (((hours * 60) + minutes) * 60 + seconds) * 1000 + millis
}

// 去除 VTT 行内标记: <c>、<v 名字>、<00:00:01.000> 等尖括号标签
function stripVttMarkup(line: string): string {
  return line.replace(/<[^>]*>/g, '').trim()
}

// 合并多行文本: 两侧均为 CJK 字符时直接拼接, 避免中文间混入空格
function joinCueTextLines(textLines: string[]): string {
  const CJK_BOUNDARY_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/
  let joined = ''
  for (const line of textLines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const isCjkBoundary = Boolean(joined) &&
      CJK_BOUNDARY_PATTERN.test(joined.slice(-1)) &&
      CJK_BOUNDARY_PATTERN.test(trimmed.slice(0, 1))
    joined += (joined && !isCjkBoundary ? ' ' : '') + trimmed
  }
  return joined
}

// 解析 VTT 内容为 cue 列表(自动跳过 WEBVTT 头/NOTE 块/无文本 cue)
export function parseVttCues(content: string): VttCue[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const cues: VttCue[] = []
  let cursor = 0
  while (cursor < lines.length) {
    const timingMatch = VTT_TIMING_PATTERN.exec(lines[cursor])
    if (!timingMatch) {
      cursor += 1
      continue
    }
    const startMs = timingGroupsToMs(timingMatch, 1)
    const endMs = timingGroupsToMs(timingMatch, 5)
    cursor += 1
    // 文本行: 持续收集直到空行或下一时间轴行
    const textLines: string[] = []
    while (cursor < lines.length && lines[cursor].trim() !== '' && !VTT_TIMING_PATTERN.test(lines[cursor])) {
      textLines.push(lines[cursor])
      cursor += 1
    }
    const text = joinCueTextLines(textLines.map((line) => stripVttMarkup(line)))
    if (text) {
      cues.push({lineNumber: cues.length + 1, startMs, endMs, text})
    }
  }
  return cues
}
// #endregion

// #region 小工具: 毫秒格式化/文件扩展名推断/工作池
// 毫秒时间戳格式化为 HH:MM:SS.mmm
function formatTimestampMs(totalMs: number): string {
  const padded = (value: number, length = 2) => String(value).padStart(length, '0')
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${padded(hours)}:${padded(minutes)}:${padded(seconds)}.${padded(millis, 3)}`
}

// 从音频输出 URL 路径推断文件扩展名(无扩展名时回退 mp3)
function inferAudioExtension(outputUrl: string): string {
  let pathname = ''
  try {
    pathname = new URL(outputUrl).pathname
  } catch {
    pathname = ''
  }
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(pathname)
  return match ? match[1].toLowerCase() : 'mp3'
}

// 固定并发度工作池: runner 依次领取下一个任务执行, 结果顺序与输入一致
async function runWithConcurrency<ItemT, ResultT>(
  items: ItemT[],
  concurrencyLimit: number,
  worker: (item: ItemT, index: number) => Promise<ResultT>,
): Promise<ResultT[]> {
  const results = Array.from({length: items.length}) as ResultT[]
  let nextIndex = 0
  const runnerCount = Math.min(concurrencyLimit, items.length)
  const runners = Array.from({length: runnerCount}, async () => {
    while (nextIndex < items.length) {
      // 取号与自增之间无 await, 单线程下不存在竞态
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(runners)
  return results
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}
// #endregion

export default class MinimaxAudioVtt extends CompshareBaseCommand {
  static aliases = ['mm:audio:vtt', 'ma:vtt', 'ma:dub']
  static description = '读取 VTT 字幕文件批量配音并下载到指定目录'

  static examples = [
    '<%= config.bin %> <%= command.id %> subtitles.vtt --outputDir ./audio --voiceId <VOICE_ID>',
  ]

  static args = {
    vttFile: Args.string({required: false, description: 'VTT 字幕文件路径, 省略时扫描当前目录交互选择'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    outputDir: Flags.string({char: 'o', required: true, description: '配音文件保存目录'}),
    voiceSource: Flags.string({default: 'preset', description: 'preset、custom 或 asset'}),
    voiceId: Flags.string({description: '预置或自定义音色 ID, 省略时从音色列表交互选择一次'}),
    assetId: Flags.string({description: '已注册的引用音频资产 ID'}),
    language: Flags.string({default: 'ZH', description: 'ZH/EN/JA/ES/AR'}),
    speed: floatFlag({default: 1, description: '语速 (0 或 0.5-2.0)'}),
    concurrency: Flags.integer({default: 4, min: 1, max: 10, description: '提交/下载的并发数(轮询已改为列表批量查询, 不受并发数影响)'}),
    dryRun: Flags.boolean({default: false, description: '只解析字幕并展示计划, 不提交任务'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  // #region 进度显示: 仅交互终端原地单行刷新, JSON/管道模式静默
  private progressVisible = false

  private showProgress(message: string): void {
    if (this.jsonOutput || !process.stdout.isTTY) {
      return
    }
    this.progressVisible = true
    process.stdout.write(`\r${message}\u001b[K`)
  }

  private endProgress(): void {
    if (this.progressVisible) {
      process.stdout.write('\n')
      this.progressVisible = false
    }
  }
  // #endregion

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioVtt)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)

    // #region 参数校验
    if (!AUDIO_LANGUAGES.has(flags.language)) {
      throw new UsageError(`不支持的语音语言: ${flags.language}。`)
    }
    if (!Number.isFinite(flags.speed) || (flags.speed !== 0 && !(flags.speed >= 0.5 && flags.speed <= 2))) {
      throw new UsageError('语速必须为 0 或介于 0.5 与 2.0 之间。')
    }
    if (!['asset', 'custom', 'preset'].includes(flags.voiceSource)) {
      throw new UsageError('音色来源必须是 preset、custom 或 asset。')
    }
    if (flags.voiceSource === 'asset' && (!flags.assetId || flags.voiceId)) {
      throw new UsageError('asset 音色来源需要提供 --asset-id 且不能提供 --voice-id。')
    }
    if (flags.voiceSource !== 'asset' && flags.assetId) {
      throw new UsageError('preset 或 custom 音色来源不能提供 --asset-id。')
    }
    // #endregion

    // #region 字幕文件解析: 省略参数时扫描当前目录交互选择(仅一层, 不递归)
    let vttFilePath = args.vttFile
    if (!vttFilePath) {
      const dirEntries = await readdir(process.cwd())
      const vttFileNames = dirEntries
        .filter((entryName) => entryName.toLowerCase().endsWith('.vtt'))
        .sort()
      if (vttFileNames.length === 0) {
        throw new UsageError(`当前目录没有找到 VTT 字幕文件, 请直接指定文件路径。当前目录: ${process.cwd()}`)
      }
      vttFilePath = await timedSelect({
        message: '选择 VTT 字幕文件:',
        choices: vttFileNames.map((fileName) => ({
          name: fileName,
          value: joinPath(process.cwd(), fileName),
        })),
      })
    }
    // #endregion

    // #region 解析字幕并过滤不可配音的行
    let vttContent: string
    try {
      vttContent = await readFile(vttFilePath, 'utf8')
    } catch (error) {
      throw new UsageError(`无法读取字幕文件: ${error instanceof Error ? error.message : String(error)}`)
    }
    const allCues = parseVttCues(vttContent)
    // 纯标点/空白文本无法合成语音, 跳过并提示
    const skippedLineNumbers = allCues
      .filter((cue) => !/[\p{L}\p{N}]/u.test(cue.text))
      .map((cue) => cue.lineNumber)
    const usableCues = allCues.filter((cue) => /[\p{L}\p{N}]/u.test(cue.text))
    const oversizedCues = usableCues.filter((cue) => cue.text.length > 2000)
    if (oversizedCues.length > 0) {
      const numbers = oversizedCues.map((cue) => cue.lineNumber).join('、')
      throw new UsageError(`以下字幕行超过 2000 字符, 请拆分后重试: 第 ${numbers} 行。`)
    }
    if (usableCues.length === 0) {
      throw new UsageError('字幕文件中没有可用于配音的文本行。')
    }
    // #endregion

    // #region 音色解析(整批共用一个音色; dry-run 不做交互)
    let voice: Record<string, unknown>
    if (flags.voiceSource === 'asset') {
      voice = {source: 'asset', asset_id: flags.assetId}
    } else {
      const voiceId = flags.voiceId ?? (flags.dryRun ? '' : await selectVoiceIdInteractively(client, flags.voiceSource))
      if (!voiceId) {
        throw new UsageError('试运行模式需要显式提供 --voice-id。')
      }
      voice = {source: flags.voiceSource, voice_id: voiceId}
    }
    // #endregion

    // #region 计划展示与确认
    const absoluteOutputDir = resolvePath(flags.outputDir)
    // 计费按有效字符(不含标点)线性计, 每字符 0.01 积分
    const totalValidChars = usableCues.reduce(
      (sum, cue) => sum + cue.text.replace(/[^\p{L}\p{N}]/gu, '').length,
      0,
    )
    const estimatedPoints = Math.round(totalValidChars * 0.01 * 100) / 100
    const planFields: Array<[string, unknown]> = [
      ['字幕文件', vttFilePath],
      ['配音行数', usableCues.length],
      ['跳过行数', skippedLineNumbers.length > 0 ? `${skippedLineNumbers.length} (第 ${skippedLineNumbers.join('、')} 行)` : 0],
      ['有效字符', totalValidChars],
      ['预估积分', `≈ ${estimatedPoints}`],
      ['输出目录', absoluteOutputDir],
      ['音色来源', flags.voiceSource],
      ['VOICE ID', flags.voiceSource === 'asset' ? flags.assetId : flags.voiceId],
      ['语言', flags.language],
      ['语速', flags.speed],
      ['并发数', flags.concurrency],
    ]
    if (flags.dryRun) {
      context.renderer.details('批量配音计划(试运行)', planFields, {
        dry_run: true,
        cues: usableCues.map((cue) => ({
          line: cue.lineNumber,
          start: formatTimestampMs(cue.startMs),
          end: formatTimestampMs(cue.endMs),
          text: cue.text,
        })),
      })
      return
    }
    await confirmDetails(context, '批量配音计划', planFields, '确认开始批量配音?', flags.yes)
    await mkdir(absoluteOutputDir, {recursive: true})
    // #endregion

    // #region 批量提交语音任务
    let submitFinishedCount = 0
    const jobResults = await runWithConcurrency(usableCues, flags.concurrency, async (cue): Promise<CueJobResult> => {
      try {
        const response = await client.request('POST', MINIMAX_AUDIO_PATH, {
          body: {
            text: cue.text,
            language: flags.language,
            voice,
            speed: flags.speed,
            auto_emotion: true,
            emotion_strength: 0.8,
          },
          idempotencyKey: newIdempotencyKey(),
        })
        const taskId = typeof response.task_id === 'string' ? response.task_id : ''
        if (!taskId) {
          return {cue, status: 'failed', pointCost: 0, error: 'API 未返回任务 ID'}
        }
        return {cue, taskId, status: 'pending', pointCost: 0}
      } catch (error) {
        // SilentExit 的消息已由渲染器输出, 此处只记录占位说明
        const message = error instanceof SilentExit
          ? '请求被 API 拒绝(详见上方错误输出)'
          : error instanceof Error ? error.message : String(error)
        return {cue, status: 'failed', pointCost: 0, error: message}
      } finally {
        submitFinishedCount += 1
        this.showProgress(`提交任务 ${submitFinishedCount}/${usableCues.length}`)
      }
    })
    this.endProgress()
    // #endregion

    // #region 轮询任务直至全部到达终态
    // 用列表接口批量拉取(每轮仅 1~数个请求)代替逐任务单查, 大幅降低限流压力
    const pendingResults = new Map<string, CueJobResult>()
    for (const result of jobResults) {
      if (result.taskId) {
        pendingResults.set(result.taskId, result)
      }
    }
    const totalSubmitted = pendingResults.size
    let settledCount = 0
    let consecutiveBrokenRounds = 0
    const pollDeadline = Date.now() + MAX_POLL_DURATION_MS
    // 从任务记录结算一条本地结果(仅处理终态)
    const settleTaskRecord = (taskId: string, task: Record<string, unknown>): void => {
      const status = String(task.status ?? '')
      if (!TERMINAL_AUDIO_STATUSES.has(status)) {
        return
      }
      const result = pendingResults.get(taskId)
      pendingResults.delete(taskId)
      if (!result) {
        return
      }
      settledCount += 1
      if (status === 'succeeded') {
        const outputUrl = typeof task.output_url === 'string' ? task.output_url : ''
        const pointCost = Number(task.point_cost)
        result.status = outputUrl ? 'succeeded' : 'failed'
        result.outputUrl = outputUrl || undefined
        result.pointCost = Number.isFinite(pointCost) ? pointCost : 0
        if (!outputUrl) {
          result.error = '任务成功但未返回音频地址'
        }
      } else {
        result.status = 'failed'
        result.error = String(task.error_message ?? `任务终态: ${status}`)
      }
    }
    while (pendingResults.size > 0) {
      if (Date.now() > pollDeadline) {
        throw new UsageError('等待语音任务完成超时, 可稍后通过 minimax audio list 查询任务状态。')
      }
      await sleep(POLL_INTERVAL_MS)
      // 逐页拉取列表并按 task_id 匹配, 本轮找齐全部 pending 即提前停止翻页
      let pageOffset = 0
      let hasMorePages = true
      let brokenPageCount = 0
      let okPageCount = 0
      while (hasMorePages && pendingResults.size > 0) {
        let response: Record<string, unknown>
        try {
          response = await client.request('GET', MINIMAX_AUDIO_PATH, {
            query: {offset: pageOffset, limit: POLL_PAGE_SIZE},
          })
          okPageCount += 1
        } catch {
          // 单页查询失败不中断整批, 下一轮重试
          brokenPageCount += 1
          break
        }
        const items = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
        for (const item of items) {
          const taskId = String(item.task_id ?? '')
          if (pendingResults.has(taskId)) {
            settleTaskRecord(taskId, item)
          }
        }
        pageOffset += items.length
        // (items.length === 页大小) 才可能还有下一页, 防御 total 缺失的情况
        hasMorePages = items.length === POLL_PAGE_SIZE
      }
      // 整轮所有页请求均失败视为网络异常, 连续多轮后中止避免死循环
      if (okPageCount === 0 && brokenPageCount > 0) {
        consecutiveBrokenRounds += 1
        if (consecutiveBrokenRounds >= 5) {
          throw new UsageError('查询任务状态连续失败, 请检查网络后重试。')
        }
      } else {
        consecutiveBrokenRounds = 0
      }
      this.showProgress(`任务完成 ${settledCount}/${totalSubmitted}`)
    }
    this.endProgress()
    // #endregion

    // #region 下载配音文件到输出目录
    const downloadTargets = jobResults.filter(
      (result): result is CueJobResult & {outputUrl: string} =>
        result.status === 'succeeded' && result.outputUrl !== undefined && result.outputUrl.length > 0,
    )
    let downloadFinishedCount = 0
    await runWithConcurrency(downloadTargets, flags.concurrency, async (target) => {
      const fileName = `${String(target.cue.lineNumber).padStart(4, '0')}.${inferAudioExtension(target.outputUrl)}`
      const filePath = joinPath(absoluteOutputDir, fileName)
      try {
        const response = await fetch(target.outputUrl, {signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)})
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        await writeFile(filePath, Buffer.from(await response.arrayBuffer()))
        target.fileName = fileName
        target.filePath = filePath
      } catch (error) {
        target.status = 'failed'
        target.error = `下载失败: ${error instanceof Error ? error.message : String(error)}`
      } finally {
        downloadFinishedCount += 1
        this.showProgress(`下载配音 ${downloadFinishedCount}/${downloadTargets.length}`)
      }
    })
    this.endProgress()
    // #endregion

    // #region 汇总输出
    const succeededResults = jobResults.filter((result) => result.status === 'succeeded')
    const failedResults = jobResults.filter((result) => result.status === 'failed')
    const actualPoints = Math.round(jobResults.reduce((sum, result) => sum + result.pointCost, 0) * 100) / 100
    if (this.jsonOutput) {
      context.renderer.data({
        output_dir: absoluteOutputDir,
        total_lines: allCues.length,
        dubbed_lines: usableCues.length,
        skipped_lines: skippedLineNumbers.length,
        succeeded: succeededResults.length,
        failed: failedResults.length,
        total_points: actualPoints,
        items: jobResults.map((result) => ({
          line: result.cue.lineNumber,
          start: formatTimestampMs(result.cue.startMs),
          end: formatTimestampMs(result.cue.endMs),
          text: result.cue.text,
          task_id: result.taskId ?? '',
          status: result.status,
          file: result.filePath ?? '',
          error: result.error ?? '',
        })),
      })
    } else {
      context.renderer.details('批量配音完成', [
        ['输出目录', absoluteOutputDir],
        ['字幕行数', `${usableCues.length}/${allCues.length}`],
        ['成功', succeededResults.length],
        ['失败', failedResults.length],
        ['消耗积分', actualPoints],
      ])
      context.renderer.table(
        jobResults.map((result) => ({
          line: result.cue.lineNumber,
          time: `${formatTimestampMs(result.cue.startMs)} --> ${formatTimestampMs(result.cue.endMs)}`,
          status: result.status,
          file: result.fileName ?? '-',
          task_id: result.taskId ?? '-',
          error: result.error ?? '-',
        })),
        BATCH_RESULT_COLUMNS,
      )
    }
    if (failedResults.length > 0) {
      process.exitCode = 1
    }
    // #endregion
  }
}
