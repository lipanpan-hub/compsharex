// Modelverse(优云智算 LLM 服务) OpenAI 兼容 API 客户端(纯 fetch 实现)
// 支持 JSON 与 multipart 两种请求体, 以及音频二进制流下载(对齐 MiniMaxClient 的风格)

import {SilentExit} from './errors.js'
import type {Renderer} from './output.js'

export const MODELVERSE_DEFAULT_BASE_URL = 'https://api.modelverse.cn/v1'
export const MODELVERSE_API_KEY_ENV = 'MODELVERSE_API_KEY'

// 请求选项: query 拼接在 URL, body 走 JSON, form 走 multipart(由 fetch 自动生成 boundary)
export interface ModelverseRequestOptions {
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  form?: FormData
  // 合成类接口耗时较长, 允许按请求覆盖超时
  timeoutMs?: number
}

export class ModelverseClient {
  constructor(
    private readonly renderer: Renderer,
    private readonly cliVersion: string,
    // 配置档案中的 API Key(环境变量缺省时的回退来源)
    private readonly configApiKey?: string,
    // 配置档案中的 Base URL(缺省时使用官方地址)
    private readonly configBaseUrl?: string,
  ) {}

  // 分类错误输出并以指定退出码终止
  fail(code: string, message: string, details?: Record<string, unknown>, exitCode = 1): never {
    this.renderer.codedError(code, message, {details})
    throw new SilentExit(exitCode)
  }

  // 读取并校验 API Key(环境变量优先, 其次配置档案 cps llm cfset)
  apiKey(): string {
    const envKey = (process.env[MODELVERSE_API_KEY_ENV] ?? '').trim()
    const configKey = (this.configApiKey ?? '').trim()
    const key = envKey || configKey
    if (!key) {
      this.fail(
        'configuration_error',
        `请设置环境变量 ${MODELVERSE_API_KEY_ENV} 或运行 cps llm cfset 配置优云智算 LLM API Key。`,
        undefined,
        2,
      )
    }
    return key
  }

  // 读取服务地址(配置档案优先, 去除尾部斜杠)
  baseUrl(): string {
    const rawUrl = (this.configBaseUrl ?? '').trim() || MODELVERSE_DEFAULT_BASE_URL
    return rawUrl.replace(/\/+$/, '')
  }

  // #region 请求与响应处理
  // 拼接查询参数并发送请求, 返回原始 Response
  private async send(method: string, path: string, options: ModelverseRequestOptions = {}): Promise<Response> {
    let url = `${this.baseUrl()}${path}`
    if (options.query) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) {
          continue
        }
        searchParams.append(key, String(value))
      }
      url += `?${searchParams.toString()}`
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `cps/${this.cliVersion}`,
      Authorization: `Bearer ${this.apiKey()}`,
    }
    let requestBody: FormData | string | undefined
    if (options.form) {
      // multipart 请求体不能手动设置 Content-Type, boundary 由 fetch 生成
      requestBody = options.form
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      requestBody = JSON.stringify(options.body)
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      })
    } catch (error) {
      this.fail('transport_error', '无法连接 Modelverse API。', {path, reason: String(error)})
    }
  }

  // JSON 请求: 返回解析后的对象, 非 2xx 或非 JSON 一律分类报错
  async request(
    method: string,
    path: string,
    options: ModelverseRequestOptions = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.send(method, path, options)
    const content = await response.text()
    const payload = tryParseJson(content)
    if (!response.ok) {
      this.fail(
        'api_error',
        apiMessage(payload, `Modelverse API 以 HTTP ${response.status} 拒绝了请求。`),
        {http_status: response.status, ...(payload ? {response: payload} : {})},
      )
    }
    if (payload === null) {
      this.fail('invalid_response', 'Modelverse API 返回了无效响应。', {http_status: response.status})
    }
    return payload
  }

  // 音频下载: 合成接口返回二进制 WAV 流; 若服务端以 JSON 返回则视为错误
  async download(
    method: string,
    path: string,
    options: ModelverseRequestOptions = {},
  ): Promise<Buffer> {
    const response = await this.send(method, path, options)
    if (!response.ok) {
      const payload = tryParseJson(await response.text())
      this.fail(
        'api_error',
        apiMessage(payload, `Modelverse API 以 HTTP ${response.status} 拒绝了请求。`),
        {http_status: response.status, ...(payload ? {response: payload} : {})},
      )
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('application/json')) {
      const payload = tryParseJson(await response.text())
      this.fail('api_error', apiMessage(payload, 'Modelverse API 返回了错误响应。'), {
        ...(payload ? {response: payload} : {}),
      })
    }
    return Buffer.from(await response.arrayBuffer())
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

// 从响应体提取错误消息(OpenAI 风格 error.message 优先)
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
