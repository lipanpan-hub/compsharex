// cps storage disk attach: 将已有磁盘挂载到实例

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {compact} from '../../../lib/compshare/parsing.js'

export default class DiskAttach extends CompshareBaseCommand {
  static aliases = ['st:disk:attach']
  static description = '将已有磁盘挂载到实例'

  static examples = ['<%= config.bin %> <%= command.id %> <DISK_ID> --instance <INSTANCE_ID>']

  static args = {
    disk: Args.string({required: true, description: '磁盘 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '目标实例 ID'}),
    type: Flags.string({description: '数据盘类型'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DiskAttach)
    const context = this.compshareContext()
    const [region, zone] = await locateInstance(context, flags.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(params, compact({UHostId: flags.instance, UDiskId: args.disk, DataDiskType: flags.type}))
    await invoke(context, 'AttachCompshareDisk', params, {
      success: `已将磁盘 ${args.disk} 挂载到实例 ${flags.instance}`,
    })
  }
}
