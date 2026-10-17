// cps llm indextts voices: 查询当前组织下的自定义音色列表(/v1/audio/voice/list)

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {ModelverseClient} from '../../../lib/compshare/modelverse-api.js'

export const CUSTOM_VOICE_COLUMNS = [
  ['id', 'VOICE ID'],
  ['name', 'NAME'],
] as const satisfies readonly (readonly [string, string])[]

export default class LlmIndexttsVoices extends CompshareBaseCommand {
  static aliases = ['llm:indextts:voices', 'li:voices', 'li:vls']
  static description = '查询当前组织下的自定义音色列表(最多返回 1000 条)'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
  }

  async run(): Promise<void> {
    await this.parse(LlmIndexttsVoices)
    const context = this.compshareContext()
    const client = new ModelverseClient(
      context.renderer,
      this.config.version,
      context.profile.llmApiKey,
      context.profile.llmBaseUrl,
    )
    const response = await client.request('GET', '/audio/voice/list')
    const rows = Array.isArray(response.list) ? (response.list as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: CUSTOM_VOICE_COLUMNS, jsonList: true})
  }
}
