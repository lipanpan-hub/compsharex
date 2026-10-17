// cps minimax skill update: 替换自定义视频技能

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_SKILL_PATH, skillPayload, taskPath} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxSkillUpdate extends CompshareBaseCommand {
  static description = '替换自定义视频技能'

  static examples = ['<%= config.bin %> <%= command.id %> <SKILL_ID> <NAME> <CONTENT>']

  static args = {
    skillId: Args.string({required: true, description: '技能 ID'}),
    name: Args.string({required: true, description: '技能名称'}),
    content: Args.string({required: true, description: '技能内容'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    description: Flags.string({default: '', description: '技能描述'}),
    dryRun: Flags.boolean({default: false, description: '只展示请求'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxSkillUpdate)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const payload = skillPayload(args.name, args.content, flags.description ?? '')
    const fields: Array<[string, unknown]> = [
      ['NAME', payload.name],
      ['DESCRIPTION', payload.description],
    ]
    if (flags.dryRun) {
      context.renderer.details('操作计划', fields, {dry_run: true, request: payload})
      return
    }
    await confirmDetails(context, '操作计划', fields, '确认本次操作?', flags.yes)
    const response = await client.request('PUT', taskPath(MINIMAX_SKILL_PATH, args.skillId), {body: payload})
    context.renderer.data(response)
  }
}
