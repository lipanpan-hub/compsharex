// cps team create: 创建团队

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {teamParams} from '../../lib/compshare/team-helpers.js'

export default class TeamCreate extends CompshareBaseCommand {
  static aliases = ['tm:create', 'tm:new']
  static description = '创建团队'

  static examples = ['<%= config.bin %> <%= command.id %> <NAME> --description "描述"']

  static args = {
    name: Args.string({required: true, description: '团队名称'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    description: Flags.string({description: '团队描述'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TeamCreate)
    const context = this.compshareContext()
    await confirmDetails(
      context,
      '操作计划',
      [
        ['ACTION', '创建团队'],
        ['NAME', args.name],
        ['DESCRIPTION', flags.description],
      ],
      '确认本次操作?',
      flags.yes,
    )
    await invoke(context, 'CreateCompShareTeam', teamParams(context, {Name: args.name, Description: flags.description}), {
      success: `已创建团队 ${args.name}`,
    })
  }
}
