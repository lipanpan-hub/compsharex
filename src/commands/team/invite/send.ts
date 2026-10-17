// cps team invite send: 邀请用户加入团队

import {Args, Flags} from '@oclif/core'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {invitee, teamParams} from '../../../lib/compshare/team-helpers.js'

export default class InviteSend extends CompshareBaseCommand {
  static description = '邀请用户加入团队'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <USER_ID>[:REMARK]...']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    users: Args.string({required: true, variadic: true, description: '用户 ID, 可选 USER_ID:REMARK 形式'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InviteSend)
    const context = this.compshareContext()
    // oclif 静态类型未体现 variadic, 运行时实为 string[], 显式断言
    const userIds = args.users as unknown as string[]
    if (userIds.length > 100) {
      throw new UsageError('单次最多邀请 100 个用户。')
    }
    const invitees = userIds.map((value) => invitee(value))
    await confirmDetails(
      context,
      '操作计划',
      [
        ['TEAM ID', args.team],
        ['USER ID', invitees.map((item) => item.UserCompanyId)],
      ],
      '确认本次操作?',
      flags.yes,
    )

    const response = await call(
      context,
      'CreateCompShareTeamRelation',
      teamParams(context, {TeamId: args.team, UserInfo: invitees}),
    )
    const errors = (response.ErrorMap as Record<string, Record<string, unknown>>) ?? {}
    const hasErrors = Object.keys(errors).length > 0
    const result: Record<string, unknown> = {...response, ok: !hasErrors}
    if (hasErrors) {
      result.error = {code: 'partial_failure', message: '部分团队邀请发送失败。'}
    }
    if (context.jsonOutput) {
      context.renderer.data(result)
    } else if (hasErrors) {
      const rows = Object.entries(errors).map(([userId, detail]) => ({UserCompanyId: userId, ...detail}))
      context.renderer.table(rows, [
        ['UserCompanyId', 'USER ID'],
        ['Code', 'CODE'],
        ['Message', 'MESSAGE'],
      ])
    } else {
      context.renderer.success('已发送团队邀请', result)
    }
    if (hasErrors) {
      process.exitCode = 1
    }
  }
}
