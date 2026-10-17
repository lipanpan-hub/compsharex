// 资源定位工具(移植自 compshare_cli/location.py)
// 从 API 响应中确定 Region/Zone, 不做任何本地默认值臆造

import type {CompshareContext} from './context.js'

import {call, collectPages} from './api.js'
import {UsageError} from './errors.js'

// 查询支持的可用区列表
export async function supportedLocations(
  context: CompshareContext,
  requestRegion?: string,
): Promise<Array<Record<string, unknown>>> {
  const params = requestRegion !== undefined ? {Region: requestRegion} : {}
  const response = await call(context, 'DescribeCompShareSupportZone', params)
  return ((response.ZoneInfo as Array<Record<string, unknown>>) ?? [])
}

// 从实例详情中提取 Region/Zone(缺失时报错)
export function instanceLocation(
  host: Record<string, unknown>,
  instance?: string,
): [string, string] {
  const region = host.Region
  const zone = host.Zone
  if (region && zone) {
    return [String(region), String(zone)]
  }
  const identifier = instance ?? String(host.UHostId ?? '')
  throw new UsageError(`DescribeCompShareInstance 未返回实例 ${identifier} 的 Region 与 Zone。`)
}

// 定位单个实例, 返回 [Region, Zone, 实例详情]
export async function locateInstance(
  context: CompshareContext,
  instance: string,
  requestRegion?: string,
): Promise<[string, string, Record<string, unknown>]> {
  const params: Record<string, unknown> = {UHostIds: [instance], Limit: 1, Offset: 0}
  if (requestRegion !== undefined) {
    params.Region = requestRegion
  }
  const response = await call(context, 'DescribeCompShareInstance', params)
  const hosts = (response.UHostSet as Array<Record<string, unknown>>) ?? []
  const host = hosts.find((item) => String(item.UHostId ?? '') === instance)
  if (host) {
    const [region, zone] = instanceLocation(host, instance)
    return [region, zone, host]
  }
  throw new UsageError(`未找到实例 ${instance}。`)
}

export interface LocatedInstance {
  region: string
  zone: string
  host: Record<string, unknown>
}

// 一次库存请求批量定位实例, 保持请求顺序; 返回 [已定位映射, 未找到列表]
export async function locateInstances(
  context: CompshareContext,
  instances: readonly string[],
): Promise<[Map<string, LocatedInstance>, string[]]> {
  const requested = [...new Set(instances)]
  const remaining = new Set(requested)
  const found = new Map<string, LocatedInstance>()
  const response = await collectPages(context, 'DescribeCompShareInstance', {UHostIds: requested}, 'UHostSet')
  const hosts = (response.UHostSet as Array<Record<string, unknown>>) ?? []
  for (const host of hosts) {
    const instance = String(host.UHostId ?? '')
    if (!remaining.has(instance)) {
      continue
    }
    const [region, zone] = instanceLocation(host, instance)
    found.set(instance, {region, zone, host})
    remaining.delete(instance)
  }
  return [found, requested.filter((instance) => remaining.has(instance))]
}

// 用磁盘库存 API 定位磁盘(无论是否已挂载)
// 返回 [Region, Zone, 挂载实例(可为 null), 磁盘详情]
export async function locateDisk(
  context: CompshareContext,
  diskId: string,
  requestRegion?: string,
): Promise<[string, string, Record<string, unknown> | null, Record<string, unknown>]> {
  const params: Record<string, unknown> = requestRegion !== undefined ? {Region: requestRegion} : {}
  const response = await call(context, 'DescribeCompshareDisk', params)
  const diskSet = (response.DiskSet as Array<Record<string, unknown>>) ?? []
  const disk = diskSet.find((item) => String(item.ResourceId ?? '') === diskId)
  if (!disk) {
    throw new UsageError(`未找到磁盘 ${diskId}。`)
  }

  const zone = String(disk.Zone ?? '')
  const locations = await supportedLocations(context, requestRegion)
  const location = locations.find((item) => String(item.Zone ?? '') === zone && item.Region)
  if (!location) {
    throw new UsageError(`DescribeCompshareDisk 未返回磁盘 ${diskId} 的已知位置。`)
  }

  const region = String(location.Region)
  const mountInstance = disk.MountInstance
  const host = mountInstance ? {UHostId: String(mountInstance), Region: region, Zone: zone} : null
  return [region, zone, host, disk]
}
