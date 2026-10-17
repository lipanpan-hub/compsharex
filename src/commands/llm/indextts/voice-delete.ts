// cps llm indextts voice-delete: 删除自定义音色(/v1/audio/voice/delete)

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {ModelverseClient} from '../../../lib/compshare/modelverse-api.js'

export default class LlmIndexttsVoiceDelete extends CompshareBaseCommand {
  static aliases = ['llm:indextts:voice-delete', 'li:voice-delete', 'li:vrm']
  static description = '删除指定的自定义音色, 删除后无法在语音合成中继续引用'

  static examples = ['<%= config.bin %> <%= command.id %> uspeech:xxxx-xxxx-xxxx-xxxx']

  static args = {
    voiceId: Args.string({required: true, description: '自定义音色 ID(uspeech:*)'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LlmIndexttsVoiceDelete)
    const context = this.compshareContext()
    const client = new ModelverseClient(
      context.renderer,
      this.config.version,
      context.profile.llmApiKey,
      context.profile.llmBaseUrl,
    )
    await confirmDetails(
      context,
      '删除计划',
      [
        ['VOICE ID', args.voiceId],
        ['提示', '删除后该音色无法继续用于语音合成, 且不可恢复'],
      ],
      '确认删除该自定义音色?',
      flags.yes,
    )
    const response = await client.request('POST', '/audio/voice/delete', {body: {id: args.voiceId}})
    context.renderer.success(`自定义音色 ${args.voiceId} 已删除`, response)
  }
}
