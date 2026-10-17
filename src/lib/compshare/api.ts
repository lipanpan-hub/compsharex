// 命令层 API 调用工具(移植自 compshare_cli/api.py)
// 统一错误分类渲染 + DeleteCompshareDisk 8434 业务重试 + 分页聚合

import {setTimeout as delay} from 'node:timers/promises'

import type {ColumnTuple} from './output.js'
import {CompshareContext} from './context.js'
import {CLIError, SilentExit, UCloudApiError, UCloudTransportError} from './errors.js'
import {CompShareSDK} from './sdk.js'

export interface InvokeOptions {
  // 指定后按 list key 渲染表格
  listKey?: string
  rowsBuilder?: (response: Record<string, unknown>) => Array<Record<string, unknown>>
  columns?: readonly ColumnTuple[]
  // 渲染成功标记(操作类命令)
  success?: string
  // JSON 模式把 rows 按 columns 投影为 {items}
  jsonList?: boolean
}

// 错误码提示(对齐 api.error_hint)
export function errorHint(action: string, code: number): string | undefined {
  const hints: Record<string, string> = {
    'DeleteCompshareDisk:8434': '磁盘仍在卸载中, 请稍后重试。',
    'AttachUS3:8433': '请确认所选地域与账号已开通 US3 服务。',
  }
  return hints[`${action}:${code}`]
}

// 追加提示语到错误消息
function withHint(message: string, hint?: string): string {
  return hint ? `${message} 提示: ${hint}` : message
}

// 统一错误处理: 渲染分类错误并以退出码 1 终止
function handleApiError(context: CompshareContext, action: string, error: unknown): never {
  const renderer = context.renderer
  if (error instanceof CLIError && !(error instanceof UCloudApiError) && !(error instanceof UCloudTransportError)) {
    renderer.codedError('configuration_error', error.message)
    throw new SilentExit(1)
  }
  if (error instanceof UCloudApiError) {
    const hint = errorHint(error.action || action, error.retCode)
    renderer.codedError('api_error', withHint(error.message || String(error), hint), {
      details: {
        action: error.action,
        ret_code: error.retCode,
        request_uuid: error.requestId,
        hint,
      },
    })
    throw new SilentExit(1)
  }
  renderer.codedError('transport_error', String(error))
  throw new SilentExit(1)
}

// 调用并渲染(命令主路径)
export async function invoke(
  context: CompshareContext,
  action: string,
  params: Record<string, unknown>,
  options: InvokeOptions = {},
): Promise<Record<string, unknown>> {
  const renderer = context.renderer
  const retries = action === 'DeleteCompshareDisk' ? 3 : 0
  let attempt = 0
  let response: Record<string, unknown>
  try {
    for (;;) {
      try {
        response = await context.sdk(params).invoke(action, params)
        break
      } catch (error) {
        // 磁盘卸载中的瞬态错误码, 带退避重试
        const isRetryable = error instanceof UCloudApiError && error.retCode === 8434 && attempt < retries
        if (!isRetryable) {
          throw error
        }
        attempt += 1
        if (!context.jsonOutput) {
          process.stdout.write(`资源仍在卸载中, 正在重试 (${attempt}/${retries})...\n`)
        }
        await delay(2 * attempt * 1000)
      }
    }
  } catch (error) {
    handleApiError(context, action, error)
  }

  if (options.success) {
    renderer.success(options.success, response)
  } else if (options.listKey === undefined && options.rowsBuilder === undefined) {
    renderer.data(response)
  } else {
    const rows = options.rowsBuilder
      ? options.rowsBuilder(response)
      : ((response[options.listKey ?? ''] as Array<Record<string, unknown>>) ?? [])
    renderer.data(response, {rows, columns: options.columns, jsonList: options.jsonList})
  }
  return response
}

// 纯调用不渲染(组合多个 API 调用的命令使用)
export async function call(
  context: CompshareContext,
  action: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    return await context.sdk(params).invoke(action, params)
  } catch (error) {
    handleApiError(context, action, error)
  }
}

export type CapturedError = Record<string, unknown>

// 调用并捕获结构化错误(批量操作/诊断使用)
export async function callCaptured(
  context: CompshareContext,
  action: string,
  params: Record<string, unknown>,
): Promise<[Record<string, unknown> | null, CapturedError | null]> {
  try {
    return [await context.sdk(params).invoke(action, params), null]
  } catch (error) {
    if (error instanceof UCloudApiError) {
      const hint = errorHint(error.action || action, error.retCode)
      return [
        null,
        {
          message: withHint(error.message || String(error), hint),
          action: error.action || action,
          ret_code: error.retCode,
          request_uuid: error.requestId,
          hint,
        },
      ]
    }
    if (error instanceof CLIError) {
      return [null, {message: error.message, action}]
    }
    return [null, {message: String(error), action}]
  }
}

export interface CollectPagesOptions {
  offset?: number
  limit?: number | null
  pageSize?: number
}

// 偏移量分页聚合: 支持取指定范围或全部页(对齐 api.collect_pages)
export async function collectPages(
  context: CompshareContext,
  action: string,
  params: Record<string, unknown>,
  listKey: string,
  options: CollectPagesOptions = {},
): Promise<Record<string, unknown>> {
  const offset = options.offset ?? 0
  const limit = options.limit ?? null
  const pageSize = options.pageSize ?? 100
  if (pageSize < 1) {
    throw new CLIError('page_size 必须为正数')
  }

  let combined: Record<string, unknown> | null = null
  const rows: Array<Record<string, unknown>> = []
  let currentOffset = offset
  let remaining = limit

  while (remaining === null || remaining > 0) {
    const currentLimit = remaining === null ? pageSize : Math.min(pageSize, remaining)
    const response = await call(context, action, {...params, Limit: currentLimit, Offset: currentOffset})
    if (combined === null) {
      combined = {...response}
    }
    const page = (response[listKey] as Array<Record<string, unknown>>) ?? []
    rows.push(...page)
    currentOffset += page.length
    if (remaining !== null) {
      remaining -= page.length
    }

    const total = typeof response.TotalCount === 'number' ? response.TotalCount : response.Total
    const isShortPage = page.length === 0 || page.length < currentLimit
    if (isShortPage || (typeof total === 'number' && currentOffset >= total)) {
      break
    }
  }

  const result = combined ?? {}
  result[listKey] = rows
  result.ReturnedCount = rows.length
  result.Offset = offset
  if (limit !== null) {
    result.Limit = limit
  }
  return result
}

// 下载非 JSON 响应(保留错误分类渲染)
export async function downloadFile(
  context: CompshareContext,
  action: string,
  params: Record<string, unknown>,
): Promise<{bytes: Buffer; headers: Record<string, string>}> {
  try {
    const sdk: CompShareSDK = context.sdk(params)
    return await sdk.download(action, params)
  } catch (error) {
    handleApiError(context, action, error)
  }
}
