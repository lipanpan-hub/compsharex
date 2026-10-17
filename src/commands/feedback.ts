// cps feedback: 提交 CLI 使用反馈(移植自 cli.py 的 feedback 命令与 insights.py)

import {Args} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../lib/compshare/base.js'
import {CLIError, ConfigError, UCloudApiError} from '../lib/compshare/errors.js'
import {Renderer} from '../lib/compshare/output.js'
import {CompShareSDK} from '../lib/compshare/sdk.js'

const ENDPOINT_ENV = 'COMPSHARE_INSIGHTS_URL'
const DEFAULT_ENDPOINT = 'https://api.compshare.cn'

// 反馈服务基础地址(环境变量可覆盖; 非 http/https 地址视为未启用)
function insightsBaseUrl(): string {
  const value = (process.env[ENDPOINT_ENV] ?? DEFAULT_ENDPOINT).trim().replace(/\/+$/, '')
  if (!value) {
    return ''
  }
  try {
    const parsed = new URL(value)
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host) {
      return value
    }
  } catch {
    // 非法地址按未启用处理
  }
  return ''
}

// 本机系统名(小写, 对齐 insights.os_name)
function osName(): string {
  return process.platform.toLowerCase()
}

export default class Feedback extends CompshareBaseCommand {
  static aliases = ['fb']
  static description = '提交 CLI 使用反馈'
  static examples = ['<%= config.bin %> <%= command.id %> bug 连接实例时超时的复现步骤...']

  static args = {
    category: Args.string({
      required: true,
      options: ['bug', 'suggest'],
      description: '反馈类型: bug 或 suggest',
    }),
    message: Args.string({required: true, description: '反馈内容, 最长 2000 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Feedback)
    const context = this.compshareContext()
    const normalized = args.message.trim()
    if (!normalized) {
      throw new CLIError('反馈内容不能为空。')
    }
    if (normalized.length > 2000) {
      throw new CLIError('反馈内容不能超过 2000 个字符。')
    }
    const baseUrl = insightsBaseUrl()
    if (!baseUrl) {
      throw new CLIError(`未配置反馈服务地址, 请设置环境变量 ${ENDPOINT_ENV}。`)
    }
    const profile = context.profile
    if (!profile.accessKeyId || !profile.accessKeySecret) {
      throw new ConfigError(
        `配置档案 ${profile.name} 缺少 accessKeyId 或 accessKeySecret, 请运行 cps config set 补全。`,
      )
    }
    const sdk = new CompShareSDK({
      publicKey: profile.accessKeyId,
      privateKey: profile.accessKeySecret,
      baseUrl,
    })
    let response: Record<string, unknown>
    try {
      // UTC 时间, 秒级精度(对齐 insights.now)
      response = await sdk.invoke('CreateCSCLIFeedback', {
        Category: args.category,
        Content: normalized,
        CLIVersion: this.config.version,
        OS: osName(),
        OccurredAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      })
    } catch (error) {
      if (error instanceof UCloudApiError) {
        throw new CLIError(`反馈服务拒绝了请求: ${error.message}`)
      }
      throw new CLIError('无法连接反馈服务。')
    }
    const feedbackId = response.Id
    if (typeof feedbackId !== 'string' && typeof feedbackId !== 'number') {
      throw new CLIError('反馈服务返回了无效响应。')
    }
    new Renderer(context.jsonOutput, context.showSensitive).success('感谢你的反馈。', {
      ok: true,
      id: feedbackId,
    })
  }
}
