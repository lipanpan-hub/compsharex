// cps minimax audio voice-delete: 删除自定义音色

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {taskPath} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioVoiceDelete extends CompshareBaseCommand {
  static aliases = ['mm:audio:voice-delete']
  static description = '删除自定义音色'

  static examples = ['<%= config.bin %> <%= command.id %> <VOICE_ID>']

  static args = {
    voiceId: Args.string({required: true, description: '自定义音色 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioVoiceDelete)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    await confirmDetails(
      context,
      '操作计划',
      [
        ['VOICE ID', args.voiceId],
        ['ACTION', 'delete'],
      ],
      '确认本次操作?',
      flags.yes,
    )
    const response = await client.request('DELETE', taskPath('/audio/v1/voices', args.voiceId))
    context.renderer.data(response)
  }
}
