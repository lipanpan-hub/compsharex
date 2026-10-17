// cps minimax create: 创建 MiniMax H3 视频任务

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {MINIMAX_CALLBACK_TOKEN_ENV, MiniMaxClient, newIdempotencyKey} from '../../lib/compshare/minimax-api.js'
import {MINIMAX_MODELS, MINIMAX_RATIOS, MINIMAX_RESOLUTIONS, videoContent} from '../../lib/compshare/minimax-helpers.js'
import {UsageError} from '../../lib/compshare/errors.js'

export default class MinimaxCreate extends CompshareBaseCommand {
  static aliases = ['mm:create', 'mm:new']
  static description = '创建 MiniMax H3 视频任务'

  static examples = ['<%= config.bin %> <%= command.id %> "一只猫在草地上奔跑" --resolution 1080P']

  static args = {
    prompt: Args.string({default: '', description: '视频提示词, 最多 7000 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    model: Flags.string({default: 'MiniMax-H3', description: '模型: MiniMax-H3 或 minimax-h3-lite'}),
    resolution: Flags.string({default: '768P', description: '分辨率: 480P/768P/1080P/2K/4K'}),
    duration: Flags.integer({default: 5, min: 4, max: 30, description: '视频时长, 单位秒 (4-30)'}),
    ratio: Flags.string({default: '16:9', description: '画面比例或 adaptive'}),
    firstFrame: Flags.string({description: '首帧图片 URL 或 Data URL'}),
    lastFrame: Flags.string({description: '尾帧图片 URL 或 Data URL'}),
    referenceImage: Flags.string({multiple: true, description: '引用图片 URL 或 Data URL, 可重复'}),
    referenceVideo: Flags.string({multiple: true, description: '引用视频 URL 或 Data URL, 可重复'}),
    referenceAudio: Flags.string({multiple: true, description: '引用音频 URL 或 Data URL, 可重复'}),
    contextIr: Flags.boolean({allowNo: true, default: false, description: '启用 Context-IR 提示词优化'}),
    skillId: Flags.string({description: '技能 ID, 需要配合 --context-ir'}),
    muteAudio: Flags.boolean({default: false, description: '移除视频音轨'}),
    watermark: Flags.boolean({default: false, description: '添加 AIGC 水印'}),
    callbackUrl: Flags.string({description: '任务回调 URL'}),
    idempotencyKey: Flags.string({description: '幂等键, 缺省自动生成'}),
    dryRun: Flags.boolean({default: false, description: '只展示请求, 不创建任务'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxCreate)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    if (!MINIMAX_MODELS.has(flags.model)) {
      throw new UsageError(`不支持的视频模型: ${flags.model}。`)
    }
    if (!MINIMAX_RESOLUTIONS.has(flags.resolution)) {
      throw new UsageError('--resolution 必须是 480P、768P、1080P、2K 或 4K。')
    }
    if (!MINIMAX_RATIOS.has(flags.ratio)) {
      throw new UsageError(`不支持的视频比例: ${flags.ratio}。`)
    }
    if (flags.skillId && !flags.contextIr) {
      throw new UsageError('--skill-id 需要同时启用 --context-ir。')
    }

    const payload: Record<string, unknown> = {
      model: flags.model,
      content: videoContent({
        prompt: args.prompt ?? '',
        firstFrame: flags.firstFrame,
        lastFrame: flags.lastFrame,
        referenceImages: flags.referenceImage ?? [],
        referenceVideos: flags.referenceVideo ?? [],
        referenceAudios: flags.referenceAudio ?? [],
      }),
      resolution: flags.resolution,
      duration: flags.duration,
      ratio: flags.ratio,
      aigc_watermark: flags.watermark,
    }
    if (flags.contextIr) {
      payload.use_context_ir = true
    }
    if (flags.skillId) {
      payload.skill_id = flags.skillId
    }
    if (flags.muteAudio) {
      payload.mute_audio = true
    }
    if (flags.callbackUrl) {
      payload.callback_url = flags.callbackUrl
      const callbackToken = (process.env[MINIMAX_CALLBACK_TOKEN_ENV] ?? '').trim()
      if (callbackToken) {
        payload.callback_token = callbackToken
      }
    }

    const key = newIdempotencyKey(flags.idempotencyKey)
    const fields: Array<[string, unknown]> = [
      ['MODEL', flags.model],
      ['RESOLUTION', flags.resolution],
      ['DURATION', `${flags.duration}s`],
      ['RATIO', flags.ratio],
      ['IDEMPOTENCY KEY', key],
    ]
    if (flags.dryRun) {
      context.renderer.details('创建计划', fields, {dry_run: true, idempotency_key: key, request: payload})
      return
    }
    await confirmDetails(context, '创建计划', fields, '确认本次操作?', flags.yes)
    const response = await client.request('POST', '/minimax/v2/video_generation', {
      body: payload,
      idempotencyKey: key,
    })
    context.renderer.details(
      '任务已提交',
      [
        ['TASK ID', response.task_id],
        ['IDEMPOTENCY KEY', key],
      ],
      {...response, idempotency_key: key},
    )
  }
}
