// cps image tags: 列出可用镜像标签

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class ImageTags extends CompshareBaseCommand {
  static description = '列出可用镜像标签'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
  }

  async run(): Promise<void> {
    await invoke(this.compshareContext(), 'DescribeCompShareImageTags', CompshareContext.request())
  }
}
