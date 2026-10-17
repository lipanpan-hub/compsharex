// cps team billing summary: 查看团队成员订单汇总

import {Args, Flags} from '@oclif/core'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {billingParams} from '../../../lib/compshare/team-helpers.js'

export default class BillingSummary extends CompshareBaseCommand {
  static description = '查看团队成员订单汇总'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <MEMBER_ID> --start 30d']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    member: Args.integer({required: true, description: '虚拟成员 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BillingSummary)
    const context = this.compshareContext()
    const response = await call(
      context,
      'DescribeTeamMemberOrderCount',
      billingParams(context, args.team, args.member, flags.start, flags.end),
    )
    context.renderer.details(
      '账单汇总',
      [
        ['COUNT', response.TotalCount],
        ['AMOUNT', response.Amount],
        ['PAID', response.AmountReal],
        ['FREE', response.AmountFree],
        ['COUPON', response.AmountCoupon],
      ],
      response,
    )
  }
}
