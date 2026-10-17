// cps instance template list: 列出本地实例模板

import {CompshareBaseCommand} from '../../../lib/compshare/base.js'
import {InstanceTemplateStore, templatePath} from '../../../lib/compshare/instance-template-store.js'

export default class InstanceTemplateList extends CompshareBaseCommand {
  static description = '列出本地实例模板'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    const context = this.compshareContext()
    const store = new InstanceTemplateStore(templatePath(context.configDirectory))
    const templates = store.list()
    const rows = templates.map((template) => ({
      Name: template.name,
      Description: template.description,
      Gpu: template.parameters.gpu,
      Count: template.parameters.count,
      Cpu: template.parameters.cpu,
      Memory: template.parameters.memory,
      Region: template.parameters.region,
      Zone: template.parameters.zone,
      Updated: template.updated_at,
    }))
    const path = templatePath(context.configDirectory)
    context.renderer.data({templates, path}, {
      rows,
      columns: [
        ['Name', 'NAME'],
        ['Description', 'DESCRIPTION'],
        ['Gpu', 'GPU'],
        ['Count', 'COUNT'],
        ['Cpu', 'CPU'],
        ['Memory', 'MEMORY'],
        ['Region', 'REGION'],
        ['Zone', 'ZONE'],
        ['Updated', 'UPDATED'],
      ],
      jsonList: true,
      metadata: {path},
    })
  }
}
