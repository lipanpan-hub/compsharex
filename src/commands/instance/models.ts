// cps instance models: 列出模型仓库中的模型

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {compact} from '../../lib/compshare/parsing.js'

export default class InstanceModels extends CompshareBaseCommand {
  static aliases = ['ins:models']
  static description = '列出模型仓库中的模型'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    name: Flags.string({description: '按模型名称过滤'}),
    tags: Flags.string({description: '按模型标签过滤'}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceModels)
    const params = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    Object.assign(params, compact({name: flags.name, tags: flags.tags}))
    await invoke(this.compshareContext(), 'DescribeModelRepositoryModels', params, {
      listKey: 'Models',
      columns: [
        ['Name', 'NAME'],
        ['Path', 'PATH'],
        ['Tag', 'TAG'],
        ['Size', 'SIZE'],
        ['CreateTime', 'CREATED'],
      ],
    })
  }
}
