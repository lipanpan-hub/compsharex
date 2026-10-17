// cps team billing unpaid: 列出并汇总团队成员未支付订单

import {Args, Flags} from '@oclif/core'

import {call, collectPages} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {ORDER_COLUMNS, billingParams} from '../../../lib/compshare/team-helpers.js'

export default class BillingUnpaid extends CompshareBaseCommand {
  static aliases = ['tm:billing:unpaid']
  static description = '列出并汇总团队成员未支付订单'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <MEMBER_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    member: Args.integer({required: true, description: '虚拟成员 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
    limit: Flags.integer({default: 25, min: 1, max: 100, description: '返回条数上限'}),
    offset: Flags.integer({default: 0, min: 0, description: '跳过条数'}),
    all: Flags.boolean({default: false, description: '返回全部结果'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BillingUnpaid)
    const context = this.compshareContext()
    const params = billingParams(context, args.team, args.member, flags.start, flags.end)
    const orders = await collectPages(context, 'DescribeTeamMemberUnpaidOrder', params, 'OrderInfos', {
      offset: flags.offset,
      limit: flags.all ? null : flags.limit,
    })
    const summary = await call(context, 'DescribeTeamMemberUnpaidOrderCount', params)
    const response = {orders, summary}
    if (context.jsonOutput) {
      context.renderer.data(response)
      return
    }
    context.renderer.details('未支付汇总', [
      ['COUNT', summary.TotalCount],
      ['AMOUNT', summary.Amount],
    ])
    context.renderer.table((orders.OrderInfos as Array<Record<string, unknown>>) ?? [], ORDER_COLUMNS)
  }
}
