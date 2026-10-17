// cps team invite cancel: 取消待处理的团队邀请

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {relation} from '../../../lib/compshare/team-helpers.js'

export default class InviteCancel extends CompshareBaseCommand {
  static description = '取消待处理的团队邀请'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <USER_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    user: Args.integer({required: true, description: '用户公司 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InviteCancel)
    const context = this.compshareContext()
    await relation(context, args.team, 'Cancel', {user: args.user, yes: flags.yes})
  }
}
