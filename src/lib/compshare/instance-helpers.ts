// instance 命令组共享逻辑(移植自 compshare_cli/commands/instance.py 的私有 helpers)
// 模板方法模式: lifecycle/batchLifecycle 固化"定位→确认→调用→等待→渲染"骨架, 各命令通过参数定制。

import {setTimeout as delay} from 'node:timers/promises'

import {input as promptInput} from '@inquirer/prompts'

import {CompshareContext} from './context.js'
import type {ColumnTuple} from './output.js'

import {call, callCaptured, collectPages} from './api.js'
import {confirmDetails} from './confirm.js'
import {SilentExit, UsageError} from './errors.js'
import {locateInstance, locateInstances, supportedLocations, type LocatedInstance} from './location.js'
import {diskGib} from './parsing.js'
import {SSHCredentialCache, sshCachePath, sshCacheProfile} from './ssh-cache.js'

// #region 表格列与常量

// 实例列表列定义
export const INSTANCE_COLUMNS: readonly ColumnTuple[] = [
  ['UHostId', 'ID'],
  ['Name', 'NAME'],
  ['State', 'STATE'],
  ['GpuType', 'GPU'],
  ['GPU', 'COUNT'],
  ['CPU', 'CPU'],
  ['MemoryDisplay', 'MEMORY'],
  ['Region', 'REGION'],
  ['Zone', 'ZONE'],
  ['ChargeType', 'CHARGE'],
  ['InstancePrice', 'PRICE/H'],
]

// 监控指标 key → 展示标签
const MONITOR_METRIC_LABELS: Record<string, string> = {
  uhost_cpu_used: 'CPU',
  cloudwatch_memory_usage: 'MEMORY',
  cloudwatch_sys_disk_used_per: 'SYSTEM DISK',
  cloudwatch_data_disk_used_per: 'DATA DISKS',
  cloudwatch_gpu_memory_usage: 'VRAM',
  cloudwatch_gpu_util: 'GPU',
}

// show 子命令各 section 涉及的响应字段
export const INSTANCE_SECTION_KEYS: Record<string, readonly string[]> = {
  ip: ['IPSet'],
  softwares: ['Softwares'],
  spec: [
    'InstanceType',
    'MachineType',
    'GpuType',
    'GPU',
    'GraphicsMemory',
    'CPU',
    'Memory',
    'CpuPlatform',
    'CpuArch',
    'SupportWithoutGpuStart',
  ],
  disks: ['DiskSet', 'UDiskSet', 'VolumeSet', 'TotalDiskSpace', 'TotalVolumeSpace'],
  billing: [
    'ChargeType',
    'InstancePrice',
    'CompShareImagePrice',
    'DiskPrice',
    'DiskPriceInfo',
    'DiscountType',
    'AutoRenew',
    'IsExpire',
    'ExpireTime',
    'PostPayPowerOffBillingResource',
  ],
  image: [
    'CompShareImageId',
    'CompShareImageName',
    'CompShareImageType',
    'CompShareImageVersionName',
    'CompShareImageStatus',
    'CompShareImageAuthor',
    'OsName',
    'OsType',
    'BasicImageId',
    'BasicImageName',
  ],
  status: ['State', 'CreateTime', 'StartTime', 'StopTime', 'UpdateTime', 'SchedulerStopTime', 'ReleaseTime'],
}

// 集合类字段在 section 过滤时默认补空数组
export const INSTANCE_COLLECTION_KEYS = new Set([
  'DiskPriceInfo',
  'DiskSet',
  'IPSet',
  'PostPayPowerOffBillingResource',
  'Softwares',
  'UDiskSet',
  'VolumeSet',
])

// 等待期间的过渡态: 处于这些状态时继续轮询
const TRANSIENT_STATES = new Set([
  'Initializing',
  'Pending',
  'Rebooting',
  'Reinstalling',
  'Resizing',
  'Starting',
  'Stopping',
])

// #endregion

// #region 行构造

// 实例列表行: 追加 MemoryDisplay 便于表格展示
export function instanceRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const hosts = (response.UHostSet as Array<Record<string, unknown>>) ?? []
  return hosts.map((raw) => {
    const row: Record<string, unknown> = {...raw}
    row.MemoryDisplay = memoryDisplay(raw.Memory)
    return row
  })
}

// 内存值转展示文本: MiB → GiB
export function memoryDisplay(value: unknown): unknown {
  return typeof value === 'number' ? `${Math.floor(value / 1024)}GiB` : value
}

// 取时间戳最大的数据点作为最新值
function latestPoint(values: Array<Record<string, unknown>>): Record<string, unknown> {
  let latest: Record<string, unknown> = {}
  for (const point of values) {
    if ((Number(point.Timestamp) || 0) >= (Number(latest.Timestamp) || 0)) {
      latest = point
    }
  }
  return latest
}

// 监控响应展开为行: 取每条序列最新数据点
export function monitorRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []
  const data = (response.Data as Record<string, unknown>) ?? {}
  const hosts = [
    ...((data.List as Array<Record<string, unknown>>) ?? []),
    ...((data.PodList as Array<Record<string, unknown>>) ?? []),
  ]
  for (const host of hosts) {
    const metrics = (host.Metrics as Array<Record<string, unknown>>) ?? []
    for (const metric of metrics) {
      const metricKey = String(metric.MetricKey ?? '')
      const results = (metric.Results as Array<Record<string, unknown>>) ?? [{}]
      for (const result of results) {
        const values = (result.Values as Array<Record<string, unknown>>) ?? []
        const latest = latestPoint(values)
        const tags = (result.TagMap as Record<string, unknown>) ?? {}
        rows.push({
          UHostId: result.ResourceId ?? host.UHostId ?? host.PodId,
          MetricKey: MONITOR_METRIC_LABELS[metricKey] ?? metricKey,
          Value: latest.Value,
          Timestamp: latest.Timestamp,
          Device: tags.gpu_bus_id ?? tags.mount ?? tags.disk,
        })
      }
    }
  }
  return rows
}

// #endregion

// #region 详情字段构造

// 实例默认详情字段(14 项)
export function defaultInstanceFields(
  host: Record<string, unknown>,
  region: string,
  zone: string,
): Array<[string, unknown]> {
  return [
    ['ID', host.UHostId],
    ['NAME', host.Name],
    ['STATE', host.State],
    ['GPU', `${host.GpuType ?? '-'} × ${host.GPU ?? '-'}`],
    ['CPU', host.CPU],
    ['MEMORY', memoryDisplay(host.Memory)],
    ['REGION', region],
    ['ZONE', zone],
    ['CHARGE', host.ChargeType],
    ['IMAGE', host.CompShareImageId ?? host.ImageId],
    ['Password', host.Password],
    ['SSH', host.SshLoginCommand],
    ['SOFTWARE', host.Softwares ?? null],
    ['DATA DISKS', host.DiskSet ?? host.UDiskSet],
  ]
}

// 按 section 过滤的详情字段
export function focusedInstanceFields(
  host: Record<string, unknown>,
  sections: readonly string[],
): Array<[string, unknown]> {
  const fields: Array<[string, unknown]> = []
  for (const section of sections) {
    switch (section) {
    case 'billing': {
      fields.push(
        ['CHARGE', host.ChargeType],
        ['INSTANCE PRICE', host.InstancePrice],
        ['IMAGE PRICE', host.CompShareImagePrice],
        ['DISK PRICE', host.DiskPrice],
        ['DISK PRICE INFO', host.DiskPriceInfo],
        ['DISCOUNT TYPE', host.DiscountType],
        ['AUTO RENEW', host.AutoRenew],
        ['IS EXPIRE', host.IsExpire],
        ['EXPIRE TIME', host.ExpireTime],
        ['POWER-OFF BILLING', host.PostPayPowerOffBillingResource],
      )
    
    break;
    }
    case 'disks': {
      fields.push(
        ['DISKS', host.DiskSet ?? host.UDiskSet],
        ['VOLUMES', host.VolumeSet],
        ['TOTAL DISK SPACE', host.TotalDiskSpace],
        ['TOTAL VOLUME SPACE', host.TotalVolumeSpace],
      )
    
    break;
    }
    case 'image': {
      fields.push(
        ['IMAGE', host.CompShareImageId],
        ['IMAGE NAME', host.CompShareImageName],
        ['IMAGE TYPE', host.CompShareImageType],
        ['IMAGE VERSION', host.CompShareImageVersionName],
        ['IMAGE STATUS', host.CompShareImageStatus],
        ['IMAGE AUTHOR', host.CompShareImageAuthor],
        ['OS', host.OsName],
        ['OS TYPE', host.OsType],
        ['BASIC IMAGE', host.BasicImageId],
        ['BASIC IMAGE NAME', host.BasicImageName],
      )
    
    break;
    }
    case 'ip': {
      fields.push(['IP SET', host.IPSet])
    
    break;
    }
    case 'softwares': {
      fields.push(['SOFTWARE', host.Softwares])
    
    break;
    }
    case 'spec': {
      fields.push(
        ['INSTANCE TYPE', host.InstanceType],
        ['MACHINE TYPE', host.MachineType],
        ['GPU', `${host.GpuType ?? '-'} × ${host.GPU ?? '-'}`],
        ['VRAM', host.GraphicsMemory],
        ['CPU', host.CPU],
        ['MEMORY', memoryDisplay(host.Memory)],
        ['CPU PLATFORM', host.CpuPlatform],
        ['CPU ARCH', host.CpuArch],
        ['SUPPORT WITHOUT GPU START', host.SupportWithoutGpuStart],
      )
    
    break;
    }
    case 'status': {
      fields.push(
        ['STATE', host.State],
        ['CREATE TIME', host.CreateTime],
        ['START TIME', host.StartTime],
        ['STOP TIME', host.StopTime],
        ['UPDATE TIME', host.UpdateTime],
        ['SCHEDULER STOP TIME', host.SchedulerStopTime],
        ['RELEASE TIME', host.ReleaseTime],
      )
    
    break;
    }
    // No default
    }
  }
  return fields
}

// 展开 collection 下的内存规格行(可选叠加库存过滤)
function collectionRows(
  machine: Record<string, unknown>,
  size: Record<string, unknown>,
  collection: Record<string, unknown>,
  gpuMemory: unknown,
  inventory: Record<string, Map<string, boolean>>,
  availableOnly: boolean,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []
  const memories = (collection.Memory as Array<unknown>) ?? []
  for (const memory of memories) {
    const machineName = String(machine.Name ?? '')
    // 库存键: GPU|CPU|内存 的组合标识
    const stock = inventory[machineName]?.get(`${size.Gpu}|${collection.Cpu}|${memory}`)
    if (availableOnly && stock !== true) {
      continue
    }
    rows.push({
      GpuType: machine.Name,
      GPU: size.Gpu,
      CPU: collection.Cpu,
      Memory: `${memory}GiB`,
      VRAM: gpuMemory ? `${gpuMemory}GiB` : null,
      Zone: machine.Zone,
      Stock: stock,
      Platforms: collection.MinimalCpuPlatform ?? [],
    })
  }
  return rows
}

// 规格搜索响应展开为行(可选叠加库存标记)
export function searchRows(
  response: Record<string, unknown>,
  inventory: Record<string, Map<string, boolean>> = {},
  availableOnly = false,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []
  const machines = (response.AvailableInstanceTypes as Array<Record<string, unknown>>) ?? []
  for (const machine of machines) {
    const gpuMemory = (machine.GraphicsMemory as Record<string, unknown>)?.Value
    const sizes = (machine.MachineSizes as Array<Record<string, unknown>>) ?? []
    for (const size of sizes) {
      const collections = (size.Collection as Array<Record<string, unknown>>) ?? []
      for (const collection of collections) {
        rows.push(...collectionRows(machine, size, collection, gpuMemory, inventory, availableOnly))
      }
    }
  }
  return rows
}

// #endregion

// #region 磁盘规格解析

// 解析启动盘 + 数据盘为 Disks 数组
export function diskList(
  bootDisk: string,
  bootType: string,
  dataDisks?: readonly string[],
): Array<Record<string, unknown>> {
  const disks = [{IsBoot: true, Type: bootType, Size: diskGib(bootDisk)}]
  for (const specification of dataDisks ?? []) {
    const parts = specification.split(':', 2)
    const size = diskGib(parts[0])
    const diskType = parts.length === 2 ? parts[1] : bootType
    disks.push({IsBoot: false, Type: diskType, Size: size})
  }
  return disks
}

// 解析共享存储列表为 Volumes 数组
export function volumeList(volumes?: readonly string[]): Array<Record<string, unknown>> | undefined {
  if (!volumes || volumes.length === 0) {
    return undefined
  }
  return volumes.map((specification) => {
    const parts = specification.split(':', 2)
    const size = diskGib(parts[0])
    const volumeType = parts.length === 2 ? parts[1] : 'UDisk'
    return {Type: volumeType, Size: size}
  })
}

// #endregion

// #region 交互选择器

// 列出选项并让用户输入序号选择; 仅一个候选时自动选中
export async function choose<T>(
  title: string,
  choices: readonly T[],
  label: (item: T) => string,
  defaultIndex = 1,
): Promise<T> {
  if (choices.length === 0) {
    throw new UsageError(`${title}: 没有可选项。`)
  }
  process.stdout.write(`\n${title}\n`)
  choices.forEach((item, index) => {
    process.stdout.write(`  ${index + 1}. ${label(item)}\n`)
  })
  if (choices.length === 1) {
    process.stdout.write('  已自动选择唯一选项。\n')
    return choices[0]
  }
  for (;;) {
    const raw = await promptInput({message: '请选择', default: String(defaultIndex)})
    const selected = Number(raw)
    if (Number.isInteger(selected) && selected >= 1 && selected <= choices.length) {
      return choices[selected - 1]
    }
    process.stderr.write(`请输入 1 到 ${choices.length} 之间的数字。\n`)
  }
}

// 超过单页数量的分页选择器: 输入 f 下一页, b 上一页
export async function choosePaginated<T>(
  title: string,
  choices: readonly T[],
  label: (item: T) => string,
  pageSize = 20,
): Promise<T> {
  if (pageSize < 1) {
    throw new Error('pageSize 必须为正数')
  }
  if (choices.length <= pageSize) {
    return choose(title, choices, label)
  }
  const pageCount = Math.ceil(choices.length / pageSize)
  let page = 0
  for (;;) {
    const start = page * pageSize
    const visible = choices.slice(start, start + pageSize)
    process.stdout.write(`\n${title} · 第 ${page + 1}/${pageCount} 页(共 ${choices.length} 项)\n`)
    visible.forEach((item, index) => {
      process.stdout.write(`  ${index + 1}. ${label(item)}\n`)
    })
    if (page > 0) {
      process.stdout.write('  b. 上一页\n')
    }
    if (page + 1 < pageCount) {
      process.stdout.write('  f. 下一页\n')
    }
    const raw = (await promptInput({message: '请选择', default: '1'})).trim().toLowerCase()
    if (raw === 'f' && page + 1 < pageCount) {
      page += 1
      continue
    }
    if (raw === 'b' && page > 0) {
      page -= 1
      continue
    }
    const selectedIndex = Number(raw)
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= visible.length) {
      return visible[selectedIndex - 1]
    }
    process.stderr.write('请输入列表中的序号, f 翻下一页, 或 b 翻上一页。\n')
  }
}

// #endregion

// #region 等待与状态

// 未显式指定 --wait 时: 人类交互终端默认等待
export function waitEnabled(context: CompshareContext, value?: boolean): boolean {
  if (value !== undefined) {
    return value
  }
  return !context.jsonOutput && Boolean(process.stdout.isTTY)
}

// 创建是异步操作: 人类与 Agent 模式默认都等待
export function createWaitEnabled(value?: boolean): boolean {
  return value === undefined ? true : value
}

export interface WaitForOptions {
  desired?: ReadonlySet<string> | null
  absent?: boolean
  timeout?: number
}

// 轮询实例状态直到进入期望状态/稳定态/超时(3s 间隔)
export async function waitForInstance(
  context: CompshareContext,
  instance: string,
  region: string,
  options: WaitForOptions = {},
): Promise<Record<string, unknown>> {
  const desired = options.desired ?? null
  const absent = options.absent ?? false
  const timeout = options.timeout ?? 600
  const started = Date.now()
  let previous: string | null = null
  for (;;) {
    const [response, error] = await callCaptured(context, 'DescribeCompShareInstance', {
      Region: region,
      UHostIds: [instance],
    })
    if (error) {
      throw new UsageError(String(error.message))
    }
    const payload = response ?? {}
    const hosts = (payload.UHostSet as Array<Record<string, unknown>>) ?? []
    if (absent && hosts.length === 0) {
      return payload
    }
    const current = hosts.length > 0 ? String(hosts[0].State ?? 'Unknown') : 'NotFound'
    if (hosts.length > 0 && desired !== null && desired.has(current)) {
      return payload
    }
    if (hosts.length > 0 && desired === null && !TRANSIENT_STATES.has(current)) {
      return payload
    }
    if (current !== previous && !context.jsonOutput) {
      process.stdout.write(`等待实例 ${instance}: ${current}\n`)
      previous = current
    }
    if (Date.now() - started >= timeout * 1000) {
      throw new UsageError(`等待实例 ${instance} 超过 ${timeout}s 仍未完成。`)
    }
    await delay(3000)
  }
}

// #endregion

// #region 价格与项目

// 从报价响应求总价: PriceDetails[0] 各分项求和 × 数量
export function priceTotal(price: Record<string, unknown>, count: number): number | undefined {
  const details = (price.PriceDetails as Array<Record<string, unknown>>) ?? []
  if (details.length === 0) {
    return undefined
  }
  let total = 0
  let found = false
  for (const key of ['Instance', 'Disks', 'SystemDisks', 'CompShareImage']) {
    const value = details[0][key]
    if (typeof value !== 'number' && typeof value !== 'string') {
      continue
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      continue
    }
    total += parsed
    found = true
  }
  return found ? total * count : undefined
}

// 项目 ID: 显式传入优先, 否则取 GetProjectList 的默认项目
export async function projectId(context: CompshareContext, explicit?: string): Promise<string> {
  if (explicit) {
    return explicit
  }
  const response = await call(context, 'GetProjectList', {})
  const projects = (response.ProjectSet as Array<Record<string, unknown>>) ?? []
  const selected = projects.find((item) => item.IsDefault) ?? projects[0]
  if (!selected || !selected.ProjectId) {
    throw new UsageError('GetProjectList 未返回项目, 请显式传入 --project-id。')
  }
  return String(selected.ProjectId)
}

// #endregion

// #region 创建向导步骤

// 确定 Region/Zone: 显式传入优先, 否则交互选择可用区
export async function createLocation(
  context: CompshareContext,
  region?: string,
  zone?: string,
  options: {interactive?: boolean} = {},
): Promise<[string, string]> {
  if (region !== undefined && zone !== undefined) {
    return [region, zone]
  }
  if (options.interactive === false) {
    throw new UsageError('非交互式创建必须同时提供 --region 与 --zone。')
  }
  const zones = (await supportedLocations(context, region)).filter(
    (item) => item.Region && item.Zone && (region === undefined || item.Region === region) && (zone === undefined || item.Zone === zone),
  )
  const selected = await choose('可用区', zones, (item) => `${item.Describe ?? item.Zone} (${item.Region} / ${item.Zone})`)
  return [String(selected.Region), String(selected.Zone)]
}

// 确定 GPU 型号: 显式传入优先, 否则交互选择
export async function createGpu(
  context: CompshareContext,
  region: string,
  zone: string,
  gpu?: string,
): Promise<string> {
  if (gpu !== undefined) {
    return gpu
  }
  const response = await call(context, 'DescribeAvailableCompShareInstanceTypes', {
    Region: region,
    Zone: zone,
    InstanceType: 'uhost',
  })
  const machines = (response.AvailableInstanceTypes as Array<Record<string, unknown>>) ?? []
  const selected = await choose('GPU 型号', machines, (machine) => {
    const memory = (machine.GraphicsMemory as Record<string, unknown>)?.Value
    const suffix = memory ? ` · ${memory}GiB VRAM` : ''
    return `${machine.Name}${suffix}`
  })
  if (!selected.Name) {
    throw new UsageError('机型接口返回了没有名称的 GPU。')
  }
  return String(selected.Name)
}

// 镜像源 → API 与 list key 的映射
const IMAGE_SOURCE_ACTIONS: Record<string, string> = {
  platform: 'DescribeCompShareImages',
  custom: 'DescribeCompShareCustomImages',
  community: 'DescribeCommunityImages',
  shared: 'DescribeCompShareSharingImages',
}

// 拉取候选镜像列表(四个来源, 过滤 Status==Available)
export async function createImages(
  context: CompshareContext,
  region: string,
  zone: string,
  source?: string,
): Promise<Array<Record<string, unknown>>> {
  const sources = ['platform', 'custom', 'community', 'shared']
  const selectedSource = source ? source.toLowerCase() : await choose('镜像来源', sources, (value) => value)
  const action = IMAGE_SOURCE_ACTIONS[selectedSource]
  if (!action) {
    throw new UsageError('--image-source 必须是 platform、custom、community 或 shared。')
  }
  const params: Record<string, unknown> = {Region: region}
  if (selectedSource !== 'shared') {
    params.Zone = zone
  }
  const listKey = selectedSource === 'community' ? 'CompshareImageGroup' : 'ImageSet'
  const response = await collectPages(context, action, params, listKey)
  let images: Array<Record<string, unknown>>
  if (selectedSource === 'community') {
    images = []
    const groups = (response.CompshareImageGroup as Array<Record<string, unknown>>) ?? []
    for (const group of groups) {
      const items = (group.Data as Array<Record<string, unknown>>) ?? []
      for (const raw of items) {
        images.push({Name: group.ImageName, ...raw})
      }
    }
  } else {
    images = (response.ImageSet as Array<Record<string, unknown>>) ?? []
  }
  return images.filter((image) => image.CompShareImageId && (image.Status ?? 'Available') === 'Available')
}

// 确定镜像 ID: 显式传入优先, 否则可过滤 + 分页选择
export async function createImage(
  context: CompshareContext,
  region: string,
  zone: string,
  image?: string,
  source?: string,
): Promise<string> {
  if (image !== undefined) {
    return image
  }
  let images = await createImages(context, region, zone, source)
  if (images.length > 1) {
    const query = (await promptInput({message: '按名称或 ID 过滤镜像(留空显示全部)', default: ''})).trim()
    if (query) {
      const normalized = query.toLowerCase()
      images = images.filter(
        (item) =>
          String(item.Name ?? '').toLowerCase().includes(normalized) ||
          String(item.CompShareImageId ?? '').toLowerCase().includes(normalized),
      )
    }
  }
  const selected = await choosePaginated('镜像', images, (item) => {
    const author = item.Author ? ` · ${item.Author}` : ''
    return `${item.Name ?? '未命名'}${author} · ${item.CompShareImageId}`
  })
  return String(selected.CompShareImageId)
}

// 确定计费类型: 显式传入优先, 否则交互选择
export async function createCharge(charge?: string): Promise<string> {
  if (charge !== undefined) {
    return charge
  }
  return choose('计费类型', ['Postpay', 'Spot', 'Day', 'Month'], (value) => value)
}

// #endregion

// #region 生命周期骨架(模板方法)

export interface LifecycleOptions {
  yes: boolean
  extra?: Record<string, unknown>
  wait?: boolean
  timeout?: number
  desired?: ReadonlySet<string> | null
  absent?: boolean
}

// 单实例操作骨架: 定位 → 确认 → 调用 → 等待 → 成功渲染
export async function lifecycle(
  context: CompshareContext,
  action: string,
  instance: string,
  message: string,
  options: LifecycleOptions,
): Promise<void> {
  const [region, zone] = await locateInstance(context, instance)
  await confirmDetails(
    context,
    '操作计划',
    [
      ['INSTANCE', instance],
      ['ACTION', message.replace(/\?$/, '')],
    ],
    '确认执行该操作?',
    options.yes,
  )
  const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
  params.UHostId = instance
  Object.assign(params, options.extra ?? {})
  const submitted = await call(context, action, params)
  const result: Record<string, unknown> = {operation: submitted}
  if (waitEnabled(context, options.wait)) {
    result.final = await waitForInstance(context, instance, region, {
      desired: options.desired,
      absent: options.absent,
      timeout: options.timeout,
    })
  }
  context.renderer.success('操作完成', result)
}

export interface BatchItem {
  instance: string
  region?: string
  zone?: string
  operation?: Record<string, unknown>
  final?: Record<string, unknown>
  error?: Record<string, unknown>
}

// 批量结果渲染: 部分失败时输出 partial_failure 并以退出码 1 结束
export async function renderBatch(
  context: CompshareContext,
  action: string,
  succeeded: BatchItem[],
  failed: BatchItem[],
): Promise<void> {
  const payload: Record<string, unknown> = {
    ok: failed.length === 0,
    action,
    succeeded,
    failed,
  }
  if (failed.length > 0) {
    payload.error = {code: 'partial_failure', message: '部分实例操作失败。'}
  }
  const rows: Array<Record<string, unknown>> = succeeded.map((item) => ({
    UHostId: item.instance,
    Status: 'Succeeded',
    Message: '',
  }))
  rows.push(
    ...failed.map((item) => ({
      UHostId: item.instance,
      Status: 'Failed',
      Message: (item.error as Record<string, unknown> | undefined)?.message,
    })),
  )
  context.renderer.data(payload, {
    rows,
    columns: [
      ['UHostId', 'INSTANCE'],
      ['Status', 'STATUS'],
      ['Message', 'MESSAGE'],
    ],
  })
  if (failed.length > 0) {
    throw new SilentExit(1)
  }
}

export interface BatchLifecycleOptions {
  yes?: boolean
  confirmOperation?: boolean
  extra?: Record<string, unknown>
  wait?: boolean
  timeout?: number
  desired?: ReadonlySet<string> | null
  absent?: boolean
}

// 多实例批量操作骨架: 去重定位 → 确认 → 逐个调用(失败隔离) → 批量渲染
export async function batchLifecycle(
  context: CompshareContext,
  action: string,
  instances: readonly string[],
  message: string,
  options: BatchLifecycleOptions = {},
): Promise<void> {
  const requested = [...new Set(instances)]
  const [locations, missing] = await locateInstances(context, requested)
  if (options.confirmOperation) {
    await confirmDetails(
      context,
      '操作计划',
      [
        ['INSTANCE', requested],
        ['ACTION', message.replace(/\?$/, '')],
      ],
      '确认执行该操作?',
      options.yes ?? true,
    )
  }

  const succeeded: BatchItem[] = []
  const failed: BatchItem[] = missing.map((instance) => ({
    instance,
    error: {message: `未找到实例 ${instance}。`},
  }))
  for (const instance of requested) {
    const location: LocatedInstance | undefined = locations.get(instance)
    if (!location) {
      continue
    }
    const {region, zone} = location
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(params, {UHostId: instance, ...options.extra})
    const [submitted, error] = await callCaptured(context, action, params)
    if (error) {
      failed.push({instance, region, zone, error})
      continue
    }
    const result: BatchItem = {instance, region, zone, operation: submitted ?? {}}
    if (waitEnabled(context, options.wait)) {
      try {
        result.final = await waitForInstance(context, instance, region, {
          desired: options.desired,
          absent: options.absent,
          timeout: options.timeout,
        })
      } catch (error) {
        failed.push({
          instance,
          region,
          zone,
          operation: submitted ?? {},
          error: {message: String(error), phase: 'wait'},
        })
        continue
      }
    }
    succeeded.push(result)
  }
  await renderBatch(context, action, succeeded, failed)
}

// #endregion

// #region 定时关机

// 从实例详情解析定时关机时间(0/空值视为未设置)
export function schedulerStopTimeOf(host: Record<string, unknown>): number | undefined {
  const value = host.SchedulerStopTime
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
    return undefined
  }
  const stopTime = Number(value)
  if (!Number.isInteger(stopTime) || String(value).trim() === '') {
    throw new UsageError(`接口返回了非法的定时关机时间: ${String(value)}。`)
  }
  return stopTime > 0 ? stopTime : undefined
}

// 构造定时关机的 JSON 负载
export function schedulePayload(instance: string, stopTime?: number): Record<string, unknown> {
  return {
    instance,
    scheduled: stopTime !== undefined,
    scheduler_stop_time: stopTime ?? null,
    scheduler_stop_at: stopTime !== undefined ? new Date(stopTime * 1000).toISOString() : null,
  }
}

// #endregion

// #region SSH 凭据缓存辅助

// 构建当前档案的 SSH 缓存命名空间
export function sshCacheNamespace(context: CompshareContext): string {
  const profile = context.profile
  const name = context.profileName ?? profile.name
  return sshCacheProfile(name, profile.accessKeyId ?? '')
}

// 删除实例的 SSH 凭据缓存(重置密码/重装系统后连接信息会失效)
export function invalidateSshCredential(context: CompshareContext, instance: string): void {
  new SSHCredentialCache(sshCachePath(cacheDirectory(context))).delete(sshCacheNamespace(context), instance)
}

// 配置目录(缓存文件与 config.yml 同目录)
function cacheDirectory(context: CompshareContext): string {
  return context.configDirectory
}

// #endregion
