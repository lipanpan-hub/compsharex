// cps instance schedule cancel: 取消实例定时关机

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {projectId as resolveProjectId} from '../../../lib/compshare/instance-helpers.js'

export default class InstanceScheduleCancel extends CompshareBaseCommand {
  static aliases = ['ins:schedule:cancel']
  static description = '取消实例定时关机'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    projectId: Flags.string({description: '覆盖自动检测的项目 ID'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceScheduleCancel)
    const context = this.compshareContext()
    await confirm(context, `取消实例 ${args.instance} 的定时关机?`, flags.yes)
    const [region] = await locateInstance(context, args.instance)
    const params = CompshareContext.request({
      projectId: await resolveProjectId(context, flags.projectId),
      regionValue: region,
    })
    params.UHostId = args.instance
    await invoke(context, 'DeleteCompShareStopScheduler', params, {success: '已取消定时关机'})
  }
}
