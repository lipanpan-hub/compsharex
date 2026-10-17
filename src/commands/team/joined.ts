// cps team joined: 列出当前账号加入的团队

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {teamParams} from '../../lib/compshare/team-helpers.js'

// 已加入团队清单统一列定义
const JOINED_COLUMNS = [
  ['TeamId', 'TEAM ID'],
  ['TeamName', 'NAME'],
  ['VirtualCompanyId', 'MEMBER ID'],
  ['Status', 'STATUS'],
  ['RemarkName', 'REMARK'],
  ['CreateTime', 'CREATED'],
] as const satisfies readonly (readonly [string, string])[]

export default class TeamJoined extends CompshareBaseCommand {
  static aliases = ['tm:joined']
  static description = '列出当前账号加入的团队'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    status: Flags.string({description: '按成员关系状态过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TeamJoined)
    const context = this.compshareContext()
    await invoke(context, 'ListCompShareTeamJoined', teamParams(context, {Status: flags.status}), {
      listKey: 'JoinedTeams',
      columns: JOINED_COLUMNS,
    })
  }
}
