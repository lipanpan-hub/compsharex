// cps minimax skill delete: 删除自定义视频技能

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirmDetails} from '../../../lib/compshare/confirm.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_SKILL_PATH, taskPath} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxSkillDelete extends CompshareBaseCommand {
  static description = '删除自定义视频技能'

  static examples = ['<%= config.bin %> <%= command.id %> <SKILL_ID>']

  static args = {
    skillId: Args.string({required: true, description: '技能 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxSkillDelete)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    await confirmDetails(
      context,
      '操作计划',
      [
        ['SKILL ID', args.skillId],
        ['ACTION', 'delete'],
      ],
      '确认本次操作?',
      flags.yes,
    )
    const response = await client.request('DELETE', taskPath(MINIMAX_SKILL_PATH, args.skillId))
    context.renderer.data(response)
  }
}
