// cps minimax audio list: 列出语音任务

import {Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MEDIA_TASK_COLUMNS, MINIMAX_AUDIO_PATH} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioList extends CompshareBaseCommand {
  static aliases = ['mm:audio:list', 'mm:audio:ls']
  static description = '列出语音任务'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    offset: Flags.integer({default: 0, min: 0}),
    limit: Flags.integer({default: 20, min: 1, max: 100}),
    status: Flags.string({multiple: true, description: '任务状态, 可重复'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MinimaxAudioList)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const statuses = flags.status ?? []
    const query: Record<string, unknown> = {offset: flags.offset, limit: flags.limit}
    if (statuses.length > 0) {
      query.statuses = statuses
    }
    const response = await client.request('GET', MINIMAX_AUDIO_PATH, {query})
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: MEDIA_TASK_COLUMNS})
  }
}
