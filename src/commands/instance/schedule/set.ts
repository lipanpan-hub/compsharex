// cps instance schedule set: 设置实例定时关机

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {projectId as resolveProjectId} from '../../../lib/compshare/instance-helpers.js'
import {timestamp} from '../../../lib/compshare/parsing.js'
import {UsageError} from '../../../lib/compshare/errors.js'

export default class InstanceScheduleSet extends CompshareBaseCommand {
  static aliases = ['ins:schedule:set']
  static description = '设置实例定时关机'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --at 2h']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    at: Flags.string({required: true, description: 'Unix 时间戳、ISO 8601 或相对时间(如 2h)'}),
    projectId: Flags.string({description: '覆盖自动检测的项目 ID'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceScheduleSet)
    const context = this.compshareContext()
    const stopTime = timestamp(flags.at)
    if (stopTime < Math.floor(Date.now() / 1000) + 300) {
      throw new UsageError('定时关机时间必须距离当前至少五分钟。')
    }
    const [region, zone] = await locateInstance(context, args.instance)
    const params = CompshareContext.request({
      zone: true,
      projectId: await resolveProjectId(context, flags.projectId),
      regionValue: region,
      zoneValue: zone,
    })
    Object.assign(params, {UHostId: args.instance, SchedulerStopTime: stopTime})
    await invoke(context, 'UpdateCompShareStopScheduler', params, {success: '已设置定时关机'})
  }
}
