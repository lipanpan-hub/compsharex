// cps instance billing: 查询当前实例价格

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {compact, memoryMib} from '../../lib/compshare/parsing.js'

export default class InstanceBilling extends CompshareBaseCommand {
  static description = '查询当前实例价格'
  static examples = ['<%= config.bin %> <%= command.id %> --gpu 4090 --cpu 16 --memory 64GiB --region cn-bj2 --zone cn-bj2-a']

  static flags = {
    ...compshareGlobalFlags,
    gpu: Flags.string({required: true, description: 'GPU 型号'}),
    count: Flags.integer({description: 'GPU 数量', default: 1}),
    cpu: Flags.integer({required: true, description: 'CPU 核数'}),
    memory: Flags.string({required: true, description: '内存, 例如 64GiB'}),
    charge: Flags.string({description: '计费类型'}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceBilling)
    const params = CompshareContext.request({zone: true, regionValue: flags.region, zoneValue: flags.zone})
    Object.assign(
      params,
      compact({
        GpuType: flags.gpu,
        GPU: flags.count,
        CPU: flags.cpu,
        Memory: memoryMib(flags.memory),
        ChargeType: flags.charge,
      }),
    )
    await invoke(this.compshareContext(), 'GetCompShareInstanceUserPrice', params, {
      listKey: 'PriceDetails',
      columns: [
        ['ChargeType', 'CHARGE'],
        ['Instance', 'INSTANCE'],
        ['SystemDisks', 'SYSTEM DISK'],
        ['Disks', 'DATA DISKS'],
        ['CompShareImage', 'IMAGE'],
      ],
    })
  }
}
