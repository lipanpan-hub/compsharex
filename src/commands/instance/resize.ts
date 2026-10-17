// cps instance resize: 变更实例 CPU/内存/GPU 或磁盘大小

import {Args, Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {lifecycle} from '../../lib/compshare/instance-helpers.js'
import {locateInstance} from '../../lib/compshare/location.js'
import {compact, diskGib, memoryMib} from '../../lib/compshare/parsing.js'

export default class InstanceResize extends CompshareBaseCommand {
  static aliases = ['ins:resize']
  static description = '变更实例 CPU、内存、GPU 或磁盘大小'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --cpu 16 --memory 64GiB --gpu 1']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    cpu: Flags.integer({description: '目标 CPU 核数'}),
    memory: Flags.string({description: '目标内存, 例如 64GiB'}),
    gpu: Flags.integer({description: '目标 GPU 数量'}),
    withoutGpu: Flags.string({description: '目标无 GPU 规格: A 或 B'}),
    disk: Flags.string({description: '待扩容的磁盘 ID'}),
    diskSize: Flags.string({description: '目标磁盘大小, 例如 200GiB'}),
    coupon: Flags.string({description: '代金券 ID'}),
    dryRun: Flags.boolean({description: '只校验并展示请求, 不变更资源', default: false}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceResize)
    const context = this.compshareContext()
    const isComputeResize = flags.cpu !== undefined || flags.memory !== undefined || flags.gpu !== undefined || flags.withoutGpu !== undefined
    const isDiskResize = flags.disk !== undefined || flags.diskSize !== undefined
    if (!isComputeResize && !isDiskResize) {
      throw new UsageError('请指定计算目标, 或同时提供 --disk 与 --disk-size。')
    }
    if (flags.disk === undefined !== (flags.diskSize === undefined)) {
      throw new UsageError('--disk 与 --disk-size 必须一起使用。')
    }
    if (isComputeResize && isDiskResize) {
      throw new UsageError('计算规格变更与磁盘扩容必须分开操作。')
    }
    if (flags.withoutGpu !== undefined && (flags.cpu !== undefined || flags.memory !== undefined || flags.gpu !== undefined)) {
      throw new UsageError('--without-gpu 不能与 --cpu、--memory 或 --gpu 组合使用。')
    }
    if (flags.withoutGpu === undefined && isComputeResize && (flags.cpu === undefined || flags.memory === undefined || flags.gpu === undefined)) {
      throw new UsageError('计算规格变更需要同时提供 --cpu、--memory 和 --gpu。')
    }
    const params = compact({
      Cpu: flags.cpu,
      Memory: flags.memory ? memoryMib(flags.memory) : undefined,
      Gpu: flags.gpu,
      WithoutGpuSpec: flags.withoutGpu,
      DiskId: flags.disk,
      DiskSpace: flags.diskSize ? diskGib(flags.diskSize) : undefined,
      CouponId: flags.coupon,
    })

    if (flags.dryRun) {
      // dry-run: 计算规格变更时附带升级报价
      let quote: Record<string, unknown> = {}
      if (isComputeResize && flags.withoutGpu === undefined) {
        const [region, zone] = await locateInstance(context, args.instance)
        const quoteParams = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
        Object.assign(quoteParams, {
          UHostId: args.instance,
          CPU: flags.cpu,
          Memory: memoryMib(flags.memory as string),
          GPU: flags.gpu,
        })
        quote = await call(context, 'GetCompShareInstanceUpgradePrice', quoteParams)
      }
      context.renderer.details(
        '操作计划',
        [
          ['INSTANCE', args.instance],
          ['ACTION', 'Resize'],
          ['REQUEST', params],
          ['PRICE', quote],
        ],
        {dry_run: true, instance: args.instance, request: params, price: quote},
      )
      return
    }
    await lifecycle(context, 'ResizeCompShareInstance', args.instance, '变更实例规格', {
      yes: flags.yes,
      extra: params,
      wait: flags.wait,
      timeout: flags.timeout,
    })
  }
}
