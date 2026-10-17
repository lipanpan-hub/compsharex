// cps minimax image create: 创建 Qwen-Image 图像任务

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient, newIdempotencyKey} from '../../../lib/compshare/minimax-api.js'
import {IMAGE_RATIOS, MINIMAX_IMAGE_PATH, submitTask} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxImageCreate extends CompshareBaseCommand {
  static description = '创建 Qwen-Image 图像任务'

  static examples = ['<%= config.bin %> <%= command.id %> "赛博朋克风格的城市夜景" --resolution 2K']

  static args = {
    prompt: Args.string({required: true, description: '图像提示词, 最多 7000 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    resolution: Flags.string({default: '2K', description: '图像分辨率: 1K 或 2K'}),
    ratio: Flags.string({default: '1:1', description: '图像宽高比'}),
    referenceAsset: Flags.string({multiple: true, description: '已注册的引用图片资产 ID, 可重复'}),
    optimizePrompt: Flags.boolean({default: false, description: '优化提示词'}),
    idempotencyKey: Flags.string({description: '幂等键'}),
    dryRun: Flags.boolean({default: false, description: '只展示请求'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxImageCreate)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const referenceAssets = flags.referenceAsset ?? []
    if (!args.prompt.trim() || args.prompt.length > 7000) {
      throw new UsageError('图像提示词必须包含 1-7000 个字符。')
    }
    if (!['1K', '2K'].includes(flags.resolution)) {
      throw new UsageError('图像分辨率必须是 1K 或 2K。')
    }
    if (!IMAGE_RATIOS.has(flags.ratio)) {
      throw new UsageError(`不支持的图像比例: ${flags.ratio}。`)
    }
    if (referenceAssets.length > 10) {
      throw new UsageError('引用图片最多 10 张。')
    }
    const payload: Record<string, unknown> = {
      prompt: args.prompt,
      resolution: flags.resolution,
      aspect_ratio: flags.ratio,
      optimize_prompt: flags.optimizePrompt,
    }
    if (referenceAssets.length > 0) {
      payload.reference_images = referenceAssets.map((assetId) => ({asset_id: assetId}))
    }
    await submitTask(
      context,
      client,
      MINIMAX_IMAGE_PATH,
      payload,
      newIdempotencyKey(flags.idempotencyKey),
      flags.dryRun,
      flags.yes,
      [
        ['RESOLUTION', flags.resolution],
        ['RATIO', flags.ratio],
        ['REFERENCES', referenceAssets.length],
      ],
    )
  }
}
