// cps storage disk create: 创建数据盘并挂载到实例

import {Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {compact, diskGib} from '../../../lib/compshare/parsing.js'

export default class DiskCreate extends CompshareBaseCommand {
  static aliases = ['st:disk:create', 'st:disk:new']
  static description = '创建磁盘并挂载到实例'

  static examples = ['<%= config.bin %> <%= command.id %> --instance <INSTANCE_ID> --size 100GiB --name data01']

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '目标实例 ID'}),
    size: Flags.string({required: true, description: '磁盘大小, 例如 100GiB'}),
    name: Flags.string({required: true, description: '磁盘名称'}),
    type: Flags.string({default: 'SSDDataDisk', description: '磁盘类型'}),
    charge: Flags.string({default: 'Month', description: '计费类型'}),
    quantity: Flags.integer({default: 1, min: 1, description: '预付费模式的购买时长'}),
    coupon: Flags.string({description: '代金券 ID'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DiskCreate)
    const context = this.compshareContext()
    await confirm(context, `确认创建 ${flags.size} 磁盘 ${flags.name} 并挂载到实例 ${flags.instance}?`, flags.yes)

    const [region, zone] = await locateInstance(context, flags.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(
      params,
      compact({
        UHostId: flags.instance,
        Size: diskGib(flags.size),
        DiskType: flags.type,
        Name: flags.name,
        ChargeType: flags.charge,
        Quantity: flags.quantity,
        CouponId: flags.coupon,
      }),
    )
    await invoke(context, 'CreateAndAttachCompshareDisk', params, {
      success: `已创建并挂载磁盘 ${flags.name}`,
    })
  }
}
