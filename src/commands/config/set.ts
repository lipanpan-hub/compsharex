import * as inquirer from '@inquirer/prompts'

import {BaseCommand} from '../../lib/base-command.js'
import {ToolConfigManager} from '../../lib/config/index.js'

export default class ConfigSet extends BaseCommand {
  static aliases = ['cf:set']
  static description =
    '交互式配置 compshare GPU 接口认证凭据 (accessKeyId / accessKeySecret), 写入当前激活的配置档案'

  static examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)

    // 确保配置存在, 首次使用时自动生成默认档案
    configManager.ensureConfig()
    const currentProfile = configManager.getCurrentProfile()
    if (!currentProfile) {
      this.error('当前没有激活的配置档案, 请先通过 config switch 命令切换或创建档案')
    }

    // #region 交互录入: accessKeyId 明文输入并预填旧值, accessKeySecret 掩码输入, 直接回车保留已有值
    this.log(`正在为配置档案 "${currentProfile.name}" 设置 compshare GPU 接口认证凭据`)

    const accessKeyId = await inquirer.input({
      message: '请输入 accessKeyId:',
      default: currentProfile.accessKeyId,
    })

    const inputSecret = await inquirer.password({
      message: '请输入 accessKeySecret (直接回车保留已有值):',
    })
    const accessKeySecret = inputSecret || currentProfile.accessKeySecret || ''

    if (!accessKeyId.trim() || !accessKeySecret.trim()) {
      this.error('accessKeyId 与 accessKeySecret 均不能为空')
    }
    // #endregion

    // #region 持久化: 将凭据合并写入当前激活档案
    const isUpdated = configManager.updateCurrentProfile({
      accessKeyId: accessKeyId.trim(),
      accessKeySecret: accessKeySecret.trim(),
    })
    if (!isUpdated) {
      this.error('写入配置失败, 请检查配置文件状态')
    }

    this.log(`compshare 认证凭据已写入配置档案 "${currentProfile.name}": ${configManager.getConfigPath()}`)
    // #endregion
  }
}
