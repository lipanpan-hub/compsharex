// cps instance schedule show: 查看实例定时关机

import {Args} from '@oclif/core'

import {CompshareBaseCommand} from '../../../lib/compshare/base.js'
import {locateInstance} from '../../../lib/compshare/location.js'
import {schedulerStopTimeOf, schedulePayload} from '../../../lib/compshare/instance-helpers.js'

export default class InstanceScheduleShow extends CompshareBaseCommand {
  static aliases = ['ins:schedule:show', 'ins:schedule:get']
  static description = '查看实例定时关机'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(InstanceScheduleShow)
    const context = this.compshareContext()
    const host = (await locateInstance(context, args.instance))[2]
    const stopTime = schedulerStopTimeOf(host)
    context.renderer.details(
      '定时关机',
      [
        ['INSTANCE', args.instance],
        ['STATUS', stopTime !== null ? '已设置' : '未设置'],
        ['SCHEDULER STOP TIME', stopTime],
        ['UNIX', stopTime],
      ],
      schedulePayload(args.instance, stopTime),
    )
  }
}
