// cps minimax image list: 列出图像任务

import {Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MEDIA_TASK_COLUMNS, MINIMAX_IMAGE_PATH} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxImageList extends CompshareBaseCommand {
  static aliases = ['mm:image:list', 'mm:image:ls']
  static description = '列出图像任务'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    offset: Flags.integer({default: 0, min: 0}),
    limit: Flags.integer({default: 20, min: 1, max: 100}),
    status: Flags.string({multiple: true, description: '任务状态, 可重复'}),
    sort: Flags.string({default: 'latest', description: 'latest 或 oldest'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MinimaxImageList)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    if (!['latest', 'oldest'].includes(flags.sort)) {
      throw new UsageError('排序必须是 latest 或 oldest。')
    }
    const statuses = flags.status ?? []
    const query: Record<string, unknown> = {offset: flags.offset, limit: flags.limit, sort: flags.sort}
    if (statuses.length > 0) {
      query.statuses = statuses
    }
    const response = await client.request('GET', MINIMAX_IMAGE_PATH, {query})
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: MEDIA_TASK_COLUMNS})
  }
}
