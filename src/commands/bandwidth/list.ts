// cps bandwidth list: 列出独立带宽资源

import {Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {BANDWIDTH_COLUMNS, BANDWIDTH_JSON_FIELDS} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {supportedLocations} from '../../lib/compshare/location.js'

export default class BandwidthList extends CompshareBaseCommand {
  static description = '列出独立带宽资源'

  static examples = ['<%= config.bin %> <%= command.id %> --region cn-bj2']

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '按地域过滤'}),
    zone: Flags.string({description: '按可用区过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BandwidthList)
    const context = this.compshareContext()
    if (flags.zone !== undefined && flags.region === undefined) {
      throw new UsageError('--zone 需要同时提供 --region。')
    }

    // 逐可用区查询独立带宽并聚合(跳过 Pod 节点)
    const locations = (await supportedLocations(context, flags.region)).filter(
      (item) => !item.IsPod && (flags.zone === undefined || item.Zone === flags.zone),
    )
    const rows: Array<Record<string, unknown>> = []
    for (const location of locations) {
      const locationRegion = String(location.Region)
      const locationZone = String(location.Zone)
      const params = CompshareContext.request({zone: true, regionValue: locationRegion, zoneValue: locationZone})
      const response = await call(context, 'DescribeCompShareShareBandwidth', params)
      const bandwidth = response.CompanyShareBandwidth as Record<string, unknown> | undefined
      if (bandwidth) {
        rows.push({...bandwidth, Region: locationRegion, Zone: locationZone})
      }
    }

    const result = {CompanyShareBandwidthSet: rows, TotalCount: rows.length, ReturnedCount: rows.length}
    context.renderer.data(result, {
      rows,
      columns: BANDWIDTH_COLUMNS,
      jsonList: true,
      jsonFields: BANDWIDTH_JSON_FIELDS,
    })
  }
}
