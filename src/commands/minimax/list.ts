// cps minimax list: 列出 MiniMax H3 视频任务

import {Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {MiniMaxClient} from '../../lib/compshare/minimax-api.js'
import {MINIMAX_MODELS, MINIMAX_STATUSES, VIDEO_TASK_COLUMNS} from '../../lib/compshare/minimax-helpers.js'
import {UsageError} from '../../lib/compshare/errors.js'

export default class MinimaxList extends CompshareBaseCommand {
  static description = '列出 MiniMax H3 视频任务'

  static examples = ['<%= config.bin %> <%= command.id %> --status running']

  static flags = {
    ...compshareGlobalFlags,
    page: Flags.integer({default: 1, min: 1, description: '页码, 从 1 开始'}),
    pageSize: Flags.integer({default: 20, min: 1, max: 100, description: '每页条数 (1-100)'}),
    status: Flags.string({description: '按任务状态过滤'}),
    model: Flags.string({description: '按模型过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MinimaxList)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const normalizedStatus = flags.status ? flags.status.toLowerCase() : undefined
    if (normalizedStatus && !MINIMAX_STATUSES.has(normalizedStatus)) {
      throw new UsageError(`不支持的任务状态: ${flags.status}。`)
    }
    if (flags.model && !MINIMAX_MODELS.has(flags.model)) {
      throw new UsageError(`不支持的视频模型: ${flags.model}。`)
    }
    const query: Record<string, unknown> = {page_num: flags.page, page_size: flags.pageSize}
    if (normalizedStatus) {
      query['filter.status'] = normalizedStatus
    }
    if (flags.model) {
      query['filter.model'] = flags.model
    }
    const response = await client.request('GET', '/minimax/v2/query/video_generation', {query})
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: VIDEO_TASK_COLUMNS})
  }
}
