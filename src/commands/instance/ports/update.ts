// cps instance ports update: 替换实例的容器端口映射

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {compact} from '../../../lib/compshare/parsing.js'
import {UsageError} from '../../../lib/compshare/errors.js'

export default class InstancePortsUpdate extends CompshareBaseCommand {
  static description = '替换实例的容器端口映射'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --http 8888 --tcp 22 --tcp 23']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    http: Flags.integer({description: '完整的 HTTP 端口列表; 可重复', multiple: true}),
    tcp: Flags.integer({description: '完整的 TCP 端口列表; 可重复', multiple: true}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstancePortsUpdate)
    if (flags.http === undefined && flags.tcp === undefined) {
      throw new UsageError('请至少指定 --http 或 --tcp 端口。')
    }
    const context = this.compshareContext()
    await confirm(context, `替换实例 ${args.instance} 的端口映射?`, flags.yes)
    const [region, zone] = await locateInstance(context, args.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    Object.assign(
      params,
      compact({
        UHostId: args.instance,
        HttpPorts: flags.http,
        TcpPorts: flags.tcp,
      }),
    )
    await invoke(context, 'UpdateCompShareInstancePorts', params, {success: '已更新端口映射'})
  }
}
