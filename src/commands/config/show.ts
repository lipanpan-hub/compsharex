import {existsSync, readFileSync} from 'node:fs'

import {BaseCommand} from '../../lib/base-command.js'
import {ToolConfigManager} from '../../lib/config/index.js'

export default class ConfigShow extends BaseCommand {
  static aliases = ['cf:ls', 'cf:show']
  static description = '列出所有的配置'
  static examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)
    const configPath = configManager.getConfigPath()
    this.log(`配置文件路径: ${configPath}`)

    if (!existsSync(configPath)) {
      this.log('配置文件不存在')
      return
    }

    // 直接读取原始 YAML 文本打印，保留原始格式
    const rawYaml = readFileSync(configPath, 'utf8')
    this.log(rawYaml)
  }
}
