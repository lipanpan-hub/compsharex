// cps bandwidth create: 报价后购买独立带宽

import {Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {cnyFromCents, chargeType} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class BandwidthCreate extends CompshareBaseCommand {
  static description = '报价并购买独立带宽'

  static examples = ['<%= config.bin %> <%= command.id %> --region cn-bj2 --zone cn-bj2-02 --bandwidth 100']

  static flags = {
    ...compshareGlobalFlags,
    bandwidth: Flags.integer({required: true, min: 20, max: 10_000, description: '带宽上限, 单位 Mbps (20-10000)'}),
    charge: Flags.string({default: 'Month', description: '计费类型: Month 或 Year'}),
    quantity: Flags.integer({default: 1, min: 1, description: '预付费模式的购买时长'}),
    region: Flags.string({required: true, description: '本次请求的地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
    dryRun: Flags.boolean({description: '只报价并展示请求, 不购买带宽', default: false}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BandwidthCreate)
    const context = this.compshareContext()
    const params = CompshareContext.request({zone: true, regionValue: flags.region, zoneValue: flags.zone})
    Object.assign(params, {
      ShareBandwidth: flags.bandwidth,
      ChargeType: chargeType(flags.charge),
      Quantity: flags.quantity,
    })

    const quote = await call(context, 'GetCompShareShareBandwidthPrice', params)
    const plan = {dry_run: flags.dryRun, request: params, price: quote}
    const fields: Array<[string, unknown]> = [
      ['ZONE', flags.zone],
      ['BANDWIDTH', `${flags.bandwidth} Mbps`],
      ['CHARGE', params.ChargeType as string],
      ['QUANTITY', flags.quantity],
      ['PRICE', cnyFromCents(quote.TotalPrice)],
    ]
    if (flags.dryRun) {
      context.renderer.details('创建计划', fields, plan)
      return
    }
    await confirmDetails(context, '创建计划', fields, '确认本次操作?', flags.yes)

    const created = await call(context, 'CreateCompShareShareBandwidth', params)
    const resource = (created.CompanyShareBandwidth as Record<string, unknown>) ?? {}
    context.renderer.details(
      '操作完成',
      [
        ['BANDWIDTH ID', resource.ShareBandwidthId],
        ['BANDWIDTH', `${resource.Bandwidth ?? flags.bandwidth} Mbps`],
        ['ORDER', created.OrderNo],
      ],
      {price: quote, created},
    )
  }
}
