// cps team quota grant: 给团队成员拨发配额

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {quota} from '../../../lib/compshare/team-helpers.js'

export default class QuotaGrant extends CompshareBaseCommand {
  static aliases = ['tm:quota:grant']
  static description = '给团队成员拨发配额'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <MEMBER_ID>... --amount 100']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    members: Args.string({required: true, variadic: true, description: '虚拟成员 ID 列表'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    amount: Flags.string({required: true, description: '金额, 单位 CNY'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(QuotaGrant)
    const context = this.compshareContext()
    // oclif 静态类型未体现 variadic, 运行时实为 string[], 显式断言后转数字
    const memberIds = (args.members as unknown as string[]).map((value) => {
      const memberId = Number(value)
      if (!Number.isInteger(memberId) || memberId <= 0) {
        throw new UsageError(`无效成员 ID: ${value}。`)
      }
      return memberId
    })
    await quota(context, args.team, memberIds, flags.amount, 'AllocateAmount', flags.yes)
  }
}
