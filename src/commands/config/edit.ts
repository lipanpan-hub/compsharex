import * as inquirer from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import { BaseCommand } from '../../lib/base-command.js'

import {ToolConfigManager, editConfigTui, ExternalEditor} from '../../lib/config/index.js'

export default class ConfigEdit extends BaseCommand {
  static aliases = ["cf:edit"]
  static description = '编辑用户配置文件, 默认启动内置 TUI 编辑器, 也可选择系统中的外部编辑器'

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --editor']

  static flags = {
    editor: Flags.boolean({char: 'e', description: '交互式选择系统中可用的外部编辑器进行编辑'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ConfigEdit)
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)

    // 确保配置文件存在, 不存在则写入默认空配置, 避免编辑器读取时报错
    if (!configManager.readConfig()) {
      configManager.writeConfig({current: '', profiles: []})
    }

    const configPath = configManager.getConfigPath()

    // 未指定 --editor 时使用内置 TUI 编辑器
    if (!flags.editor) {
      await editConfigTui(configPath)
      return
    }

    // #region 外部编辑器: 检测可用项 -> 交互选择 -> 启动编辑
    const externalEditor = new ExternalEditor()
    const available = externalEditor.detectAvailable()

    if (available.length === 0) {
      this.error('未检测到系统中可用的外部编辑器, 请改用内置编辑器 (去掉 --editor)')
    }

    const selected = await inquirer.select({
      choices: available.map((candidate) => ({name: candidate.name, value: candidate})),
      message: '请选择用于编辑配置文件的编辑器:',
    })

    await externalEditor.open(selected, configPath)
    this.log(`已使用 ${selected.name} 编辑完成: ${configPath}`)
    // #endregion
  }
}
