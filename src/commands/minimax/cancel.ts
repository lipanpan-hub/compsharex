// cps minimax cancel: 取消未完成的 MiniMax H3 视频任务

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {MiniMaxClient} from '../../lib/compshare/minimax-api.js'
import {taskPath} from '../../lib/compshare/minimax-helpers.js'

export default class MinimaxCancel extends CompshareBaseCommand {
  static description = '取消未完成的 MiniMax H3 视频任务'

  static examples = ['<%= config.bin %> <%= command.id %> <TASK_ID>']

  static args = {
    taskId: Args.string({required: true, description: '视频任务 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxCancel)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const current = await client.request('GET', taskPath('/minimax/v2/query/video_generation', args.taskId))
    const task = current.task !== null && typeof current.task === 'object' ? (current.task as Record<string, unknown>) : {}
    await confirmDetails(
      context,
      '操作计划',
      [
        ['TASK ID', args.taskId],
        ['STATUS', task.status],
      ],
      '确认本次操作?',
      flags.yes,
    )
    const response = await client.request('DELETE', taskPath('/minimax/v2/video_generation', args.taskId))
    context.renderer.details(
      '任务已提交',
      [
        ['TASK ID', response.task_id ?? args.taskId],
        ['STATUS', response.status],
      ],
      response,
    )
  }
}
