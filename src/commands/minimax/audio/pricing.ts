// cps minimax audio pricing: 查看语音定价与积分余额

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'

export default class MinimaxAudioPricing extends CompshareBaseCommand {
  static aliases = ['mm:audio:pricing', 'ma:pricing', 'ma:price']
  static description = '查看语音定价与积分余额'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    const response = await client.request('GET', '/audio/v1/pricing')
    context.renderer.data(response)
  }
}
