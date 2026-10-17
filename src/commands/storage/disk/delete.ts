// cps storage disk delete: 永久删除磁盘

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {locateDisk} from '../../../lib/compshare/location.js'

export default class DiskDelete extends CompshareBaseCommand {
  static description = '永久删除磁盘'

  static examples = ['<%= config.bin %> <%= command.id %> <DISK_ID>']

  static args = {
    disk: Args.string({required: true, description: '磁盘 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '本次请求的地域'}),
    zone: Flags.string({description: '可用区'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DiskDelete)
    const context = this.compshareContext()
    await confirm(context, `确认永久删除磁盘 ${args.disk} 及其全部数据?`, flags.yes)

    // region 与 zone 必须成对出现
    if ((flags.region === undefined) !== (flags.zone === undefined)) {
      throw new UsageError('--region 与 --zone 必须同时提供。')
    }

    let region: string
    let zone: string
    if (flags.region !== undefined && flags.zone !== undefined) {
      region = flags.region
      zone = flags.zone
    } else {
      ;[region, zone] = await locateDisk(context, args.disk)
    }
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    params.UDiskId = args.disk
    await invoke(context, 'DeleteCompshareDisk', params, {
      success: `已删除磁盘 ${args.disk}`,
    })
  }
}
