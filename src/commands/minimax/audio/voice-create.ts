// cps minimax audio voice-create: 将引用资产保存为自定义音色

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient, newIdempotencyKey} from '../../../lib/compshare/minimax-api.js'

export default class MinimaxAudioVoiceCreate extends CompshareBaseCommand {
  static description = '将引用资产保存为自定义音色'

  static examples = ['<%= config.bin %> <%= command.id %> <ASSET_ID> <NAME>']

  static args = {
    assetId: Args.string({required: true, description: '已注册的引用音频资产 ID'}),
    name: Args.string({required: true, description: '自定义音色名称'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    idempotencyKey: Flags.string({description: '幂等键'}),
    dryRun: Flags.boolean({default: false, description: '只展示请求'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioVoiceCreate)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    if (!(args.name.trim().length > 0 && args.name.trim().length <= 64)) {
      throw new UsageError('音色名称必须包含 1-64 个字符。')
    }
    const key = newIdempotencyKey(flags.idempotencyKey)
    const payload = {asset_id: args.assetId, name: args.name.trim()}
    const fields: Array<[string, unknown]> = [
      ['ASSET ID', args.assetId],
      ['VOICE NAME', args.name],
      ['IDEMPOTENCY KEY', key],
    ]
    if (flags.dryRun) {
      context.renderer.details('创建计划', fields, {dry_run: true, idempotency_key: key, request: payload})
      return
    }
    await confirmDetails(context, '创建计划', fields, '确认本次操作?', flags.yes)
    const response = await client.request('POST', '/audio/v1/voices', {body: payload, idempotencyKey: key})
    context.renderer.data({...response, idempotency_key: key})
  }
}
