// cps instance wait: 等待实例到达指定状态

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {renderBatch, waitForInstance, type BatchItem} from '../../lib/compshare/instance-helpers.js'
import {locateInstances} from '../../lib/compshare/location.js'

export default class InstanceWait extends CompshareBaseCommand {
  static description = '等待实例到达指定状态'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>... --state Running']

  static args = {
    instances: Args.string({required: true, description: '实例 ID', multiple: true}),
  }

  static flags = {
    ...compshareGlobalFlags,
    state: Flags.string({description: '目标实例状态', default: 'Running'}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceWait)
    const context = this.compshareContext()
    const requested = [...new Set(args.instances)]
    const [locations, missing] = await locateInstances(context, requested)
    const succeeded: BatchItem[] = []
    const failed: BatchItem[] = missing.map((instance) => ({
      instance,
      error: {message: `未找到实例 ${instance}。`},
    }))
    for (const instance of requested) {
      const location = locations.get(instance)
      if (!location) {
        continue
      }
      const {region, zone} = location
      try {
        const final = await waitForInstance(context, instance, region, {
          desired: new Set([flags.state]),
          timeout: flags.timeout,
        })
        succeeded.push({instance, region, zone, final})
      } catch (error) {
        failed.push({instance, region, zone, error: {message: String(error)}})
      }
    }
    await renderBatch(context, 'wait', succeeded, failed)
  }
}
