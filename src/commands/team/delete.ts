// cps team delete: 永久删除空团队

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {teamParams} from '../../lib/compshare/team-helpers.js'

export default class TeamDelete extends CompshareBaseCommand {
  static aliases = ['tm:delete', 'tm:rm']
  static description = '永久删除空团队'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TeamDelete)
    const context = this.compshareContext()
    await confirmDetails(
      context,
      '操作计划',
      [
        ['TEAM ID', args.team],
        ['ACTION', '永久删除团队'],
      ],
      '确认本次操作?',
      flags.yes,
    )
    await invoke(context, 'DeleteCompShareTeam', teamParams(context, {TeamId: args.team}), {
      success: `已删除团队 ${args.team}`,
    })
  }
}
