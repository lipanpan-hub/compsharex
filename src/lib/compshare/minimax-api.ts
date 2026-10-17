// MiniMax H3 HTTP API 客户端(纯 fetch 实现, 独立于 UCloud SDK; 移植自 commands/minimax.py)

import {randomUUID} from 'node:crypto'

import {SilentExit, UsageError} from './errors.js'
import type {Renderer} from './output.js'

export const MINIMAX_API_BASE_URL = 'https://cp.compshare.cn'
export const MINIMAX_API_KEY_ENV = 'COMPSHARE_MINIMAX_API_KEY'
export const MINIMAX_CALLBACK_TOKEN_ENV = 'COMPSHARE_MINIMAX_CALLBACK_TOKEN'

export interface MiniMaxRequestOptions {
  // 数组值展开为重复的查询键(对齐 urlencode doseq=True)
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  idempotencyKey?: string
}

export class MiniMaxClient {
  constructor(
    private readonly renderer: Renderer,
    private readonly cliVersion: string,
    // 配置档案中的 API Key(环境变量缺省时的回退来源)
    private readonly configApiKey?: string,
  ) {}

  // 分类错误输出并以指定退出码终止
  fail(code: string, message: string, details?: Record<string, unknown>, exitCode = 1): never {
    this.renderer.codedError(code, message, {details})
    throw new SilentExit(exitCode)
  }

  // 读取并校验 API Key(环境变量优先, 其次配置档案)
  apiKey(): string {
    const envKey = (process.env[MINIMAX_API_KEY_ENV] ?? '').trim()
    const configKey = (this.configApiKey ?? '').trim()
    const key = envKey || configKey
    if (!key) {
      this.fail(
        'configuration_error',
        `请设置环境变量 ${MINIMAX_API_KEY_ENV} 或运行 cps minimax cfset 配置 MiniMax H3 API Key。`,
        undefined,
        2,
      )
    }
    if (!key.startsWith('sk-ml-')) {
      this.fail('configuration_error', 'MiniMax H3 API Key 必须是 sk-ml- 开头。', undefined, 2)
    }
    return key
  }

  // #region 请求与响应处理
  async request(
    method: string,
    path: string,
    options: MiniMaxRequestOptions = {},
  ): Promise<Record<string, unknown>> {
    let url = `${MINIMAX_API_BASE_URL}${path}`
    if (options.query) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) {
          continue
        }
        const values = Array.isArray(value) ? value : [value]
        for (const item of values) {
          searchParams.append(key, String(item))
        }
      }
      url += `?${searchParams.toString()}`
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `cps/${this.cliVersion}`,
      Authorization: `Bearer ${this.apiKey()}`,
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error) {
      const details: Record<string, unknown> = {path}
      if (options.idempotencyKey) {
        details.idempotency_key = options.idempotencyKey
      }
      details.reason = String(error)
      this.fail('transport_error', '无法连接 MiniMax H3 API。', details)
    }

    if (!response.ok) {
      const payload = tryParseJson(await response.text())
      const details: Record<string, unknown> = {http_status: response.status}
      if (payload !== null) {
        details.response = payload
      }
      if (options.idempotencyKey) {
        details.idempotency_key = options.idempotencyKey
      }
      this.fail(
        'api_error',
        apiMessage(payload, `MiniMax H3 API 以 HTTP ${response.status} 拒绝了请求。`),
        details,
      )
    }

    const content = await response.text()
    if (!content) {
      return {}
    }
    const payload = tryParseJson(content)
    if (payload === null) {
      this.fail('invalid_response', 'MiniMax H3 API 返回了无效响应。')
    }
    const retCode = payload.RetCode
    if (payload.type === 'error' || (typeof retCode === 'number' && retCode !== 0)) {
      this.fail('api_error', apiMessage(payload, 'MiniMax H3 API 拒绝了请求。'), {response: payload})
    }
    return payload
  }

  // 以 HTTPS PUT 上传原始字节(引用素材直传)
  async putBytes(
    uploadUrl: string,
    bytes: Buffer,
    headers: Record<string, string>,
  ): Promise<void> {
    let response: Response
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (error) {
      this.fail('upload_error', '无法上传引用文件。', {reason: String(error)})
    }
    if (!response.ok) {
      await response.text()
      this.fail('upload_error', `引用素材上传失败, HTTP ${response.status}。`, {
        http_status: response.status,
      })
    }
  }
  // #endregion
}

// 解析 JSON, 非 dict 一律视为无效
function tryParseJson(content: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(content) as unknown
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// 从响应体提取错误消息
function apiMessage(payload: Record<string, unknown> | null, fallback: string): string {
  if (payload) {
    const error = payload.error
    if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      if (message) {
        return String(message)
      }
    }
    if (typeof error === 'string' && error) {
      return error
    }
    for (const key of ['Message', 'message']) {
      if (payload[key]) {
        return String(payload[key])
      }
    }
  }
  return fallback
}

// 生成并校验幂等键(缺省自动生成 UUID)
export function newIdempotencyKey(value?: string): string {
  const key = (value ?? randomUUID()).trim()
  if (key.length === 0 || key.length > 128) {
    throw new UsageError('幂等键长度必须为 1-128 个字符。')
  }
  return key
}
