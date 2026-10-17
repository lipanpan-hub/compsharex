// cps storage disk price: 查询磁盘扩容价格

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {compact, diskGib} from '../../../lib/compshare/parsing.js'

export default class DiskPrice extends CompshareBaseCommand {
  static description = '查询磁盘扩容价格'

  static examples = ['<%= config.bin %> <%= command.id %> <DISK_ID> --instance <INSTANCE_ID> --size 200GiB']

  static args = {
    disk: Args.string({required: true, description: '磁盘 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '已挂载的实例 ID'}),
    size: Flags.string({required: true, description: '目标磁盘大小, 例如 200GiB'}),
    backup: Flags.string({description: '备份模式: NONE、DATAARK 或 SNAPSHOT'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DiskPrice)
    const context = this.compshareContext()
    const [region, zone] = await locateInstance(context, flags.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(
      params,
      compact({
        UHostId: flags.instance,
        DiskId: args.disk,
        DiskSpace: diskGib(flags.size),
        BackupMode: flags.backup,
      }),
    )
    await invoke(context, 'GetCompShareAttachedDiskUpgradePrice', params)
  }
}
