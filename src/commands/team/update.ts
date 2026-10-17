// cps team update: 更新团队名称或描述

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {teamParams} from '../../lib/compshare/team-helpers.js'

export default class TeamUpdate extends CompshareBaseCommand {
  static aliases = ['tm:update']
  static description = '更新团队名称或描述'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> --name 新名称']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    name: Flags.string({description: '新团队名称'}),
    description: Flags.string({description: '新团队描述'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TeamUpdate)
    const context = this.compshareContext()
    if (flags.name === undefined && flags.description === undefined) {
      throw new UsageError('至少指定一个要更新的字段。')
    }
    await invoke(
      context,
      'UpdateCompShareTeam',
      teamParams(context, {TeamId: args.team, Name: flags.name, Description: flags.description}),
      {success: `已更新团队 ${args.team}`},
    )
  }
}
