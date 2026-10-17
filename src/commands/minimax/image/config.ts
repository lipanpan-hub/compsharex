// cps minimax image config: 查看图像生成可用性与价格

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'

export default class MinimaxImageConfig extends CompshareBaseCommand {
  static description = '查看图像生成可用性与价格'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const response = await client.request('GET', '/image/v1/config')
    context.renderer.data(response)
  }
}
