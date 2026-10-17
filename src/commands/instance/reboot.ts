// cps instance reboot: 重启一台或多台实例

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {batchLifecycle} from '../../lib/compshare/instance-helpers.js'

export default class InstanceReboot extends CompshareBaseCommand {
  static aliases = ['ins:reboot']
  static description = '重启一台或多台实例'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>...']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  static flags = {
    ...compshareGlobalFlags,
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceReboot)
    await batchLifecycle(this.compshareContext(), 'RebootCompShareInstance', args.instances, '重启实例', {
      yes: flags.yes,
      confirmOperation: true,
      wait: flags.wait,
      timeout: flags.timeout,
      desired: new Set(['Running']),
    })
  }
}
