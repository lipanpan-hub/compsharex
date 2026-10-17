// cps team invite reject: 拒绝团队邀请

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {relation} from '../../../lib/compshare/team-helpers.js'

export default class InviteReject extends CompshareBaseCommand {
  static description = '拒绝团队邀请'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InviteReject)
    const context = this.compshareContext()
    await relation(context, args.team, 'Reject', {yes: flags.yes})
  }
}
