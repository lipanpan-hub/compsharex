// bandwidth 命令组共享工具(移植自 commands/bandwidth.py 内部函数)

import {UsageError} from './errors.js'

// 带宽清单统一列定义
export const BANDWIDTH_COLUMNS = [
  ['ShareBandwidthId', 'BANDWIDTH ID'],
  ['Region', 'REGION'],
  ['Zone', 'ZONE'],
  ['Bandwidth', 'BANDWIDTH (Mbps)'],
  ['Status', 'STATUS'],
  ['ChargeType', 'CHARGE'],
  ['BindEIPCount', 'EIPS'],
  ['PurchaseValue', 'EXPIRES'],
] as const satisfies readonly (readonly [string, string])[]

// 带宽详情 JSON 投影字段(与表格列不同)
export const BANDWIDTH_JSON_FIELDS = [
  'ShareBandwidthId',
  'ResourceId',
  'Region',
  'Zone',
  'Bandwidth',
  'Status',
  'ChargeType',
  'Quantity',
  'PurchaseValue',
  'BindEIPCount',
  'BindEIPInfo',
  'CreateTime',
  'UpdateTime',
] as const

// EIP 分配清单统一列定义
export const EIP_COLUMNS = [
  ['UHostId', 'INSTANCE'],
  ['Name', 'NAME'],
  ['Zone', 'ZONE'],
  ['IP', 'PUBLIC IP'],
  ['EIPId', 'EIP ID'],
  ['Scope', 'BANDWIDTH SCOPE'],
  ['Bandwidth', 'BANDWIDTH (Mbps)'],
  ['CanSwitch', 'CAN SWITCH'],
] as const satisfies readonly (readonly [string, string])[]

// EIP 分配 JSON 投影字段
export const EIP_JSON_FIELDS = [
  ...EIP_COLUMNS.map(([key]) => key),
  'Region',
  'ShareBandwidthId',
  'TargetScope',
]

// 计费类型别名 → 标准值
export function chargeType(value: string): string {
  const mapping: Record<string, string> = {month: 'Month', year: 'Year'}
  const charge = mapping[value.toLowerCase()]
  if (charge === undefined) {
    throw new UsageError('--charge 必须是 Month 或 Year。')
  }
  return charge
}

// 目标带宽别名 → [API TargetScope, 中文标签]
export function targetScope(value: string): [string, string] {
  const mapping: Record<string, [string, string]> = {
    company: ['Company', '独立带宽'],
    dedicated: ['Company', '独立带宽'],
    public: ['Public', '共享带宽'],
    shared: ['Public', '共享带宽'],
  }
  const target = mapping[value.toLowerCase()]
  if (target === undefined) {
    throw new UsageError('--to 必须是 dedicated 或 shared。')
  }
  return target
}

// 分 → 元的展示金额; signed 模式区分支付与退款方向
export function cnyFromCents(cents: unknown, options: {signed?: boolean} = {}): string | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    return null
  }
  const amount = cents / 100
  if (options.signed === true && amount < 0) {
    return `退款 ${(-amount).toFixed(2)} CNY`
  }
  if (options.signed === true && amount > 0) {
    return `支付 ${amount.toFixed(2)} CNY`
  }
  return `${amount.toFixed(2)} CNY`
}

// 从实例列表响应展开 EIP 带宽分配行(过滤内网/代理 IP)
export function eipRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const hosts = (response.UHostSet as Array<Record<string, unknown>>) ?? []
  const rows: Array<Record<string, unknown>> = []
  for (const host of hosts) {
    const ipSet = (host.IPSet as Array<Record<string, unknown>>) ?? []
    for (const ip of ipSet) {
      if (!ip.IPId || ip.Type === 'Private' || ip.Type === 'Proxy') {
        continue
      }
      const assignment = (ip.ShareBandwidth as Record<string, unknown>) ?? {}
      rows.push({
        UHostId: host.UHostId,
        Name: host.Name,
        Region: host.Region,
        Zone: host.Zone,
        IP: ip.IP,
        EIPId: ip.IPId,
        Scope: assignment.Scope ?? 'Unknown',
        ShareBandwidthId: assignment.ShareBandwidthId,
        Bandwidth: assignment.Bandwidth,
        CanSwitch: Boolean(assignment.CanSwitch),
        TargetScope: assignment.TargetScope,
      })
    }
  }
  return rows
}
