// cps instance rename: 重命名实例

import {Args} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {locateInstance} from '../../lib/compshare/location.js'

export default class InstanceRename extends CompshareBaseCommand {
  static description = '重命名实例'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> <NAME>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    name: Args.string({required: true, description: '新名称'}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(InstanceRename)
    const context = this.compshareContext()
    const [region, zone] = await locateInstance(context, args.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(params, {UHostId: args.instance, Name: args.name})
    await invoke(context, 'ModifyCompShareInstanceName', params, {
      success: `已重命名 ${args.instance}`,
    })
  }
}
