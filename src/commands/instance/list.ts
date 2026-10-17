// cps instance list: 列出实例

import {Flags} from '@oclif/core'

import {collectPages} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {INSTANCE_COLUMNS, instanceRows} from '../../lib/compshare/instance-helpers.js'
import {compact, splitCsv} from '../../lib/compshare/parsing.js'
import {UsageError} from '../../lib/compshare/errors.js'

// JSON 投影字段(与表格列不同: 用原始 Memory 而非 MemoryDisplay)
const LIST_JSON_FIELDS = [
  'UHostId',
  'Name',
  'State',
  'GpuType',
  'GPU',
  'CPU',
  'Memory',
  'Region',
  'Zone',
  'ChargeType',
  'InstancePrice',
] as const

export default class InstanceList extends CompshareBaseCommand {
  static aliases = ['ins:list', 'ins:ls']
  static description = '列出实例'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    id: Flags.string({description: '实例 ID; 可重复', multiple: true}),
    region: Flags.string({description: '按地域过滤; 必须与 --zone 一起使用'}),
    zone: Flags.string({description: '按可用区过滤; 必须与 --region 一起使用'}),
    limit: Flags.integer({description: '最大返回数量', default: 20}),
    offset: Flags.integer({description: '跳过的结果数量', default: 0}),
    all: Flags.boolean({description: '返回全部结果', default: false}),
    tag: Flags.string({description: '按实例标签过滤'}),
    vpc: Flags.string({description: '按 VPC ID 过滤'}),
    subnet: Flags.string({description: '按子网 ID 过滤'}),
    disk: Flags.string({description: '筛选与磁盘兼容的主机'}),
    projectId: Flags.string({description: '项目 ID'}),
    withoutGpu: Flags.boolean({description: '列出无 GPU 实例', default: false}),
    name: Flags.string({description: '按实例名称过滤'}),
    status: Flags.string({description: '按实例状态过滤'}),
    gpu: Flags.string({description: '按 GPU 型号过滤'}),
    billing: Flags.string({description: '按计费类型过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceList)
    const isRegionSet = flags.region !== undefined
    const isZoneSet = flags.zone !== undefined
    if (isRegionSet !== isZoneSet) {
      throw new UsageError('--region 与 --zone 必须同时提供。')
    }
    const context = this.compshareContext()
    const params = CompshareContext.request({regionValue: flags.region})
    Object.assign(
      params,
      compact({
        Zone: flags.zone,
        ProjectId: flags.projectId,
        UHostIds: flags.id ? splitCsv(flags.id) : undefined,
        Tag: flags.tag,
        VPCId: flags.vpc,
        SubnetId: flags.subnet,
        UDiskIdForAttachment: flags.disk,
        WithoutGpu: flags.withoutGpu || undefined,
      }),
    )
    const response = await collectPages(context, 'DescribeCompShareInstance', params, 'UHostSet')
    const hosts = (response.UHostSet as Array<Record<string, unknown>>) ?? []
    response.RegionSet = [...new Set(hosts.map((host) => String(host.Region)).filter(Boolean))]
    response.TotalCount = hosts.length

    // 本地过滤: 名称/状态/GPU/计费为子串匹配(大小写不敏感)
    const filters: Array<[string, string | null]> = [
      ['Name', flags.name ? flags.name.toLowerCase() : null],
      ['State', flags.status ? flags.status.toLowerCase() : null],
      ['GpuType', flags.gpu ? flags.gpu.toLowerCase() : null],
      ['ChargeType', flags.billing ? flags.billing.toLowerCase() : null],
    ]
    const filtered = hosts.filter((host) =>
      filters.every(
        ([field, expected]) => expected === null || String(host[field] ?? '').toLowerCase().includes(expected),
      ),
    )

    const offset = flags.offset
    const page = flags.all ? filtered.slice(offset) : filtered.slice(offset, offset + flags.limit)
    const result: Record<string, unknown> = {...response}
    result.UHostSet = page
    result.FilteredCount = filtered.length
    result.ReturnedCount = page.length
    result.Offset = offset
    result.Limit = flags.all ? null : flags.limit
    context.renderer.data(result, {
      rows: instanceRows(result),
      columns: INSTANCE_COLUMNS,
      jsonList: true,
      jsonFields: LIST_JSON_FIELDS,
      metadata: {all: flags.all},
    })
  }
}
