// cps storage disk list: 列出已挂载与未挂载的磁盘清单

import {Flags} from '@oclif/core'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {compact} from '../../../lib/compshare/parsing.js'

// 磁盘清单统一列定义
const DISK_COLUMNS = [
  ['ResourceId', 'DISK ID'],
  ['Name', 'NAME'],
  ['Configuration', 'SIZE'],
  ['DiskType', 'TYPE'],
  ['Status', 'STATUS'],
  ['MountInstance', 'INSTANCE'],
  ['Zone', 'ZONE'],
] as const satisfies readonly (readonly [string, string])[]

export default class DiskList extends CompshareBaseCommand {
  static description = '列出已挂载与未挂载的磁盘'

  static examples = ['<%= config.bin %> <%= command.id %> --instance <INSTANCE_ID>']

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({description: '按挂载实例 ID 过滤'}),
    region: Flags.string({description: '按地域过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DiskList)
    const context = this.compshareContext()
    const params = compact({HostId: flags.instance, Region: flags.region})
    const response = await call(context, 'DescribeCompshareDisk', params)
    const rows = (response.DiskSet as Array<Record<string, unknown>>) ?? []
    context.renderer.data(response, {rows, columns: DISK_COLUMNS, jsonList: true})
  }
}
