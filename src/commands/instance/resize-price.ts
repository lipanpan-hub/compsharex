// cps instance resize-price: 查询实例升级价格

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {invoke} from '../../lib/compshare/api.js'
import {locateInstance} from '../../lib/compshare/location.js'
import {compact, memoryMib} from '../../lib/compshare/parsing.js'
import {UsageError} from '../../lib/compshare/errors.js'

export default class InstanceResizePrice extends CompshareBaseCommand {
  static description = '查询实例升级价格'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --cpu 16 --memory 64GiB --gpu 1']
  static aliases = ['instance:upgrade-price', 'ins:resize-price']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    cpu: Flags.integer({description: '目标 CPU 核数'}),
    memory: Flags.string({description: '目标内存, 例如 64GiB'}),
    gpu: Flags.integer({description: '目标 GPU 数量'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceResizePrice)
    if (flags.cpu === undefined && flags.memory === undefined && flags.gpu === undefined) {
      throw new UsageError('请至少指定 --cpu、--memory 或 --gpu 之一。')
    }
    const context = this.compshareContext()
    const [region, zone] = await locateInstance(context, args.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(
      params,
      compact({
        UHostId: args.instance,
        CPU: flags.cpu,
        Memory: flags.memory ? memoryMib(flags.memory) : undefined,
        GPU: flags.gpu,
      }),
    )
    await invoke(context, 'GetCompShareInstanceUpgradePrice', params)
  }
}
