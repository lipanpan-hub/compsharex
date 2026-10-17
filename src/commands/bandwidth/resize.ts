// cps bandwidth resize: 报价后调整独立带宽上限

import {Args, Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {cnyFromCents} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class BandwidthResize extends CompshareBaseCommand {
  static aliases = ['bw:resize']
  static description = '报价并调整独立带宽上限'

  static examples = ['<%= config.bin %> <%= command.id %> <BANDWIDTH_ID> --bandwidth 200 --region cn-bj2 --zone cn-bj2-02']

  static args = {
    bandwidthId: Args.string({required: true, description: '独立带宽 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    bandwidth: Flags.integer({required: true, min: 20, max: 10_000, description: '目标带宽上限, 单位 Mbps (20-10000)'}),
    region: Flags.string({required: true, description: '本次请求的地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
    dryRun: Flags.boolean({description: '只报价并展示请求, 不变更带宽', default: false}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BandwidthResize)
    const context = this.compshareContext()
    const params = CompshareContext.request({zone: true, regionValue: flags.region, zoneValue: flags.zone})
    Object.assign(params, {ShareBandwidthId: args.bandwidthId, ShareBandwidth: flags.bandwidth})

    const quote = await call(context, 'GetCompShareShareBandwidthUpgradePrice', params)
    const plan = {dry_run: flags.dryRun, request: params, price: quote}
    const fields: Array<[string, unknown]> = [
      ['BANDWIDTH ID', args.bandwidthId],
      ['ZONE', flags.zone],
      ['TARGET BANDWIDTH', `${flags.bandwidth} Mbps`],
      ['PRICE', cnyFromCents(quote.TotalPrice, {signed: true})],
    ]
    if (flags.dryRun) {
      context.renderer.details('操作计划', fields, plan)
      return
    }
    await confirmDetails(context, '操作计划', fields, '确认本次操作?', flags.yes)

    const modified = await call(context, 'ModifyCompShareShareBandwidth', params)
    context.renderer.details(
      '操作完成',
      [
        ['BANDWIDTH ID', args.bandwidthId],
        ['BANDWIDTH', `${flags.bandwidth} Mbps`],
      ],
      {price: quote, modified},
    )
  }
}
