// cps instance monitor: 获取实例监控数据

import {Args} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand} from '../../lib/compshare/base.js'
import {monitorRows} from '../../lib/compshare/instance-helpers.js'
import {locateInstances} from '../../lib/compshare/location.js'
import {UsageError} from '../../lib/compshare/errors.js'

export default class InstanceMonitor extends CompshareBaseCommand {
  static description = '获取实例监控数据'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>...']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(InstanceMonitor)
    const context = this.compshareContext()
    const requested = [...new Set(args.instances)]
    const [locations, missing] = await locateInstances(context, requested)
    if (missing.length > 0) {
      throw new UsageError(`未找到实例 ${missing[0]}。`)
    }
    // 按 (region, zone) 分组, 每批最多 10 台(监控接口限制)
    const groups = new Map<string, {ids: string[]; region: string; zone: string;}>()
    for (const instance of requested) {
      const located = locations.get(instance)
      if (!located) {
        continue
      }
      const key = `${located.region}|${located.zone}`
      const group = groups.get(key) ?? {region: located.region, zone: located.zone, ids: []}
      group.ids.push(instance)
      groups.set(key, group)
    }
    const list: Array<Record<string, unknown>> = []
    const podList: Array<Record<string, unknown>> = []
    for (const group of groups.values()) {
      for (let offset = 0; offset < group.ids.length; offset += 10) {
        const current = await call(context, 'GetCompShareInstanceMonitor', {
          Region: group.region,
          Zone: group.zone,
          UHostIds: group.ids.slice(offset, offset + 10),
        })
        const data = (current.Data as Record<string, unknown>) ?? {}
        list.push(...((data.List as Array<Record<string, unknown>>) ?? []))
        podList.push(...((data.PodList as Array<Record<string, unknown>>) ?? []))
      }
    }
    const response = {Data: {List: list, PodList: podList}}
    const rows = monitorRows(response)
    const renderer = context.renderer
    if (!context.jsonOutput && rows.length === 0) {
      process.stdout.write('所选实例没有返回监控数据。\n')
      return
    }
    renderer.data(response, {
      rows,
      columns: [
        ['UHostId', 'INSTANCE'],
        ['MetricKey', 'METRIC'],
        ['Value', 'VALUE (%)'],
        ['Timestamp', 'TIME'],
        ['Device', 'DEVICE'],
      ],
    })
  }
}
