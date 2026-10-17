// cps instance ports list: 列出支持的软件端口

import {Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'

export default class InstancePortsList extends CompshareBaseCommand {
  static description = '列出支持的软件端口'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '地域'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstancePortsList)
    await invoke(this.compshareContext(), 'DescribeCompShareSoftwarePort', CompshareContext.request({regionValue: flags.region}), {
      listKey: 'SoftwarePort',
      columns: [
        ['Software', 'SOFTWARE'],
        ['Port', 'PORT'],
      ],
    })
  }
}
