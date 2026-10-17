// cps minimax show: 查看 MiniMax H3 视频任务

import {Args} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {MiniMaxClient} from '../../lib/compshare/minimax-api.js'
import {taskPath} from '../../lib/compshare/minimax-helpers.js'

export default class MinimaxShow extends CompshareBaseCommand {
  static aliases = ['mm:show', 'mm:get']
  static description = '查看 MiniMax H3 视频任务'

  static examples = ['<%= config.bin %> <%= command.id %> <TASK_ID>']

  static args = {
    taskId: Args.string({required: true, description: '视频任务 ID'}),
  }

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const {args} = await this.parse(MinimaxShow)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const response = await client.request('GET', taskPath('/minimax/v2/query/video_generation', args.taskId))
    const task = isRecord(response.task) ? response.task : {}
    const content = isRecord(task.content) ? task.content : {}
    context.renderer.details(
      '视频任务',
      [
        ['TASK ID', task.id ?? args.taskId],
        ['STATUS', task.status],
        ['RESOLUTION', task.resolution],
        ['DURATION', task.duration],
        ['RATIO', task.ratio],
        ['PROMPT', content.prompt],
        ['URL', content.url],
        ['ERROR', task.error],
      ],
      response,
    )
  }
}

// 严格判断为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
