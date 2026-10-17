// cps instance zones: 列出支持的地域与可用区

import {Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class InstanceZones extends CompshareBaseCommand {
  static description = '列出支持的地域与可用区'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '按地域过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceZones)
    await invoke(
      this.compshareContext(),
      'DescribeCompShareSupportZone',
      CompshareContext.request({regionValue: flags.region}),
      {
        listKey: 'ZoneInfo',
        columns: [
          ['Region', 'REGION'],
          ['Zone', 'ZONE'],
          ['Describe', 'NAME'],
        ],
      },
    )
  }
}
