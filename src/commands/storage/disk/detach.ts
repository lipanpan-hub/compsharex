// cps storage disk detach: 从实例卸载磁盘

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'

export default class DiskDetach extends CompshareBaseCommand {
  static description = '从实例卸载磁盘'

  static examples = ['<%= config.bin %> <%= command.id %> <DISK_ID> --instance <INSTANCE_ID> --device /dev/vdb']

  static args = {
    disk: Args.string({required: true, description: '磁盘 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '已挂载的实例 ID'}),
    device: Flags.string({required: true, description: '设备路径, 例如 /dev/vdb'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DiskDetach)
    const context = this.compshareContext()
    await confirm(
      context,
      `确认从实例 ${flags.instance} 卸载磁盘 ${args.disk}? 请先在系统内卸载该磁盘。`,
      flags.yes,
    )

    const [region, zone] = await locateInstance(context, flags.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(params, {UHostId: flags.instance, UDiskId: args.disk, Device: flags.device})
    await invoke(context, 'DetachCompshareDisk', params, {
      success: `已卸载磁盘 ${args.disk}`,
    })
  }
}
