// minimax 命令组共享工具(移植自 commands/minimax.py 内部函数)

import {statSync, readFileSync} from 'node:fs'

import {Flags} from '@oclif/core'

import {timedSelect} from '../prompts.js'
import {confirmDetails} from './confirm.js'
import type {CompshareContext} from './context.js'
import {UsageError} from './errors.js'
import {MiniMaxClient} from './minimax-api.js'

// #region 常量与列定义
// oclif 内置数值 flag 仅支持整数, 这里定义浮点数解析(音频语速等场景共用)
export const floatFlag = Flags.custom<number>({
  parse: async (input) => {
    const value = Number(input)
    if (!Number.isFinite(value)) {
      throw new TypeError(`无效的数值: ${input}。`)
    }
    return value
  },
})

export const MINIMAX_RESOLUTIONS = new Set(['2K', '4K', '480P', '768P', '1080P'])
export const MINIMAX_MODELS = new Set(['MiniMax-H3', 'minimax-h3-lite'])
export const MINIMAX_RATIOS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', 'adaptive'])
export const MINIMAX_STATUSES = new Set(['cancelled', 'failed', 'queued', 'running', 'succeeded'])

export const VIDEO_TASK_COLUMNS = [
  ['id', 'TASK ID'],
  ['status', 'STATUS'],
  ['resolution', 'RESOLUTION'],
  ['duration', 'DURATION'],
  ['ratio', 'RATIO'],
  ['estimated_remaining_seconds', 'REMAINING (s)'],
] as const satisfies readonly (readonly [string, string])[]

export const PACKAGE_COLUMNS = [
  ['id', 'PACKAGE ID'],
  ['name', 'NAME'],
  ['status', 'STATUS'],
  ['total_points', 'TOTAL POINTS'],
  ['reserved_points', 'RESERVED POINTS'],
  ['available_points', 'AVAILABLE POINTS'],
  ['expires_at', 'EXPIRES'],
] as const satisfies readonly (readonly [string, string])[]

export const MINIMAX_IMAGE_PATH = '/image/v1/tasks'
export const IMAGE_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'])
export const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
export const MEDIA_TASK_COLUMNS = [
  ['task_id', 'TASK ID'],
  ['status', 'STATUS'],
  ['point_cost', 'POINTS'],
  ['created_at', 'CREATED'],
] as const satisfies readonly (readonly [string, string])[]

export const MINIMAX_AUDIO_PATH = '/audio/v1/speech/jobs'
export const AUDIO_LANGUAGES = new Set(['AR', 'EN', 'ES', 'JA', 'ZH'])
export const AUDIO_MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}
export const VOICE_COLUMNS = [
  ['voice_id', 'VOICE ID'],
  ['kind', 'KIND'],
  ['name', 'NAME'],
  ['language', 'LANGUAGE'],
] as const satisfies readonly (readonly [string, string])[]

export const MINIMAX_SKILL_PATH = '/minimax/v2/skills'
export const SKILL_COLUMNS = [
  ['id', 'SKILL ID'],
  ['name', 'NAME'],
  ['official', 'OFFICIAL'],
  ['description', 'DESCRIPTION'],
] as const satisfies readonly (readonly [string, string])[]
// #endregion

// 组装视频生成 content 数组并校验组合约束
export function videoContent(options: {
  firstFrame?: string
  lastFrame?: string
  prompt: string
  referenceAudios: string[]
  referenceImages: string[]
  referenceVideos: string[]
}): Array<Record<string, unknown>> {
  const {firstFrame, lastFrame, referenceImages, referenceVideos, referenceAudios} = options
  const text = options.prompt.trim()
  if (text.length > 7000) {
    throw new UsageError('提示词不能超过 7000 个字符。')
  }
  const hasFrameInput = firstFrame !== undefined || lastFrame !== undefined
  const hasReferenceInput = referenceImages.length + referenceVideos.length + referenceAudios.length > 0
  if (hasFrameInput && hasReferenceInput) {
    throw new UsageError('首尾帧输入不能与引用素材同时使用。')
  }
  if (!text && !hasFrameInput && !hasReferenceInput) {
    throw new UsageError('提示词不能为空。')
  }
  if (referenceImages.length + referenceVideos.length + referenceAudios.length > 12) {
    throw new UsageError('引用素材最多 12 个。')
  }
  if (referenceAudios.length > 0 && referenceImages.length + referenceVideos.length === 0) {
    throw new UsageError('引用音频必须至少搭配一个引用图片或视频。')
  }
  const limits: Array<[string[], number, string]> = [
    [referenceImages, 9, '--reference-image'],
    [referenceVideos, 3, '--reference-video'],
    [referenceAudios, 3, '--reference-audio'],
  ]
  for (const [values, maximum, option] of limits) {
    if (values.length > maximum) {
      throw new UsageError(`${option} 最多指定 ${maximum} 次。`)
    }
  }

  const items: Array<Record<string, unknown>> = []
  if (text) {
    items.push({type: 'text', text})
  }
  if (firstFrame) {
    items.push({type: 'image_url', image_url: {url: firstFrame}, role: 'first_frame'})
  }
  if (lastFrame) {
    items.push({type: 'image_url', image_url: {url: lastFrame}, role: 'last_frame'})
  }
  for (const url of referenceImages) {
    items.push({type: 'image_url', image_url: {url}, role: 'reference_image'})
  }
  for (const url of referenceVideos) {
    items.push({type: 'video_url', video_url: {url}, role: 'reference_video'})
  }
  for (const url of referenceAudios) {
    items.push({type: 'audio_url', audio_url: {url}, role: 'reference_audio'})
  }
  return items
}

// 任务资源路径(taskId 全量转义)
export function taskPath(prefix: string, taskId: string): string {
  return `${prefix}/${encodeURIComponent(taskId)}`
}

// 未提供 --voice-id 时的回退: 拉取同类型音色列表交互式单选
export async function selectVoiceIdInteractively(client: MiniMaxClient, kind: string): Promise<string> {
  const response = await client.request('GET', '/audio/v1/voices', {query: {kind}})
  const voiceItems = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
  if (voiceItems.length === 0) {
    throw new UsageError(`没有可用的 ${kind} 音色, 请改用 --voice-id 显式指定。`)
  }
  return timedSelect({
    message: `选择 ${kind} 音色:`,
    choices: voiceItems.map((item) => ({
      name: [item.voice_id, item.name, item.language].filter(Boolean).join(' | '),
      value: String(item.voice_id),
    })),
  })
}

// 提交流程: dry-run 展示 → 确认 → POST → 展示任务 ID
export async function submitTask(
  context: CompshareContext,
  client: MiniMaxClient,
  path: string,
  payload: Record<string, unknown>,
  key: string,
  dryRun: boolean,
  yes: boolean,
  fields: Array<[string, unknown]>,
): Promise<void> {
  if (dryRun) {
    context.renderer.details('创建计划', fields, {dry_run: true, idempotency_key: key, request: payload})
    return
  }
  await confirmDetails(context, '创建计划', fields, '确认本次操作?', yes)
  const response = await client.request('POST', path, {body: payload, idempotencyKey: key})
  context.renderer.details(
    '任务已提交',
    [
      ['TASK ID', response.task_id],
      ['IDEMPOTENCY KEY', key],
    ],
    {...response, idempotency_key: key},
  )
}

// 媒体任务通用操作(cancel 走 POST 子路径, delete 走 DELETE)
export async function mediaAction(
  context: CompshareContext,
  client: MiniMaxClient,
  prefix: string,
  taskId: string,
  action: 'cancel' | 'delete',
  yes: boolean,
): Promise<void> {
  const path = taskPath(prefix, taskId)
  const current = await client.request('GET', path)
  const task = isRecord(current.task) ? current.task : {}
  await confirmDetails(
    context,
    '操作计划',
    [
      ['TASK ID', taskId],
      ['STATUS', task.status],
      ['ACTION', action],
    ],
    '确认本次操作?',
    yes,
  )
  const [method, target] = action === 'cancel' ? (['POST', `${path}/cancel`] as const) : (['DELETE', path] as const)
  const response = await client.request(method, target)
  context.renderer.details(
    '任务已提交',
    [
      ['TASK ID', response.task_id ?? taskId],
      ['ACTION', action],
    ],
    response,
  )
}

// 上传引用素材: 预签名 URL 直传后注册资产
export async function uploadAsset(
  context: CompshareContext,
  client: MiniMaxClient,
  kind: string,
  filePath: string,
  contentType: string,
  limit: number,
  extra: Record<string, number>,
  yes: boolean,
): Promise<void> {
  let size: number
  try {
    size = statSync(filePath).size
  } catch (error) {
    throw new UsageError(String(error instanceof Error ? error.message : error))
  }
  if (size <= 0 || size > limit) {
    throw new UsageError(`文件大小必须在 1 到 ${limit} 字节之间。`)
  }
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  await confirmDetails(
    context,
    '上传计划',
    [
      ['FILE', filePath],
      ['SIZE', size],
      ['CONTENT TYPE', contentType],
    ],
    '确认本次操作?',
    yes,
  )
  const details: Record<string, unknown> = {file_name: fileName, content_type: contentType, file_size: size}
  const response = await client.request('POST', `/${kind}/v1/upload_urls`, {body: details})
  const uploadUrl = response.upload_url
  const objectKey = response.object_key
  let parsedUrl: URL
  try {
    parsedUrl = new URL(String(uploadUrl))
  } catch {
    parsedUrl = new URL('https://invalid')
  }
  if (typeof uploadUrl !== 'string' || parsedUrl.protocol !== 'https:') {
    client.fail('invalid_response', 'API 返回了无效的上传 URL。')
  }
  if (typeof objectKey !== 'string' || !objectKey) {
    client.fail('invalid_response', 'API 未返回上传对象键。')
  }
  const headers: Record<string, string> = {'Content-Type': contentType}
  if (kind === 'image') {
    const credentialMapping: Array<[string, string]> = [
      ['authorization', 'Authorization'],
      ['bucket', 'bucket'],
      ['region', 'ufile_indicated_region'],
    ]
    for (const [field, header] of credentialMapping) {
      const value = response[field]
      if (typeof value !== 'string' || !value) {
        client.fail('invalid_response', 'API 返回的上传凭证不完整。')
      }
      headers[header] = value
    }
  }
  const bytes = readFileSync(filePath)
  if (bytes.length !== size) {
    throw new UsageError('准备上传期间文件发生了变化。')
  }
  await client.putBytes(String(uploadUrl), bytes, headers)
  const registered = await client.request('POST', `/${kind}/v1/assets`, {
    body: {...details, object_key: objectKey, ...extra},
  })
  context.renderer.data(registered)
}

// 校验并构造 Skill 请求体(整体不超过 64 KiB)
export function skillPayload(name: string, content: string, description: string): Record<string, string> {
  const payload = {name: name.trim(), content, description: description.trim()}
  if (!payload.name || !content.trim()) {
    throw new UsageError('Skill 名称与内容不能为空。')
  }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 64 * 1024) {
    throw new UsageError('Skill 请求不能超过 64 KiB。')
  }
  return payload
}

// 校验八元情感向量(取值 0-0.8, 和 0-0.8; single 模式仅一个非零)
export function emotionValues(raw: string, mode?: string): number[] {
  const values = raw.split(',').map((part) => {
    const value = Number(part.trim())
    return Number.isFinite(value) ? value : Number.NaN
  })
  if (values.some((value) => Number.isNaN(value))) {
    throw new UsageError('情感向量必须包含八个数字。')
  }
  // (value >= 0 && value <= 0.8) 逐项校验取值范围
  if (values.length !== 8 || values.some((value) => !(value >= 0 && value <= 0.8))) {
    throw new UsageError('情感向量必须包含八个介于 0 与 0.8 之间的值。')
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!(total > 0 && total <= 0.8)) {
    throw new UsageError('情感向量之和必须大于 0 且不超过 0.8。')
  }
  if (mode === 'single' && values.filter((value) => value > 0).length !== 1) {
    throw new UsageError('single 情感向量模式要求恰好一个非零值。')
  }
  return values
}

// 校验发音规则列表(WORD:KIND:VALUE, 词不重复)
export function pronunciationRules(raw: string[]): Array<Record<string, string>> {
  if (raw.length > 100) {
    throw new UsageError('发音规则最多 100 条。')
  }
  const rules: Array<Record<string, string>> = []
  const seen = new Set<string>()
  for (const item of raw) {
    const parts = item.split(':', 3)
    if (parts.length !== 3) {
      throw new UsageError('发音规则必须为 WORD:KIND:VALUE。')
    }
    const [word, kind, value] = parts.map((part) => part.trim())
    if (word.length === 0 || word.length > 64 || !['alias', 'cmu', 'kana', 'pinyin'].includes(kind)) {
      throw new UsageError('无效的发音词或规则类型。')
    }
    if (value.length === 0 || value.length > 512 || seen.has(word)) {
      throw new UsageError('无效或重复的发音规则。')
    }
    seen.add(word)
    rules.push({word, kind, value})
  }
  return rules
}

// 严格判断为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
