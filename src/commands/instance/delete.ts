// cps instance delete: 永久删除一台或多台实例

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {batchLifecycle} from '../../lib/compshare/instance-helpers.js'

export default class InstanceDelete extends CompshareBaseCommand {
  static description = '永久删除一台或多台实例'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>...']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  static flags = {
    ...compshareGlobalFlags,
    releaseDisk: Flags.boolean({description: '随实例一起删除已挂载的数据盘', default: false}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceDelete)
    await batchLifecycle(
      this.compshareContext(),
      'TerminateCompShareInstance',
      args.instances,
      flags.releaseDisk ? '永久删除实例及已挂载的数据盘' : '永久删除实例',
      {
        yes: flags.yes,
        confirmOperation: true,
        extra: {ReleaseUDisk: flags.releaseDisk},
        wait: flags.wait,
        timeout: flags.timeout,
        absent: true,
      },
    )
  }
}
