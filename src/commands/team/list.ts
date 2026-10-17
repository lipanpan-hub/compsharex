// cps team list: 列出当前账号创建的团队

import {invoke} from '../../lib/compshare/api.js'
import {TEAM_COLUMNS} from '../../lib/compshare/team-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class TeamList extends CompshareBaseCommand {
  static description = '列出当前账号创建的团队'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    await invoke(context, 'ListCompShareTeam', CompshareContext.request(), {
      listKey: 'Teams',
      columns: TEAM_COLUMNS,
    })
  }
}
