// cps minimax audio cancel: 取消排队中的语音任务

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_AUDIO_PATH, mediaAction} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioCancel extends CompshareBaseCommand {
  static aliases = ['mm:audio:cancel']
  static description = '取消排队中的语音任务'

  static examples = ['<%= config.bin %> <%= command.id %> <TASK_ID>']

  static args = {
    taskId: Args.string({required: true, description: '语音任务 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioCancel)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    await mediaAction(context, client, MINIMAX_AUDIO_PATH, args.taskId, 'cancel', flags.yes)
  }
}
