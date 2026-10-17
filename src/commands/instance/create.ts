// cps instance create: 交互式或全参数创建实例

import {Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {InstanceTemplateStore, templatePath} from '../../lib/compshare/instance-template-store.js'
import {
  choose,
  createCharge,
  createGpu,
  createImage,
  createLocation,
  createWaitEnabled,
  diskList,
  priceTotal,
  waitForInstance,
} from '../../lib/compshare/instance-helpers.js'
import {compact, memoryMib, money} from '../../lib/compshare/parsing.js'
import {timedInput} from '../../lib/prompts.js'

// 模板 store 延后实现, 先支持显式参数与交互向导
// (计划中的 instance-template 任务将补回 --template)

export default class InstanceCreate extends CompshareBaseCommand {
  static aliases = ['ins:create', 'ins:new']
  static description = '创建实例: 支持交互式向导或显式参数自动化'
  static examples = [
    '<%= config.bin %> <%= command.id %> --gpu 4090 --count 1 --cpu 16 --memory 64GiB --image <IMAGE_ID> --region cn-bj2 --zone cn-bj2-a --yes',
  ]

  static flags = {
    ...compshareGlobalFlags,
    template: Flags.string({description: '本地实例模板名称; 显式选项优先于模板值'}),
    gpu: Flags.string({description: 'GPU 型号, 例如 4090'}),
    count: Flags.integer({description: 'GPU 数量'}),
    cpu: Flags.integer({description: 'CPU 核数'}),
    memory: Flags.string({description: '内存, 例如 64GiB'}),
    image: Flags.string({description: '镜像 ID'}),
    imageSource: Flags.string({description: '镜像来源: platform、custom、community 或 shared'}),
    region: Flags.string({description: '地域'}),
    zone: Flags.string({description: '可用区'}),
    disk: Flags.string({description: '系统盘大小'}),
    diskType: Flags.string({description: '系统盘类型'}),
    dataDisk: Flags.string({description: '数据盘, 格式 SIZE[:TYPE]; 可重复', multiple: true}),
    charge: Flags.string({description: '计费类型'}),
    quantity: Flags.integer({description: '预付费模式的计费时长'}),
    name: Flags.string({description: '实例名称'}),
    platform: Flags.string({description: '最低 CPU 平台'}),
    remark: Flags.string({description: '实例备注'}),
    firewall: Flags.string({description: '安全组 ID'}),
    maxCount: Flags.integer({description: '实例数量'}),
    us3: Flags.boolean({description: '创建容器时挂载 US3', allowNo: true}),
    dryRun: Flags.boolean({description: '只校验并展示请求, 不变更资源', default: false}),
    maxPrice: Flags.string({description: '可接受的总报价上限(人民币)'}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceCreate)
    const context = this.compshareContext()

    // 模板参数作默认值, 显式 flag 优先
    const templateParameters: Record<string, unknown> = {}
    if (flags.template !== undefined) {
      const store = new InstanceTemplateStore(templatePath(context.configDirectory))
      Object.assign(templateParameters, store.get(flags.template).parameters)
    }
    const pick = <T>(value: T | undefined, key: string): T | undefined => (value !== undefined ? value : (templateParameters[key] as T | undefined))

    const gpu = pick(flags.gpu, 'gpu')
    const count = pick(flags.count, 'count')
    const cpu = pick(flags.cpu, 'cpu')
    const memory = pick(flags.memory, 'memory')
    const image = pick(flags.image, 'image')
    const imageSource = pick(flags.imageSource, 'image_source')
    const region = pick(flags.region, 'region')
    const zone = pick(flags.zone, 'zone')
    const dataDisk = pick(flags.dataDisk?.length ? flags.dataDisk : undefined, 'data_disk') as string[] | undefined
    const name = pick(flags.name, 'name')
    const platform = pick(flags.platform, 'platform')
    const remark = pick(flags.remark, 'remark')
    const firewall = pick(flags.firewall, 'firewall')
    const quantity = pick(flags.quantity, 'quantity')
    const maxCount = pick(flags.maxCount, 'max_count')
    const us3 = pick(flags.us3, 'us3')
    let charge = pick(flags.charge, 'charge') as string | undefined
    let bootDisk = pick(flags.disk, 'disk') as string | undefined
    let bootType = pick(flags.diskType, 'disk_type') as string | undefined

    const resolvedQuantity = quantity ?? 1
    const resolvedPlatform = platform ?? 'Auto'
    const resolvedMaxCount = maxCount ?? 1
    const resolvedUs3 = us3 ?? false
    const isInteractive = [count, cpu, gpu, image, memory, region, zone].includes(undefined)
    if (isInteractive && context.jsonOutput) {
      throw new UsageError(
        'JSON 模式无法进入交互向导; 请提供 --gpu、--count、--cpu、--memory、--image、--region 和 --zone。',
      )
    }

    // #region 确定位置/GPU/镜像/计费/磁盘
    const [resolvedRegion, selectedZone] = await createLocation(context, region, zone, {interactive: !context.jsonOutput})
    const resolvedGpu = await createGpu(context, resolvedRegion, selectedZone, gpu)
    const resolvedImage = await createImage(context, resolvedRegion, selectedZone, image, imageSource)
    charge = isInteractive ? await createCharge(charge) : charge ?? 'Postpay'
    if (isInteractive) {
      // 系统盘配置有默认值, 超时未输入时取默认值
      bootDisk = bootDisk ?? (await timedInput({message: '系统盘大小', default: '100GiB'}))
      bootType = bootType ?? (await timedInput({message: '系统盘类型', default: 'CLOUD_SSD'}))
    } else {
      bootDisk = bootDisk ?? '100GiB'
      bootType = bootType ?? 'CLOUD_SSD'
    }
    // #endregion

    const disks = diskList(bootDisk, bootType, dataDisk)
    const common = {Region: resolvedRegion, Zone: selectedZone}

    // #region 查询库存并匹配规格
    const capacityParams: Record<string, unknown> = {...common}
    Object.assign(capacityParams, {
      GpuType: resolvedGpu,
      MachineType: 'G',
      MinimalCpuPlatform: resolvedPlatform,
      CompShareImageId: resolvedImage,
      ChargeType: charge,
      Disks: disks,
    })
    const capacity = await call(context, 'CheckCompShareResourceCapacity', capacityParams)
    const requestedMemoryGiB = memory !== undefined ? Math.floor(memoryMib(memory) / 1024) : undefined
    const specs = (capacity.Specs as Array<Record<string, unknown>>) ?? []
    const matching = specs.filter(
      (spec) =>
        spec.ResourceEnough &&
        (count === undefined || spec.Gpu === count) &&
        (cpu === undefined || spec.Cpu === cpu) &&
        (requestedMemoryGiB === undefined || spec.Mem === requestedMemoryGiB),
    )
    if (matching.length === 0) {
      context.renderer.error('所选 GPU、CPU、内存、镜像、计费与磁盘组合没有可用库存。', {details: {capacity}})
      process.exitCode = 2
      return
    }
    let selectedSpec = matching[0]
    if (isInteractive && [count, cpu, memory].includes(undefined)) {
      selectedSpec = await choose('可用规格', matching, (spec) => `GPU ×${spec.Gpu} · ${spec.Cpu} CPU · ${spec.Mem}GiB 内存`)
    }
    const resolvedCount = Number(count ?? selectedSpec.Gpu)
    const resolvedCpu = Number(cpu ?? selectedSpec.Cpu)
    const resolvedMemoryGiB = Number(requestedMemoryGiB ?? selectedSpec.Mem)
    const memoryMb = resolvedMemoryGiB * 1024
    // #endregion

    // #region 报价与上限校验
    const priceParams: Record<string, unknown> = {...common}
    Object.assign(priceParams, {
      GpuType: resolvedGpu,
      Gpu: resolvedCount,
      Cpu: resolvedCpu,
      Memory: memoryMb,
      ChargeType: charge,
      Disks: disks,
      CompShareImageId: resolvedImage,
      Quantity: resolvedQuantity,
    })
    const price = await call(context, 'GetCompShareInstancePrice', priceParams)
    const amount = priceTotal(price, resolvedMaxCount)
    const priceText = amount === undefined ? 'unknown' : formatPrice(amount)
    const priceLimit = flags.maxPrice !== undefined ? money(flags.maxPrice) : undefined
    if (priceLimit !== undefined && amount === undefined) {
      throw new UsageError('接口未返回价格, 无法执行 --max-price 校验。')
    }
    if (priceLimit !== undefined && amount !== undefined && amount > priceLimit) {
      throw new UsageError(`报价 ${priceText} 元超过 --max-price ${formatPrice(priceLimit)} 元, 未创建实例。`)
    }
    // #endregion

    const createParams: Record<string, unknown> = {...common}
    Object.assign(
      createParams,
      compact({
        GpuType: resolvedGpu,
        GPU: resolvedCount,
        CPU: resolvedCpu,
        Memory: memoryMb,
        MachineType: 'G',
        MinimalCpuPlatform: resolvedPlatform,
        CompShareImageId: resolvedImage,
        Disks: disks,
        ChargeType: charge,
        Quantity: resolvedQuantity,
        Name: name,
        Remark: remark,
        SecurityGroupId: firewall,
        MaxCount: resolvedMaxCount,
        EnableUS3: resolvedUs3 || undefined,
      }),
    )
    const selection = {
      Region: resolvedRegion,
      Zone: selectedZone,
      GpuType: resolvedGpu,
      GPU: resolvedCount,
      CPU: resolvedCpu,
      Memory: memoryMb,
      CompShareImageId: resolvedImage,
      Disks: disks,
      ChargeType: charge,
      MaxCount: resolvedMaxCount,
    }
    const planFields: Array<[string, unknown]> = [
      ['ZONE', selectedZone],
      ['GPU', `${resolvedGpu} × ${resolvedCount}`],
      ['CPU', resolvedCpu],
      ['MEMORY', `${resolvedMemoryGiB}GiB`],
      ['IMAGE', resolvedImage],
      ['SYSTEM DISK', `${bootDisk}:${bootType}`],
      ['CHARGE', charge],
      ['COUNT', resolvedMaxCount],
      ['PRICE', priceText],
    ]

    if (flags.dryRun) {
      context.renderer.details('创建计划', planFields, {
        template: flags.template ?? null,
        dry_run: true,
        max_price: priceLimit === undefined ? null : String(priceLimit),
        selection,
        capacity: selectedSpec,
        price,
        request: createParams,
      })
      return
    }
    await confirmDetails(context, '创建计划', planFields, '确认执行该操作?', flags.yes)

    const created = await call(context, 'CreateCompShareInstance', createParams)
    const result: Record<string, unknown> = {selection, capacity: selectedSpec, price, instance: created}
    let ids = (created.UHostIds as string[] | undefined) ?? (created.UHostId as string[] | string | undefined) ?? []
    if (typeof ids === 'string') {
      ids = [ids]
    }
    if (createWaitEnabled(flags.wait)) {
      const finals: Array<Record<string, unknown>> = []
      for (const item of ids) {
        finals.push(await waitForInstance(context, item, resolvedRegion, {desired: new Set(['Running']), timeout: flags.timeout}))
      }
      result.final = finals
    }
    context.renderer.details(
      '操作完成',
      [
        ['INSTANCE', ids],
        ['Password', created.Password],
        ['ZONE', selectedZone],
        ['GPU', `${resolvedGpu} × ${resolvedCount}`],
        ['PRICE', priceText],
      ],
      result,
    )
  }
}

// 金额输出: 去掉多余的尾零
function formatPrice(value: number): string {
  return String(Number(value.toFixed(2)))
}
