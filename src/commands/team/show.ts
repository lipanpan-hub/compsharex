// cps team show: 查看团队详情与成员

import {Args} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {MEMBER_COLUMNS, memberRows, teamParams} from '../../lib/compshare/team-helpers.js'

export default class TeamShow extends CompshareBaseCommand {
  static description = '查看团队详情与成员'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const {args} = await this.parse(TeamShow)
    const context = this.compshareContext()
    const response = await call(context, 'GetCompShareTeamInfo', teamParams(context, {TeamId: args.team}))
    if (context.jsonOutput) {
      context.renderer.data(response)
      return
    }
    const info = (response.Team as Record<string, unknown>) ?? {}
    const relations = (response.TeamRelation as Array<Record<string, unknown>>) ?? []
    context.renderer.details('团队详情', [
      ['TEAM ID', info.Id ?? args.team],
      ['NAME', info.Name],
      ['DESCRIPTION', info.Description],
      ['MEMBERS', relations.length],
    ])
    context.renderer.table(memberRows(response), MEMBER_COLUMNS)
  }
}
