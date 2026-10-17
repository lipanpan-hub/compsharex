// cps bandwidth instances: 列出实例 EIP 带宽分配

import {Flags} from '@oclif/core'

import {collectPages} from '../../lib/compshare/api.js'
import {EIP_COLUMNS, EIP_JSON_FIELDS, eipRows} from '../../lib/compshare/bandwidth-helpers.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {compact} from '../../lib/compshare/parsing.js'

export default class BandwidthInstances extends CompshareBaseCommand {
  static description = '列出实例 EIP 带宽分配情况'

  static examples = ['<%= config.bin %> <%= command.id %> --id <INSTANCE_ID>']

  static flags = {
    ...compshareGlobalFlags,
    id: Flags.string({multiple: true, description: '实例 ID, 可重复'}),
    region: Flags.string({description: '按地域过滤'}),
    zone: Flags.string({description: '按可用区过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BandwidthInstances)
    const context = this.compshareContext()
    // region 与 zone 必须成对出现
    if ((flags.region === undefined) !== (flags.zone === undefined)) {
      throw new UsageError('--region 与 --zone 必须同时提供。')
    }

    const instanceIds = flags.id ?? []
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    Object.assign(
      params,
      compact({
        Zone: flags.zone,
        UHostIds: instanceIds.length > 0 ? instanceIds : undefined,
        SkipBill: true,
        IncludeShareBandwidth: true,
      }),
    )
    const response = await collectPages(context, 'DescribeCompShareInstance', params, 'UHostSet')
    const rows = eipRows(response)
    const result = {EIPSet: rows, TotalCount: rows.length, ReturnedCount: rows.length}
    context.renderer.data(result, {
      rows,
      columns: EIP_COLUMNS,
      jsonList: true,
      jsonFields: EIP_JSON_FIELDS,
    })
  }
}
