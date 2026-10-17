// cps storage disk resize: 扩容磁盘

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {locateDisk, locateInstance} from '../../../lib/compshare/location.js'
import {compact, diskGib} from '../../../lib/compshare/parsing.js'

export default class DiskResize extends CompshareBaseCommand {
  static description = '扩容磁盘'

  static examples = ['<%= config.bin %> <%= command.id %> <DISK_ID> --size 200GiB']

  static args = {
    disk: Args.string({required: true, description: '磁盘 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    size: Flags.string({required: true, description: '目标磁盘大小, 例如 200GiB'}),
    instance: Flags.string({description: '已挂载的实例 ID'}),
    region: Flags.string({description: '本次请求的地域'}),
    zone: Flags.string({description: '可用区'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DiskResize)
    const context = this.compshareContext()
    await confirm(context, `确认将磁盘 ${args.disk} 扩容到 ${flags.size}? 磁盘不支持缩容。`, flags.yes)

    // region 与 zone 必须成对出现
    if ((flags.region === undefined) !== (flags.zone === undefined)) {
      throw new UsageError('--region 与 --zone 必须同时提供。')
    }

    // #region 定位磁盘所属 Region/Zone: 优先实例, 其次显式 region/zone, 最后磁盘库存
    let region: string
    let zone: string
    let instance: string | undefined = flags.instance
    if (instance !== undefined) {
      ;[region, zone] = await locateInstance(context, instance)
    } else if (flags.region !== undefined && flags.zone !== undefined) {
      region = flags.region
      zone = flags.zone
    } else {
      let host: Record<string, unknown> | null
      ;[region, zone, host] = await locateDisk(context, args.disk)
      instance = host ? String(host.UHostId ?? '') : undefined
    }
    // #endregion

    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(params, compact({UDiskId: args.disk, UHostId: instance, Size: diskGib(flags.size)}))
    await invoke(context, 'ResizeCompShareDisk', params, {
      success: `已扩容磁盘 ${args.disk}`,
    })
  }
}
