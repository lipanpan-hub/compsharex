// team 命令组共享工具(移植自 commands/team.py 内部函数)

import {call, invoke} from './api.js'
import {confirmDetails} from './confirm.js'
import {CompshareContext} from './context.js'
import {UsageError} from './errors.js'
import {money, moneyCents, compact, pastTimestamp, timestamp} from './parsing.js'

// 团队清单统一列定义
export const TEAM_COLUMNS = [
  ['Id', 'TEAM ID'],
  ['Name', 'NAME'],
  ['Description', 'DESCRIPTION'],
  ['MemberCount', 'MEMBERS'],
] as const satisfies readonly (readonly [string, string])[]

// 成员清单统一列定义
export const MEMBER_COLUMNS = [
  ['UserCompanyId', 'USER ID'],
  ['VirtualCompanyId', 'MEMBER ID'],
  ['RemarkName', 'NAME'],
  ['Status', 'STATUS'],
  ['AllocateAmountDisplay', 'QUOTA'],
  ['AvailableAmountDisplay', 'AVAILABLE'],
] as const satisfies readonly (readonly [string, string])[]

// 订单清单统一列定义
export const ORDER_COLUMNS = [
  ['OrderNo', 'ORDER'],
  ['OrderState', 'STATUS'],
  ['ChargeType', 'CHARGE'],
  ['Amount', 'AMOUNT'],
  ['AmountReal', 'PAID'],
  ['ResourceId', 'RESOURCE'],
  ['CreateTime', 'CREATED'],
] as const satisfies readonly (readonly [string, string])[]

// 组装基础请求参数
export function teamParams(
  context: CompshareContext,
  values: Record<string, unknown> = {},
): Record<string, unknown> {
  return Object.assign(CompshareContext.request(), compact(values))
}

// 解析起止时间为 BeginTime/EndTime
export function timeParams(start?: string, end?: string): Record<string, unknown> {
  return compact({
    BeginTime: start ? pastTimestamp(start) : undefined,
    EndTime: end ? timestamp(end) : undefined,
  })
}

// 展开成员行, 金额字段从分转为 ¥ 展示
export function memberRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawRows = (response.TeamRelation as Array<Record<string, unknown>>) ?? []
  const rows: Array<Record<string, unknown>> = []
  for (const raw of rawRows) {
    const row: Record<string, unknown> = {...raw}
    const allocated = row.AllocateAmount
    const available = row.AvailableAmount
    row.AllocateAmountDisplay = typeof allocated === 'number' ? `¥${(allocated / 100).toFixed(2)}` : allocated
    row.AvailableAmountDisplay = typeof available === 'number' ? `¥${(available / 100).toFixed(2)}` : available
    rows.push(row)
  }
  return rows
}

// 解析 USER_ID 或 USER_ID:REMARK 形式的受邀人
export function invitee(value: string): Record<string, unknown> {
  const separatorIndex = value.indexOf(':')
  const rawId = separatorIndex === -1 ? value : value.slice(0, separatorIndex)
  const remark = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1)
  const userId = Number(rawId)
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new UsageError(`无效用户 ${value}; 请使用 USER_ID 或 USER_ID:REMARK 格式。`)
  }
  return compact({UserCompanyId: userId, RemarkName: remark})
}

// 邀请关系通用操作(接受/拒绝/取消/改备注): 先确认再调用 SetCompShareTeamRelation
export async function relation(
  context: CompshareContext,
  team: number,
  status: string,
  options: {remark?: string; user?: number; yes?: boolean} = {},
): Promise<void> {
  const yes = options.yes ?? false
  await confirmDetails(
    context,
    '操作计划',
    [
      ['TEAM ID', team],
      ['USER ID', options.user],
      ['ACTION', status],
    ],
    '确认本次操作?',
    yes,
  )
  await invoke(
    context,
    'SetCompShareTeamRelation',
    teamParams(context, {
      TeamId: team,
      Status: status,
      UserCompanyId: options.user,
      RemarkName: options.remark,
    }),
    {success: '已更新团队邀请'},
  )
}

// 配额通用操作(拨发/回收): 先确认再调用 SetCompShareTeamAmount
export async function quota(
  context: CompshareContext,
  team: number,
  members: number[],
  amount: string,
  operation: string,
  yes: boolean,
): Promise<void> {
  const parsedAmount = money(amount)
  await confirmDetails(
    context,
    '操作计划',
    [
      ['TEAM ID', team],
      ['MEMBER ID', members],
      ['AMOUNT', `¥${parsedAmount.toFixed(2)}`],
      ['ACTION', operation],
    ],
    '确认本次操作?',
    yes,
  )
  const response = await call(
    context,
    'SetCompShareTeamAmount',
    teamParams(context, {
      TeamId: team,
      VirtualCompanyId: members,
      Amount: moneyCents(amount),
      OperateType: operation,
    }),
  )
  const failedMembers = (response.FailedMembers as Record<string, unknown>) ?? {}
  const result: Record<string, unknown> = {...response, ok: Object.keys(failedMembers).length === 0}
  if (Object.keys(failedMembers).length > 0) {
    result.error = {code: 'partial_failure', message: '部分成员配额更新失败。'}
  }
  context.renderer.details(
    '操作完成',
    [
      ['TEAM ID', team],
      ['MEMBER ID', members],
      ['AMOUNT', `¥${parsedAmount.toFixed(2)}`],
      ['FAILED', failedMembers],
    ],
    result,
  )
  if (Object.keys(failedMembers).length > 0) {
    process.exitCode = 1
  }
}

// 账单命令公共参数(团队 + 成员 + 起止时间)
export function billingParams(
  context: CompshareContext,
  team: number,
  member: number,
  start?: string,
  end?: string,
): Record<string, unknown> {
  return teamParams(context, {TeamId: team, VirtualCompanyId: member, ...timeParams(start, end)})
}

// 归一化订单排序字段
export function orderSort(value: string): string {
  let normalized = value.trim().replace(/-/g, '_').toLowerCase()
  const aliases: Record<string, string> = {
    createtime: 'create_time',
    orderstarttime: 'order_start_time',
    orderendtime: 'order_end_time',
  }
  normalized = aliases[normalized] ?? normalized
  if (!['create_time', 'order_end_time', 'order_start_time'].includes(normalized)) {
    throw new UsageError('--sort 必须是 create_time、order_start_time 或 order_end_time。')
  }
  return normalized
}
