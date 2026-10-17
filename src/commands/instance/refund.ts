// cps instance refund: 查询实例退款金额

import {Args} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand} from '../../lib/compshare/base.js'
import {locateInstance} from '../../lib/compshare/location.js'

export default class InstanceRefund extends CompshareBaseCommand {
  static aliases = ['ins:refund']
  static description = '查询实例退款金额'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>...']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(InstanceRefund)
    const context = this.compshareContext()
    // 按 (region, zone) 分组聚合, 一次请求查同位置的多台实例
    const groups = new Map<string, {ids: string[]; region: string; zone: string;}>()
    for (const instance of args.instances) {
      const [region, zone] = await locateInstance(context, instance)
      const key = `${region}|${zone}`
      const group = groups.get(key) ?? {region, zone, ids: []}
      group.ids.push(instance)
      groups.set(key, group)
    }
    const refundPriceSet: Array<Record<string, unknown>> = []
    for (const group of groups.values()) {
      const current = await call(context, 'GetCompShareRefundPrice', {
        Region: group.region,
        Zone: group.zone,
        UHostIds: group.ids,
      })
      refundPriceSet.push(...((current.RefundPriceSet as Array<Record<string, unknown>>) ?? []))
    }
    const response = {RefundPriceSet: refundPriceSet}
    context.renderer.data(response, {
      rows: refundPriceSet,
      columns: [
        ['UHostId', 'INSTANCE'],
        ['Code', 'CODE'],
        ['RefundPrice', 'REFUND'],
        ['Message', 'MESSAGE'],
      ],
      jsonList: true,
    })
  }
}
