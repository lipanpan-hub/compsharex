// cps instance charge: 切换实例计费类型

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {lifecycle} from '../../lib/compshare/instance-helpers.js'

export default class InstanceCharge extends CompshareBaseCommand {
  static description = '切换实例计费类型'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --to Month']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    to: Flags.string({required: true, description: '目标计费类型: Month、Day、Dynamic 或 Postpay'}),
    dryRun: Flags.boolean({description: '只校验并展示请求, 不变更资源', default: false}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceCharge)
    const context = this.compshareContext()
    if (flags.dryRun) {
      context.renderer.details(
        '操作计划',
        [
          ['INSTANCE', args.instance],
          ['CHARGE', flags.to],
        ],
        {dry_run: true, instance: args.instance, destination: flags.to},
      )
      return
    }
    await lifecycle(context, 'SwitchChargeType', args.instance, '切换实例计费类型', {
      yes: flags.yes,
      extra: {DestChargeType: flags.to},
    })
  }
}
