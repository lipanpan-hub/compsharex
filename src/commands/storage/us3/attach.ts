// cps storage us3 attach: 为实例挂载 US3 对象存储

import {Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'

export default class Us3Attach extends CompshareBaseCommand {
  static aliases = ['st:us3:attach']
  static description = '为实例挂载 US3 对象存储'

  static examples = ['<%= config.bin %> <%= command.id %> --instance <INSTANCE_ID>']

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '运行中的目标实例 ID'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Us3Attach)
    const context = this.compshareContext()
    const [region, zone] = await locateInstance(context, flags.instance)
    const params = CompshareContext.request({zone: true, regionValue: region, zoneValue: zone})
    params.UHostId = flags.instance
    await invoke(context, 'AttachUS3', params, {
      success: `已为实例 ${flags.instance} 挂载 US3`,
    })
  }
}
