// UCloud CompShare API 适配器(移植自 compshare_cli/sdk.py)
//
// 不走 SDK 的 Client.invoke: 其 `maxRetries || 3` 无法关闭重试, 且会对非幂等的
// Create/Delete 类错误也重试; 这里直接组合 Credential/Request 的展平与签名逻辑,
// 用 fetch 自行发送, 同时支撑 monitor(JSON 数组 body)与 download(二进制响应)两个特殊场景。

import {createHash} from 'node:crypto'

import {UCloudApiError, UCloudTransportError, UsageError} from './errors.js'

const DEFAULT_BASE_URL = 'https://api.compshare.cn'
const REQUEST_TIMEOUT_MS = 60_000
const USER_AGENT = 'compsharex/1.0'

export interface CompShareSDKOptions {
  publicKey: string
  privateKey: string
  region?: string
  projectId?: string
  baseUrl?: string
}

export interface DownloadResult {
  bytes: Buffer
  headers: Record<string, string>
}

// 展平嵌套参数: dict → Key.Sub, list → Key.0 / Key.0.Sub(与官方 SDK Request.encode 一致)
export function flattenArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          for (const [subKey, subValue] of Object.entries(flattenArgs(item as Record<string, unknown>))) {
            result[`${key}.${index}.${subKey}`] = subValue
          }
        } else {
          result[`${key}.${index}`] = item
        }
      })
    } else if (typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(flattenArgs(value as Record<string, unknown>))) {
        result[`${key}.${subKey}`] = subValue
      }
    } else {
      result[key] = value
    }
  }
  return result
}

// 签名: 键名字典序排序后 key+value 拼接, 追加私钥取 SHA1(与官方 Credential.verifyAc 一致)
export function verifyAc(args: Record<string, unknown>, privateKey: string, publicKey: string): string {
  const obj: Record<string, unknown> = {...args, PublicKey: publicKey}
  const keys = Object.keys(obj).sort()
  let concatenated = ''
  for (const key of keys) {
    const value = obj[key]
    if (value === undefined || value === null) {
      continue
    }
    concatenated += key
    concatenated += String(value)
  }
  concatenated += privateKey
  return createHash('sha1').update(concatenated).digest('hex')
}

export class CompShareSDK {
  private readonly publicKey: string
  private readonly privateKey: string
  private readonly region?: string
  private readonly projectId?: string
  private readonly baseUrl: string

  constructor(options: CompShareSDKOptions) {
    this.publicKey = options.publicKey
    this.privateKey = options.privateKey
    this.region = options.region
    this.projectId = options.projectId
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  // 调用 API 并返回 JSON 响应(RetCode != 0 时抛 UCloudApiError)
  async invoke(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (action === 'GetCompShareInstanceMonitor') {
      return this.invokeMonitor(action, params)
    }
    const payload = this.buildSignedPayload(action, params)
    const content = await this.sendJson(action, payload)
    return content
  }

  // 调用响应为文件流的 action, 返回原始字节与响应头
  async download(action: string, params: Record<string, unknown>): Promise<DownloadResult> {
    const payload = this.buildSignedPayload(action, params)
    const response = await this.post(action, payload)
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('json')) {
      const text = await response.text()
      this.parseActionResponse(action, text)
      // RetCode 为 0 的 JSON 响应对下载场景无意义
      throw new UCloudTransportError('下载接口返回了 JSON 而非文件内容。')
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {bytes: buffer, headers}
  }

  // #region 内部请求构造

  // 构造默认注入 + 展平 + 签名后的请求体
  private buildSignedPayload(
    action: string,
    params: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {Action: action, ...params}
    if (!args.Region && this.region) {
      args.Region = this.region
    }
    if (!args.ProjectId && this.projectId) {
      args.ProjectId = this.projectId
    }
    const flattened = flattenArgs(args)
    const signature = verifyAc(flattened, this.privateKey, this.publicKey)
    return {...flattened, Signature: signature, PublicKey: this.publicKey, ...overrides}
  }

  // 监控接口特殊签名: UHostIds 以字符串拼接参与签名, JSON body 中保留数组
  private async invokeMonitor(action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const uhostIds = params.UHostIds
    if (!Array.isArray(uhostIds) || uhostIds.some((item) => typeof item !== 'string')) {
      throw new UsageError('监控查询要求 UHostIds 为字符串数组。')
    }
    // 该接口对原生 JSON 数组按元素拼接签名
    const signedIds = (uhostIds as string[]).join('')
    const payload = this.buildSignedPayload(action, {...params, UHostIds: signedIds}, {UHostIds: uhostIds})
    return this.sendJson(action, payload)
  }

  // #endregion

  // #region HTTP 发送与响应解析

  private async post(action: string, payload: Record<string, unknown>): Promise<Response> {
    let response: Response
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new UCloudTransportError(`无法连接 CompShare API(${action}): ${String(error)}`)
    }
    if (!response.ok) {
      // HTTP 状态非 2xx 时尝试读取 JSON 错误体
      const text = await response.text()
      let message = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>
        if (parsed.Message) {
          message = String(parsed.Message)
        }
      } catch {
        // 保留默认 message
      }
      throw new UCloudApiError(action, response.status, message, response.headers.get('x-ucloud-request-uuid') ?? '')
    }
    return response
  }

  // 发送并解析 JSON 响应, 校验 RetCode
  private async sendJson(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.post(action, payload)
    const text = await response.text()
    return this.parseActionResponse(action, text, response.headers.get('x-ucloud-request-uuid') ?? '')
  }

  private parseActionResponse(action: string, text: string, requestId = ''): Record<string, unknown> {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new UCloudTransportError(`CompShare API(${action})返回了无法解析的响应。`)
    }
    const retCode = Number(data.RetCode ?? 0)
    if (retCode !== 0) {
      throw new UCloudApiError(action, retCode, String(data.Message ?? ''), requestId)
    }
    return data
  }

  // #endregion
}
