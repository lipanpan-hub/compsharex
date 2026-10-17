// cps minimax points: 查看 MiniMax H3 积分余额

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {MiniMaxClient} from '../../lib/compshare/minimax-api.js'

export default class MinimaxPoints extends CompshareBaseCommand {
  static aliases = ['mm:points']
  static description = '查看 MiniMax H3 积分余额'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    const response = await client.request('GET', '/minimax/v2/query/point_usage_summary')
    context.renderer.details(
      '积分余额',
      [
        ['TOTAL POINTS', response.total_points],
        ['RESERVED POINTS', response.reserved_points],
        ['AVAILABLE POINTS', response.available_points],
      ],
      response,
    )
  }
}
