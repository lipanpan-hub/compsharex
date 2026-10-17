// cps instance template delete: 删除本地实例模板

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {InstanceTemplateStore, templatePath} from '../../../lib/compshare/instance-template-store.js'

export default class InstanceTemplateDelete extends CompshareBaseCommand {
  static description = '删除本地实例模板'
  static examples = ['<%= config.bin %> <%= command.id %> <NAME>']

  static args = {
    name: Args.string({required: true, description: '模板名称'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceTemplateDelete)
    const context = this.compshareContext()
    await confirm(context, `删除本地实例模板 ${args.name}?`, flags.yes)
    const store = new InstanceTemplateStore(templatePath(context.configDirectory))
    store.delete(args.name)
    context.renderer.success(`已删除实例模板 ${args.name}`, {ok: true, name: args.name})
  }
}
