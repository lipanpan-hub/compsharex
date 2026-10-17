// cps bandwidth switch: 在独立带宽与共享带宽之间切换实例 EIP

import {Args, Flags} from '@oclif/core'

import {callCaptured} from '../../lib/compshare/api.js'
import {targetScope} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirmDetails} from '../../lib/compshare/confirm.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {locateInstances} from '../../lib/compshare/location.js'

// 切换结果统一列定义
const SWITCH_COLUMNS = [
  ['UHostId', 'INSTANCE'],
  ['Zone', 'ZONE'],
  ['Success', 'SUCCESS'],
  ['CurrentScope', 'BANDWIDTH SCOPE'],
  ['Message', 'MESSAGE'],
] as const satisfies readonly (readonly [string, string])[]

export default class BandwidthSwitch extends CompshareBaseCommand {
  static aliases = ['bw:switch', 'bw:sw']
  static description = '在独立带宽与共享带宽之间切换实例 EIP'

  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>... --to shared']

  static args = {
    instances: Args.string({required: true, variadic: true, description: '实例 ID 列表'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    to: Flags.string({required: true, description: '目标带宽: dedicated 或 shared'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BandwidthSwitch)
    const context = this.compshareContext()
    const [scope, scopeLabel] = targetScope(flags.to)
    // oclif 静态类型未体现 variadic, 运行时实为 string[], 显式断言
    const instanceIds = args.instances as unknown as string[]
    // 去重并保持请求顺序
    const requested = [...new Set(instanceIds)]
    const [located, missing] = await locateInstances(context, requested)
    await confirmDetails(
      context,
      '操作计划',
      [
        ['INSTANCE', requested],
        ['TARGET', scopeLabel],
      ],
      '确认本次操作?',
      flags.yes,
    )

    // #region 未找到的实例直接记为失败
    const results: Array<Record<string, unknown>> = missing.map((instance) => ({
      UHostId: instance,
      Success: false,
      Message: `未找到实例 ${instance}。`,
    }))
    // #endregion

    // #region 按 Region/Zone 分组批量切换
    const groups = new Map<string, {ids: string[]; region: string; zone: string;}>()
    for (const instance of requested) {
      const locatedEntry = located.get(instance)
      if (locatedEntry === undefined) {
        continue
      }
      const groupKey = `${locatedEntry.region}\u0000${locatedEntry.zone}`
      const group = groups.get(groupKey) ?? {region: locatedEntry.region, zone: locatedEntry.zone, ids: []}
      group.ids.push(instance)
      groups.set(groupKey, group)
    }
    for (const {region, zone, ids} of groups.values()) {
      const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
      Object.assign(params, {UHostIds: ids, TargetScope: scope})
      const [response, error] = await callCaptured(context, 'SwitchCompShareEIPShareBandwidth', params)
      if (error) {
        for (const instance of ids) {
          results.push({UHostId: instance, Region: region, Zone: zone, Success: false, Message: error.message})
        }
        continue
      }
      // 按 API 返回的逐实例结果匹配, 缺失视为失败
      const returned = new Map<string, Record<string, unknown>>()
      for (const item of ((response?.Results as Array<Record<string, unknown>>) ?? [])) {
        returned.set(String(item.UHostId ?? ''), item)
      }
      for (const instance of ids) {
        const item =
          returned.get(instance) ??
          ({UHostId: instance, Success: false, Message: `API 未返回实例 ${instance} 的结果。`} as Record<string, unknown>)
        results.push({...item, Region: region, Zone: zone})
      }
    }
    // #endregion

    const failed = results.filter((item) => !item.Success)
    const payload: Record<string, unknown> = {Results: results}
    if (failed.length > 0) {
      payload.ok = false
      payload.error = {code: 'partial_failure', message: '部分带宽切换失败。'}
    }
    context.renderer.data(payload, {rows: results, columns: SWITCH_COLUMNS})
    if (failed.length > 0) {
      process.exitCode = 1
    }
  }
}
