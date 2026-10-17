// cps instance template show: 查看本地实例模板

import {Args} from '@oclif/core'

import {CompshareBaseCommand} from '../../../lib/compshare/base.js'
import {InstanceTemplateStore, templatePath} from '../../../lib/compshare/instance-template-store.js'

export default class InstanceTemplateShow extends CompshareBaseCommand {
  static aliases = ['ins:template:show', 'ins:template:get']
  static description = '查看本地实例模板'
  static examples = ['<%= config.bin %> <%= command.id %> <NAME>']

  static args = {
    name: Args.string({required: true, description: '模板名称'}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(InstanceTemplateShow)
    const context = this.compshareContext()
    const store = new InstanceTemplateStore(templatePath(context.configDirectory))
    const template = store.get(args.name)
    const parameters = template.parameters
    context.renderer.details(
      '实例模板',
      [
        ['NAME', template.name],
        ['DESCRIPTION', template.description],
        ['GPU', parameters.gpu],
        ['COUNT', parameters.count],
        ['CPU', parameters.cpu],
        ['MEMORY', parameters.memory],
        ['IMAGE', parameters.image],
        ['REGION', parameters.region],
        ['ZONE', parameters.zone],
        ['PARAMETERS', parameters],
        ['UPDATED', template.updated_at],
      ],
      {...template},
    )
  }
}
