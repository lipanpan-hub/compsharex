// cps minimax packages: 列出 MiniMax H3 积分包

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {MiniMaxClient} from '../../lib/compshare/minimax-api.js'
import {PACKAGE_COLUMNS} from '../../lib/compshare/minimax-helpers.js'

export default class MinimaxPackages extends CompshareBaseCommand {
  static description = '列出 MiniMax H3 积分包'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const response = await client.request('GET', '/minimax/v2/query/point_packages')
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: PACKAGE_COLUMNS})
  }
}
