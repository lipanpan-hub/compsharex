// cps minimax image delete: 删除已完成的图像任务及其输出

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_IMAGE_PATH, mediaAction} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxImageDelete extends CompshareBaseCommand {
  static description = '删除已完成的图像任务及其输出'

  static examples = ['<%= config.bin %> <%= command.id %> <TASK_ID>']

  static args = {
    taskId: Args.string({required: true, description: '图像任务 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxImageDelete)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    await mediaAction(context, client, MINIMAX_IMAGE_PATH, args.taskId, 'delete', flags.yes)
  }
}
