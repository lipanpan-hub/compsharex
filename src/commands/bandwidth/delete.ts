// cps bandwidth delete: 报价后删除独立带宽(绑定 EIP 自动迁移到共享带宽)

import {Args, Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {cnyFromCents} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class BandwidthDelete extends CompshareBaseCommand {
  static description = '报价并删除独立带宽'

  static examples = ['<%= config.bin %> <%= command.id %> <BANDWIDTH_ID> --region cn-bj2 --zone cn-bj2-02']

  static args = {
    bandwidthId: Args.string({required: true, description: '独立带宽 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '本次请求的地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
    dryRun: Flags.boolean({description: '只报价并展示请求, 不删除带宽', default: false}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BandwidthDelete)
    const context = this.compshareContext()
    const params = CompshareContext.request({zone: true, regionValue: flags.region, zoneValue: flags.zone})
    params.ShareBandwidthId = args.bandwidthId

    const quote = await call(context, 'GetCompShareShareBandwidthRefundPrice', params)
    const plan = {dry_run: flags.dryRun, request: params, refund: quote}
    const fields: Array<[string, unknown]> = [
      ['BANDWIDTH ID', args.bandwidthId],
      ['ZONE', flags.zone],
      ['REFUND', cnyFromCents(quote.RefundPrice, {signed: true})],
      ['ACTION', '将绑定 EIP 迁移到共享带宽后删除'],
    ]
    if (flags.dryRun) {
      context.renderer.details('操作计划', fields, plan)
      return
    }
    await confirmDetails(context, '操作计划', fields, '确认本次操作?', flags.yes)

    const deleted = await call(context, 'DeleteCompShareShareBandwidth', params)
    context.renderer.details(
      '操作完成',
      [
        ['BANDWIDTH ID', args.bandwidthId],
        ['MIGRATED EIPS', deleted.MigratedEIPCount ?? 0],
      ],
      {refund: quote, deleted},
    )
  }
}
