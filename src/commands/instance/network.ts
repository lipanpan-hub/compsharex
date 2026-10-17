// cps instance network: 检查网络加速器状态

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class InstanceNetwork extends CompshareBaseCommand {
  static description = '检查网络加速器状态'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceNetwork)
    const params = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    await invoke(this.compshareContext(), 'CheckCompShareNetOptimizer', params)
  }
}
