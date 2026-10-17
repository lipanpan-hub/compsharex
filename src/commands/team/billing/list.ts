// cps team billing list: 列出团队成员订单

import {Args, Flags} from '@oclif/core'

import {collectPages} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {compact, splitCsv} from '../../../lib/compshare/parsing.js'
import {ORDER_COLUMNS, billingParams, orderSort} from '../../../lib/compshare/team-helpers.js'

export default class BillingList extends CompshareBaseCommand {
  static description = "列出团队成员订单"

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <MEMBER_ID> --start 30d']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    member: Args.integer({required: true, description: '虚拟成员 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
    charge: Flags.string({multiple: true, description: '计费类型, 可重复'}),
    status: Flags.string({multiple: true, description: '订单状态, 可重复'}),
    resource: Flags.string({multiple: true, description: '资源 ID, 可重复'}),
    sort: Flags.string({default: 'create_time', description: '订单排序字段'}),
    ascending: Flags.boolean({default: false, description: '升序排列'}),
    limit: Flags.integer({default: 25, min: 1, max: 100, description: '返回条数上限'}),
    offset: Flags.integer({default: 0, min: 0, description: '跳过条数'}),
    all: Flags.boolean({default: false, description: '返回全部结果'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BillingList)
    const context = this.compshareContext()
    const params = billingParams(context, args.team, args.member, flags.start, flags.end)
    Object.assign(
      params,
      compact({
        ChargeTypes: splitCsv(flags.charge ?? []).length > 0 ? splitCsv(flags.charge ?? []) : null,
        OrderStates: splitCsv(flags.status ?? []).length > 0 ? splitCsv(flags.status ?? []) : null,
        ResourceIds: splitCsv(flags.resource ?? []).length > 0 ? splitCsv(flags.resource ?? []) : null,
        OrderBy: orderSort(flags.sort),
        OrderDir: flags.ascending ? 'ASC' : 'DESC',
      }),
    )
    const response = await collectPages(context, 'DescribeTeamMemberOrder', params, 'OrderInfos', {
      offset: flags.offset,
      limit: flags.all ? null : flags.limit,
    })
    const rows = (response.OrderInfos as Array<Record<string, unknown>>) ?? []
    context.renderer.data(response, {rows, columns: ORDER_COLUMNS, jsonList: true, metadata: {all: flags.all}})
  }
}
