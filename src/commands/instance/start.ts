// cps instance start: 启动一台或多台实例

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {batchLifecycle} from '../../lib/compshare/instance-helpers.js'
import {compact} from '../../lib/compshare/parsing.js'

export default class InstanceStart extends CompshareBaseCommand {
  static description = '启动一台或多台实例'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>...']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  static flags = {
    ...compshareGlobalFlags,
    withoutGpu: Flags.string({description: '无 GPU 规格: A 或 B'}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceStart)
    await batchLifecycle(this.compshareContext(), 'StartCompShareInstance', args.instances, '启动实例', {
      extra: compact({WithoutGpuSpec: flags.withoutGpu}),
      wait: flags.wait,
      timeout: flags.timeout,
      desired: new Set(['Running']),
    })
  }
}
