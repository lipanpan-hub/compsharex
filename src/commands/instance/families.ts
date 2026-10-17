// cps instance families: 列出 GPU 机型家族

import {CompshareBaseCommand} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {invoke} from '../../lib/compshare/api.js'

export default class InstanceFamilies extends CompshareBaseCommand {
  static aliases = ['ins:families']
  static description = '列出 GPU 机型家族'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    await invoke(this.compshareContext(), 'DescribeCompShareMachineTypeFamilies', CompshareContext.request(), {
      listKey: 'MachineTypes',
      columns: [
        ['Name', 'NAME'],
        ['Description', 'DESCRIPTION'],
      ],
    })
  }
}
