// cps minimax audio voices: 列出预置或自定义音色

import {Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {VOICE_COLUMNS} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioVoices extends CompshareBaseCommand {
  static aliases = ['mm:audio:voices']
  static description = '列出预置或自定义音色'

  static examples = ['<%= config.bin %> <%= command.id %> --kind custom']

  static flags = {
    ...compshareGlobalFlags,
    kind: Flags.string({default: 'preset', description: 'preset 或 custom'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MinimaxAudioVoices)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    if (!['custom', 'preset'].includes(flags.kind)) {
      throw new UsageError('音色类型必须是 preset 或 custom。')
    }
    const response = await client.request('GET', '/audio/v1/voices', {query: {kind: flags.kind}})
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: VOICE_COLUMNS})
  }
}
