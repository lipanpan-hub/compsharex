// cps instance schedule extend: 延长实例定时关机

import {Args, Flags} from '@oclif/core'

import {setTimeout as delay} from 'node:timers/promises'

import {call} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {projectId as resolveProjectId, schedulerStopTimeOf, schedulePayload} from '../../../lib/compshare/instance-helpers.js'
import {durationSeconds} from '../../../lib/compshare/parsing.js'
import {UsageError} from '../../../lib/compshare/errors.js'

export default class InstanceScheduleExtend extends CompshareBaseCommand {
  static description = '延长实例定时关机'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --by 2h']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    by: Flags.string({required: true, description: '在当前关机时间上增加的时长, 例如 2h'}),
    projectId: Flags.string({description: '覆盖自动检测的项目 ID'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceScheduleExtend)
    const context = this.compshareContext()
    const [region, zone, host] = await locateInstance(context, args.instance)
    const previousStopTime = schedulerStopTimeOf(host)
    if (previousStopTime === undefined) {
      throw new UsageError(`实例 ${args.instance} 未设置定时关机, 请使用 cps instance schedule set。`)
    }
    const now = Math.floor(Date.now() / 1000)
    if (previousStopTime <= now) {
      throw new UsageError(`实例 ${args.instance} 的定时关机已过期, 请使用 cps instance schedule set。`)
    }
    const seconds = durationSeconds(flags.by)
    const stopTime = previousStopTime + seconds
    if (stopTime < now + 300) {
      throw new UsageError('定时关机时间必须距离当前至少五分钟。')
    }

    const params = CompshareContext.request({
      zone: true,
      projectId: await resolveProjectId(context, flags.projectId),
      regionValue: region,
      zoneValue: zone,
    })
    Object.assign(params, {UHostId: args.instance, SchedulerStopTime: stopTime})
    const operation = await call(context, 'UpdateCompShareStopScheduler', params)

    // 回读验证最多 3 次, 确认设置生效
    let verifiedStopTime: number | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await delay(200)
      }
      const verifiedHost = (await locateInstance(context, args.instance, region))[2]
      verifiedStopTime = schedulerStopTimeOf(verifiedHost)
      if (verifiedStopTime === stopTime) {
        break
      }
    }
    if (verifiedStopTime !== stopTime) {
      throw new UsageError(`定时关机验证失败: 期望 ${stopTime}, 实际 ${verifiedStopTime ?? '未设置'}。`)
    }

    const payload = {
      ...schedulePayload(args.instance, verifiedStopTime),
      previous_stop_time: previousStopTime,
      extended_by: flags.by,
      extended_by_seconds: seconds,
      operation,
    }
    context.renderer.details(
      '已延长时间定时关机',
      [
        ['INSTANCE', args.instance],
        ['PREVIOUS STOP TIME', previousStopTime],
        ['EXTENDED BY', flags.by],
        ['SCHEDULER STOP TIME', verifiedStopTime],
        ['UNIX', verifiedStopTime],
      ],
      payload,
    )
  }
}
