import {BaseCommand} from '../../lib/base-command.js'
import {ToolConfigManager} from '../../lib/config/index.js'
import {timedInput, timedPassword} from '../../lib/prompts.js'

// 优云智算 LLM 服务(OpenAI 兼容接口)默认接入地址
const DEFAULT_LLM_BASE_URL = 'https://api.modelverse.cn/v1'

export default class LlmCfset extends BaseCommand {
  static description =
    '交互式配置优云智算 LLM 服务凭据 (apiKey / baseUrl), 写入当前激活的配置档案'

  static examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)

    // 确保配置存在, 首次使用时自动生成默认档案
    configManager.ensureConfig()
    const currentProfile = configManager.getCurrentProfile()
    if (!currentProfile) {
      this.error('当前没有激活的配置档案, 请先通过 config switch 命令切换或创建档案')
    }

    // #region 交互录入: apiKey 掩码输入直接回车保留旧值, baseUrl 明文输入预填旧值或默认地址, 超时均保留旧值
    this.log(`正在为配置档案 "${currentProfile.name}" 设置优云智算 LLM 服务凭据`)

    const inputApiKey = await timedPassword({
      message: '请输入 API Key (直接回车保留已有值):',
      fallbackValue: '',
    })
    const llmApiKey = inputApiKey || currentProfile.llmApiKey || ''

    const llmBaseUrl = await timedInput({
      message: '请输入 Base URL:',
      default: currentProfile.llmBaseUrl || DEFAULT_LLM_BASE_URL,
    })

    if (!llmApiKey.trim()) {
      this.error('API Key 不能为空')
    }
    if (!/^https?:\/\//.test(llmBaseUrl.trim())) {
      this.error('Base URL 必须以 http:// 或 https:// 开头')
    }
    // #endregion

    // #region 持久化: 将凭据合并写入当前激活档案
    const isUpdated = configManager.updateCurrentProfile({
      llmApiKey: llmApiKey.trim(),
      llmBaseUrl: llmBaseUrl.trim(),
    })
    if (!isUpdated) {
      this.error('写入配置失败, 请检查配置文件状态')
    }

    this.log(`优云智算 LLM 服务凭据已写入配置档案 "${currentProfile.name}": ${configManager.getConfigPath()}`)
    // #endregion
  }
}
