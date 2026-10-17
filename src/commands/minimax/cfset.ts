import {BaseCommand} from '../../lib/base-command.js'
import {ToolConfigManager} from '../../lib/config/index.js'
import {timedPassword} from '../../lib/prompts.js'

// MiniMax H3 API Key 的固定前缀(与 MiniMaxClient.apiKey 的校验规则保持一致)
const MINIMAX_API_KEY_PREFIX = 'sk-ml-'

export default class MinimaxCfset extends BaseCommand {
  static aliases = ['mm:cfset']

  static description = '交互式配置 MiniMax H3 服务 API Key, 写入当前激活的配置档案'

  static examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)

    // 确保配置存在, 首次使用时自动生成默认档案
    configManager.ensureConfig()
    const currentProfile = configManager.getCurrentProfile()
    if (!currentProfile) {
      this.error('当前没有激活的配置档案, 请先通过 config switch 命令切换或创建档案')
    }

    // #region 交互录入: apiKey 掩码输入直接回车保留旧值, 超时保留旧值
    this.log(`正在为配置档案 "${currentProfile.name}" 设置 MiniMax H3 服务 API Key`)

    const inputApiKey = await timedPassword({
      message: '请输入 MiniMax H3 API Key (直接回车保留已有值):',
      fallbackValue: '',
    })
    const minimaxApiKey = (inputApiKey || currentProfile.minimaxApiKey || '').trim()

    if (!minimaxApiKey) {
      this.error('API Key 不能为空')
    }
    if (!minimaxApiKey.startsWith(MINIMAX_API_KEY_PREFIX)) {
      this.error(`API Key 必须以 ${MINIMAX_API_KEY_PREFIX} 开头`)
    }
    // #endregion

    // #region 持久化: 将凭据合并写入当前激活档案
    const isUpdated = configManager.updateCurrentProfile({minimaxApiKey})
    if (!isUpdated) {
      this.error('写入配置失败, 请检查配置文件状态')
    }

    this.log(`MiniMax H3 服务 API Key 已写入配置档案 "${currentProfile.name}": ${configManager.getConfigPath()}`)
    // #endregion
  }
}
