// cps team member list: 列出团队成员

import {Args} from '@oclif/core'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MEMBER_COLUMNS, memberRows, teamParams} from '../../../lib/compshare/team-helpers.js'

export default class MemberList extends CompshareBaseCommand {
  static aliases = ['tm:member:list', 'tm:member:ls']
  static description = '列出团队成员'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const {args} = await this.parse(MemberList)
    const context = this.compshareContext()
    const response = await call(context, 'GetCompShareTeamInfo', teamParams(context, {TeamId: args.team}))
    const rows = memberRows(response)
    context.renderer.data(response, {
      rows,
      columns: MEMBER_COLUMNS,
      jsonList: true,
      jsonFields: ['UserCompanyId', 'VirtualCompanyId', 'RemarkName', 'Status', 'AllocateAmount', 'AvailableAmount'],
    })
  }
}
