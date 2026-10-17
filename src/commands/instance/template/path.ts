// cps instance template path: 打印本地实例模板文件路径

import {CompshareBaseCommand} from '../../../lib/compshare/base.js'
import {templatePath} from '../../../lib/compshare/instance-template-store.js'

export default class InstanceTemplatePath extends CompshareBaseCommand {
  static description = '打印本地实例模板文件路径'
  static examples = ['<%= config.bin %> <%= command.id %>']

  async run(): Promise<void> {
    const context = this.compshareContext()
    const path = templatePath(context.configDirectory)
    if (context.jsonOutput) {
      context.renderer.data({path})
      return
    }
    process.stdout.write(`${path}\n`)
  }
}
