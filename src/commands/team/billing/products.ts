// cps team billing products: 列出团队成员使用的商品类型

import {Args, Flags} from '@oclif/core'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {compact, splitCsv} from '../../../lib/compshare/parsing.js'
import {billingParams} from '../../../lib/compshare/team-helpers.js'

export default class BillingProducts extends CompshareBaseCommand {
  static aliases = ['tm:billing:products']
  static description = '列出团队成员使用的商品类型'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <MEMBER_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    member: Args.integer({required: true, description: '虚拟成员 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
    status: Flags.string({multiple: true, description: '订单状态, 可重复'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BillingProducts)
    const context = this.compshareContext()
    const params = billingParams(context, args.team, args.member, flags.start, flags.end)
    Object.assign(
      params,
      compact({OrderStates: splitCsv(flags.status ?? []).length > 0 ? splitCsv(flags.status ?? []) : null}),
    )
    const response = await call(context, 'ListMemberProductType', params)
    const productTypes = (response.ProductTypeList as unknown[]) ?? []
    const rows = productTypes.map((item) => ({ProductType: item}))
    context.renderer.data(response, {
      rows,
      columns: [['ProductType', 'PRODUCT']],
      jsonList: true,
    })
  }
}
