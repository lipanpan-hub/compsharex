// cps team invite list: 列出当前账号收到的团队邀请

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'

// 邀请清单统一列定义
const INVITE_COLUMNS = [
  ['TeamId', 'TEAM ID'],
  ['TeamName', 'NAME'],
  ['UserCompanyId', 'USER ID'],
  ['Status', 'STATUS'],
  ['RemarkName', 'REMARK'],
  ['CreateTime', 'CREATED'],
] as const satisfies readonly (readonly [string, string])[]

export default class InviteList extends CompshareBaseCommand {
  static description = '列出当前账号收到的团队邀请'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    await invoke(context, 'ListCompShareTeamInvite', CompshareContext.request(), {
      listKey: 'Invites',
      columns: INVITE_COLUMNS,
    })
  }
}
