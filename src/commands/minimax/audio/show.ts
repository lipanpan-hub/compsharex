// cps minimax audio show: 查看语音任务

import {Args} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_AUDIO_PATH, taskPath} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioShow extends CompshareBaseCommand {
  static aliases = ['mm:audio:show', 'mm:audio:get']
  static description = '查看语音任务'

  static examples = ['<%= config.bin %> <%= command.id %> <TASK_ID>']

  static args = {
    taskId: Args.string({required: true, description: '语音任务 ID'}),
  }

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const {args} = await this.parse(MinimaxAudioShow)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const response = await client.request('GET', taskPath(MINIMAX_AUDIO_PATH, args.taskId))
    const task = response.task !== null && typeof response.task === 'object' ? (response.task as Record<string, unknown>) : {}
    context.renderer.details(
      '语音任务',
      [
        ['TASK ID', task.task_id ?? args.taskId],
        ['STATUS', task.status],
        ['POINTS', task.point_cost],
        ['OUTPUT URL', task.output_url],
        ['ERROR', task.error_message],
      ],
      response,
    )
  }
}
