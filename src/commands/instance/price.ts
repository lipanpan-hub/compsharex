// cps instance price: 查询新实例价格

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {volumeList} from '../../lib/compshare/instance-helpers.js'
import {compact, diskGib, memoryMib, splitCsv} from '../../lib/compshare/parsing.js'

const PRICE_COLUMNS = [
  ['ChargeType', 'CHARGE'],
  ['Instance', 'INSTANCE'],
  ['SystemDisks', 'SYSTEM DISK'],
  ['Disks', 'DATA DISKS'],
  ['CompShareImage', 'IMAGE'],
] as const

export default class InstancePrice extends CompshareBaseCommand {
  static aliases = ['ins:price']
  static description = '查询新实例价格'
  static examples = ['<%= config.bin %> <%= command.id %> --gpu 4090 --cpu 16 --memory 64GiB --region cn-bj2 --zone cn-bj2-a']

  static flags = {
    ...compshareGlobalFlags,
    gpu: Flags.string({required: true, description: 'GPU 型号'}),
    count: Flags.integer({description: 'GPU 数量', default: 1}),
    cpu: Flags.integer({required: true, description: 'CPU 核数'}),
    memory: Flags.string({required: true, description: '内存, 例如 64GiB'}),
    charge: Flags.string({description: '计费类型'}),
    disk: Flags.string({description: '系统盘大小', default: '100GiB'}),
    diskType: Flags.string({description: '系统盘类型', default: 'CLOUD_SSD'}),
    volume: Flags.string({description: '共享存储, 格式 SIZE[:TYPE]; 可重复', multiple: true}),
    image: Flags.string({description: '镜像 ID(用于镜像计价)'}),
    quantity: Flags.integer({description: '预付费模式的计费时长', default: 1}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstancePrice)
    const params = CompshareContext.request({zone: true, regionValue: flags.region, zoneValue: flags.zone})
    Object.assign(
      params,
      compact({
        GpuType: flags.gpu,
        Gpu: flags.count,
        Cpu: flags.cpu,
        Memory: memoryMib(flags.memory),
        ChargeType: flags.charge,
        Disks: [{IsBoot: true, Type: flags.diskType, Size: diskGib(flags.disk)}],
        Volumes: flags.volume ? volumeList(splitCsv(flags.volume)) : undefined,
        CompShareImageId: flags.image,
        Quantity: flags.quantity,
      }),
    )
    await invoke(this.compshareContext(), 'GetCompShareInstancePrice', params, {
      listKey: 'PriceDetails',
      columns: PRICE_COLUMNS,
    })
  }
}
