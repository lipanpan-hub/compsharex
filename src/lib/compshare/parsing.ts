// 参数解析与格式化工具(移植自 compshare_cli/parsing.py)

import {readFileSync} from 'node:fs'

import {UsageError} from './errors.js'

// 内存/磁盘大小: 数字 + 可选单位(MiB/MB/GiB/GB/M/G)
const SIZE_PATTERN = /^\s*(\d+)\s*(mib|mb|gib|gb|m|g)?\s*$/i

// 相对时间: 数字 + 单位(m/h/d)
const RELATIVE_TIME_PATTERN = /^\s*(\d+)\s*([mhd])\s*$/i

// 时长: 正整数 + 单位(s/m/h/d/w), 用于定时关机延长等场景
const DURATION_PATTERN = /^\s*(\d+)\s*([smhdw])\s*$/i

// #region 容量解析

// 解析内存大小, 返回 MiB; 必须能换算成整数 GiB
export function memoryMib(value: string): number {
  const match = SIZE_PATTERN.exec(value)
  if (!match) {
    throw new UsageError(`无效的内存大小: ${value}。示例: 64GiB`)
  }
  const amount = Number(match[1])
  const unit = (match[2] || 'gib').toLowerCase()
  const isMiBFamily = unit === 'mib' || unit === 'mb' || unit === 'm'
  const result = isMiBFamily ? amount : (amount * 1024)
  if (result <= 0 || (result % 1024) !== 0) {
    throw new UsageError('内存必须为正数且能换算成整数 GiB。')
  }
  return result
}

// 解析磁盘大小, 返回 GiB
export function diskGib(value: string): number {
  const match = SIZE_PATTERN.exec(value)
  if (!match) {
    throw new UsageError(`无效的磁盘大小: ${value}。示例: 100GiB`)
  }
  let amount = Number(match[1])
  const unit = (match[2] || 'gib').toLowerCase()
  if (unit === 'mib' || unit === 'mb' || unit === 'm') {
    if ((amount % 1024) !== 0) {
      throw new UsageError('磁盘 MiB 值必须能换算成整数 GiB。')
    }
    amount = Math.floor(amount / 1024)
  }
  if (amount <= 0) {
    throw new UsageError('磁盘大小必须为正数。')
  }
  return amount
}

// #endregion

// #region 密码编解码

// 密码用 base64 编码后传给 API
export function encodePassword(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

// 解码 API 返回的密码字段, 兼容历史明文响应
export function decodePassword(value?: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  let decoded: string
  try {
    const buffer = Buffer.from(value, 'base64')
    decoded = buffer.toString('utf8')
    // 严格校验: 输入必须是合法 base64(重新编码需与原值一致)
    if (buffer.toString('base64') !== value) {
      return value
    }
  } catch {
    return value
  }
  if (!decoded || decoded.length === 0 || encodePassword(decoded) !== value) {
    return value
  }
  return decoded
}

// #endregion

// #region 时间解析

const RELATIVE_UNIT_SECONDS: Record<string, number> = {m: 60, h: 3600, d: 86_400}

// 解析时间: Unix 时间戳 / ISO 8601 / 相对值(30m、2h、1d), 返回秒级时间戳
export function timestamp(value: string): number {
  const relative = RELATIVE_TIME_PATTERN.exec(value)
  if (relative) {
    const amount = Number(relative[1])
    const unitSeconds = RELATIVE_UNIT_SECONDS[relative[2].toLowerCase()]
    return Math.floor(Date.now() / 1000) + (amount * unitSeconds)
  }
  if (/^\d+$/.test(value)) {
    return Number(value)
  }
  const normalized = value.replace('Z', '+00:00')
  // 带时区标识(±HH:MM 或 Z)时 Date.parse 按该时区解析
  const hasTimezone = /(?:[+-]\d{2}:?\d{2}|Z)$/i.test(value)
  let parsedMs: number
  if (hasTimezone) {
    parsedMs = Date.parse(normalized)
  } else if (/T/i.test(normalized)) {
    // 无时区的日期时间按 UTC 理解, 与 Python 端一致
    parsedMs = Date.parse(`${normalized}Z`)
  } else {
    // 纯日期(YYYY-MM-DD) Date.parse 本身就按 UTC 处理
    parsedMs = Date.parse(normalized)
  }
  if (Number.isNaN(parsedMs)) {
    throw new UsageError('时间必须是 Unix 时间戳、ISO 8601 值或 30m/2h 这样的相对值。')
  }
  return Math.floor(parsedMs / 1000)
}

// 解析过去的时间点: 绝对时间或 7d 这样的持续时长(从当前时间往前推)
export function pastTimestamp(value: string): number {
  const relative = RELATIVE_TIME_PATTERN.exec(value)
  if (!relative) {
    return timestamp(value)
  }
  const amount = Number(relative[1])
  const unitSeconds = RELATIVE_UNIT_SECONDS[relative[2].toLowerCase()]
  return Math.floor(Date.now() / 1000) - (amount * unitSeconds)
}

// #endregion

// #region 时长解析

const DURATION_UNIT_SECONDS: Record<string, number> = {s: 1, m: 60, h: 3600, d: 86_400, w: 604_800}

// 解析持续时长(如 90s、2h、1d、1w), 返回秒数
export function durationSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value.toLowerCase())
  if (!match) {
    throw new UsageError('时长必须为正整数加 s、m、h、d 或 w 单位。')
  }
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2]]
}

// #endregion

// #region 金额解析

// 解析正数金额(最多两位小数), 返回元
export function money(value: string): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new UsageError(`无效金额: ${value}。示例: 1000.50`)
  }
  // 最多两位小数: 转为"分"后必须无损
  const cents = Math.round(amount * 100)
  if (Math.abs((amount * 100) - cents) > 1e-6) {
    throw new UsageError('金额必须为正数且最多两位小数。')
  }
  return amount
}

// 解析金额并返回"分"(整数)
export function moneyCents(value: string): number {
  return Math.round(money(value) * 100)
}

// #endregion

// 过滤 null/undefined 字段
export function compact(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== null) {
      result[key] = value
    }
  }
  return result
}

// 合并多个逗号分隔列表为去空白数组
export function splitCsv(values: Iterable<string>): string[] {
  const result: string[] = []
  for (const value of values) {
    for (const item of value.split(',')) {
      const trimmed = item.trim()
      if (trimmed) {
        result.push(trimmed)
      }
    }
  }
  return result
}

// 读取文本文件
export function readText(path?: string): string | undefined {
  if (path === undefined || path === null) {
    return undefined
  }
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new UsageError(`无法读取文件 ${path}: ${String(error)}`)
  }
}

// 读取文件并返回 base64
export function readBase64(path?: string): string | undefined {
  if (path === undefined || path === null) {
    return undefined
  }
  try {
    return readFileSync(path).toString('base64')
  } catch (error) {
    throw new UsageError(`无法读取文件 ${path}: ${String(error)}`)
  }
}

// #region shlex 分词(POSIX 规则, 用于解析 SSH 登录命令)

// 按 POSIX shell 规则切分命令行: 支持单双引号与反斜杠转义
export function shlexSplit(value: string): string[] {
  const words: string[] = []
  let current = ''
  let hasWord = false
  let index = 0
  while (index < value.length) {
    const character = value[index]
    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      if (hasWord) {
        words.push(current)
        current = ''
        hasWord = false
      }
      index += 1
      continue
    }
    if (character === "'") {
      // 单引号内全部字面处理
      hasWord = true
      const endIndex = value.indexOf("'", index + 1)
      if (endIndex === -1) {
        throw new UsageError('SSH 登录命令包含未闭合的单引号。')
      }
      current += value.slice(index + 1, endIndex)
      index = endIndex + 1
      continue
    }
    if (character === '"') {
      // 双引号内仅 \" 与 \\ 被转义, 其余字面保留
      hasWord = true
      index += 1
      let closed = false
      while (index < value.length) {
        const inner = value[index]
        if (inner === '\\' && index + 1 < value.length && (value[index + 1] === '"' || value[index + 1] === '\\')) {
          current += value[index + 1]
          index += 2
          continue
        }
        if (inner === '"') {
          closed = true
          index += 1
          break
        }
        current += inner
        index += 1
      }
      if (!closed) {
        throw new UsageError('SSH 登录命令包含未闭合的双引号。')
      }
      continue
    }
    if (character === '\\') {
      // 引号外反斜杠转义任意字符
      if (index + 1 >= value.length) {
        throw new UsageError('SSH 登录命令以孤立的反斜杠结尾。')
      }
      hasWord = true
      current += value[index + 1]
      index += 2
      continue
    }
    hasWord = true
    current += character
    index += 1
  }
  if (hasWord) {
    words.push(current)
  }
  return words
}

// 按 POSIX 规则为单词加引号(用于把参数拼回一条远程命令)
export function shlexJoin(words: readonly string[]): string {
  return words.map((word) => shlexQuote(word)).join(' ')
}

// 为单个单词添加 shell 引号
export function shlexQuote(word: string): string {
  if (word === '') {
    return "''"
  }
  // 安全字符直接输出(保守集合, 与常用 shlex.quote 判定一致)
  const safePattern = /^[A-Za-z0-9_@%+=:,./-]+$/
  if (safePattern.test(word)) {
    return word
  }
  return `'${word.replace(/'/g, `'\\''`)}'`
}

// #endregion
