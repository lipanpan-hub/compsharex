// cps instance software list: 列出实例支持的软件

import {Flags} from '@oclif/core'

import {invoke} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {CompshareContext} from '../../../lib/compshare/context.js'

export default class InstanceSoftwareList extends CompshareBaseCommand {
  static aliases = ['ins:software:list', 'ins:software:ls']
  static description = '列出实例支持的软件'
  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({description: '地域'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(InstanceSoftwareList)
    await invoke(this.compshareContext(), 'DescribeCompShareSoftwarePort', CompshareContext.request({regionValue: flags.region}), {
      listKey: 'SoftwarePort',
      columns: [
        ['Software', 'SOFTWARE'],
        ['Port', 'PORT'],
      ],
    })
  }
}
