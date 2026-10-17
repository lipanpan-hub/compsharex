// cps instance search: 搜索合法规格, 配合 --image 查询真实库存

import {Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {searchRows} from '../../lib/compshare/instance-helpers.js'
import {compact, diskGib, splitCsv} from '../../lib/compshare/parsing.js'

// 库存查询结果的规格键: 与 searchRows 的匹配逻辑保持一致
function specKey(spec: Record<string, unknown>): string {
  return `${spec.Gpu}|${spec.Cpu}|${spec.Mem}`
}

export default class InstanceSearch extends CompshareBaseCommand {
  static description = '搜索合法规格, 可选查询真实库存'
  static examples = ['<%= config.bin %> <%= command.id %> --region cn-bj2 --zone cn-bj2-a --gpu 4090']

  static flags = {
    ...compshareGlobalFlags,
    gpu: Flags.string({description: 'GPU 型号; 可重复', multiple: true}),
    spot: Flags.boolean({description: '搜索抢占式实例', default: false}),
    image: Flags.string({description: '镜像 ID。指定后对每个匹配的 GPU 型号查询真实库存'}),
    available: Flags.boolean({description: '只显示有库存的规格', default: false}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
    platform: Flags.string({description: '库存查询使用的 CPU 平台', default: 'Auto'}),
    charge: Flags.string({description: '库存查询使用的计费类型'}),
    disk: Flags.string({description: '库存查询使用的系统盘大小', default: '100GiB'}),
    diskType: Flags.string({description: '库存查询使用的系统盘类型', default: 'CLOUD_SSD'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceSearch)
    if (flags.available && flags.image === undefined) {
      throw new UsageError('--available 需要 --image, 因为库存取决于镜像与磁盘组合。')
    }
    const context = this.compshareContext()
    const params = CompshareContext.request({regionValue: flags.region})
    Object.assign(
      params,
      compact({
        Zone: flags.zone,
        MachineTypes: flags.gpu ? splitCsv(flags.gpu) : undefined,
        InstanceType: flags.spot ? 'spot' : 'uhost',
      }),
    )
    const legal = await call(context, 'DescribeAvailableCompShareInstanceTypes', params)

    const inventory: Record<string, Map<string, boolean>> = {}
    const inventoryResponse: Record<string, Array<Record<string, unknown>>> = {}
    if (flags.image !== undefined) {
      const machines = (legal.AvailableInstanceTypes as Array<Record<string, unknown>>) ?? []
      const machineTypes = [...new Set(machines.map((item) => String(item.Name)).filter(Boolean))].sort()
      for (const machineType of machineTypes) {
        const capacityParams = CompshareContext.request({regionValue: flags.region})
        Object.assign(capacityParams, {
          Zone: flags.zone,
          GpuType: machineType,
          MachineType: 'G',
          MinimalCpuPlatform: flags.platform,
          CompShareImageId: flags.image,
          ChargeType: flags.charge ?? (flags.spot ? 'Spot' : 'Postpay'),
          Disks: [{IsBoot: true, Type: flags.diskType, Size: diskGib(flags.disk)}],
        })
        const capacity = await call(context, 'CheckCompShareResourceCapacity', capacityParams)
        const specs = (capacity.Specs as Array<Record<string, unknown>>) ?? []
        inventoryResponse[machineType] = specs
        const stockMap = new Map<string, boolean>()
        for (const spec of specs) {
          stockMap.set(specKey(spec), Boolean(spec.ResourceEnough))
        }
        inventory[machineType] = stockMap
      }
    }

    const response: Record<string, unknown> = {...legal}
    if (flags.image !== undefined) {
      response.Inventory = inventoryResponse
    }
    this.compshareContext().renderer.data(response, {
      rows: searchRows(legal, inventory, flags.available),
      columns: [
        ['GpuType', 'GPU'],
        ['GPU', 'COUNT'],
        ['VRAM', 'VRAM'],
        ['CPU', 'CPU'],
        ['Memory', 'MEMORY'],
        ['Zone', 'ZONE'],
        ['Stock', 'IN STOCK'],
        ['Platforms', 'CPU PLATFORM'],
      ],
    })
  }
}
