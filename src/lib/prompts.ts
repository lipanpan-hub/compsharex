// 带超时的交互式询问工具(装饰器模式): 在不改变 @inquirer/prompts 调用接口的前提下附加超时控制。
// 超时策略按参数性质决定: 配置了 default 的询问超时后取默认值, 未配置 default 的必填项超时后直接报错退出。

import {input, password, select, search} from '@inquirer/prompts'

// #region 常量与错误

// 交互询问默认超时 30 秒
export const DEFAULT_PROMPT_TIMEOUT_MS = 30 * 1000

// 必填项超时未响应时抛出, 由 oclif 统一渲染并以退出码 1 结束
export class PromptTimeoutError extends Error {
  constructor(promptMessage: string, timeoutMs: number) {
    super(`等待输入 "${promptMessage}" 超过 ${Math.round(timeoutMs / 1000)}s 未响应, 已退出。`)
    this.name = 'PromptTimeoutError'
  }
}

// #endregion

// #region 超时控制核心

// 非交互终端(管道/CI)下没有人能应答, 视同超时立即走默认值或退出
function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY)
}

// 超时回退策略工厂: 有默认值返回默认值, 无默认值视为必填参数超时退出
function createTimeoutFallback<Value>(
  promptMessage: string,
  resolvedTimeoutMs: number,
  fallbackValue?: Value,
): () => Value {
  return () => {
    if (fallbackValue !== undefined) {
      return fallbackValue
    }
    throw new PromptTimeoutError(promptMessage, resolvedTimeoutMs)
  }
}

// 超时控制核心: 超时后 abort 交互(inquirer 会清理终端状态), abort 原因作为标记从 error.cause 识别;
// 其余错误(如 Ctrl+C 的 ExitPromptError)原样上抛。导出仅供测试。
export async function withPromptTimeout<Value>(
  promptMessage: string,
  timeoutMs: number | undefined,
  runPrompt: (abortSignal: AbortSignal) => Promise<Value>,
  resolveFallback: () => Value,
): Promise<Value> {
  const resolvedTimeoutMs = timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS
  if (!isInteractiveTerminal()) {
    return resolveFallback()
  }
  const abortController = new AbortController()
  // 超时后 abort, reason 会成为 AbortPromptError 的 cause 带出
  const timer = setTimeout(
    () => abortController.abort(new PromptTimeoutError(promptMessage, resolvedTimeoutMs)),
    resolvedTimeoutMs,
  )
  try {
    return await runPrompt(abortController.signal)
  } catch (promptError) {
    // (as 断言 -> 可选链取 cause) 后再判断是否超时标记, 明确运算顺序
    if ((promptError as {cause?: unknown} | null)?.cause instanceof PromptTimeoutError) {
      return resolveFallback()
    }
    throw promptError
  } finally {
    clearTimeout(timer)
  }
}

// 当前 @inquirer/type 的 Context 类型尚未声明 signal 字段, 但运行时(@inquirer/core 9.2.1)已支持, 做一次收窄
function promptContext(abortSignal: AbortSignal): Parameters<typeof input>[1] {
  return {signal: abortSignal} as Parameters<typeof input>[1]
}

// #endregion

// #region 带超时的询问函数

// 文本输入: 超时后有 default 取 default, 无 default 视为必填直接退出
export async function timedInput(
  options: Parameters<typeof input>[0] & {timeoutMs?: number},
): Promise<string> {
  const {timeoutMs, ...inputConfig} = options
  const promptMessage = String(inputConfig.message)
  return withPromptTimeout(
    promptMessage,
    timeoutMs,
    (abortSignal) => input(inputConfig, promptContext(abortSignal)),
    createTimeoutFallback(promptMessage, timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS, inputConfig.default),
  )
}

// 掩码输入: inquirer 的 password 无 default 概念, 需要超时回退时通过 fallbackValue 显式指定(如保留旧值传 '')
export async function timedPassword(
  options: Parameters<typeof password>[0] & {fallbackValue?: string; timeoutMs?: number},
): Promise<string> {
  const {timeoutMs, fallbackValue, ...passwordConfig} = options
  const promptMessage = String(passwordConfig.message)
  return withPromptTimeout(
    promptMessage,
    timeoutMs,
    (abortSignal) => password(passwordConfig, promptContext(abortSignal)),
    createTimeoutFallback(promptMessage, timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS, fallbackValue),
  )
}

// 单选: 超时后有 default 选中默认项, 无 default 视为必填直接退出
export async function timedSelect<Value>(
  options: Parameters<typeof select<Value>>[0] & {timeoutMs?: number},
): Promise<Value> {
  const {timeoutMs, ...selectConfig} = options
  const promptMessage = String(selectConfig.message)
  return withPromptTimeout(
    promptMessage,
    timeoutMs,
    (abortSignal) => select<Value>(selectConfig, promptContext(abortSignal)),
    createTimeoutFallback(promptMessage, timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS, selectConfig.default),
  )
}

// 模糊搜索单选: search 无 default 概念, 超时视为必填直接退出
export async function timedSearch<Value>(
  options: Parameters<typeof search<Value>>[0] & {timeoutMs?: number},
): Promise<Value> {
  const {timeoutMs, ...searchConfig} = options
  const promptMessage = String(searchConfig.message)
  return withPromptTimeout(
    promptMessage,
    timeoutMs,
    (abortSignal) => search<Value>(searchConfig, promptContext(abortSignal)),
    createTimeoutFallback(promptMessage, timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS),
  )
}

// #endregion
