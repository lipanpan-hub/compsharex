// 命令输出渲染器(移植自 compshare_cli/output.py)
// 三种输出模式: 人类可读表格 / JSON 文档(敏感字段脱敏) / --show-sensitive 明文

// #region 敏感字段判定与脱敏

const SENSITIVE_KEYS = new Set([
  'authorization',
  'command',
  'cookie',
  'eip',
  'filebrowserpassword',
  'hostip',
  'ip',
  'ipaddr',
  'ipaddress',
  'ipv4',
  'ipv6',
  'logincommand',
  'password',
  'privateip',
  'privatekey',
  'publicip',
  'secret',
  'secretkey',
  'ssh',
  'sshcommand',
  'sshlogincommand',
  'token',
  'url',
])

const JSON_SCHEMA_VERSION = '1'
const TRANSPORT_KEYS = new Set(['Action', 'request_uuid', 'RetCode'])
const REDACTED_MARK = '***'

// 键名归一化: 仅保留字母数字并转小写
function normalizedKey(key: unknown): string {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// 判定一个键是否承载敏感值
export function isSensitiveKey(key: unknown): boolean {
  const normalized = normalizedKey(key)
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('token') ||
    normalized.endsWith('url')
  )
}

// 递归脱敏(不含路径记录)
export function sanitized(value: unknown, showSensitive = false): unknown {
  if (showSensitive) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitized(item, false))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED_MARK : sanitized(item, false)
    }
    return result
  }
  return value
}

// 递归脱敏并记录被遮蔽字段的路径(如 data.UHostSet.0.Password)
function sanitizedWithPaths(
  value: unknown,
  showSensitive: boolean,
  path: string,
): [unknown, string[]] {
  if (showSensitive) {
    return [value, []]
  }
  if (Array.isArray(value)) {
    const result: unknown[] = []
    const redacted: string[] = []
    value.forEach((item, index) => {
      const [safeItem, itemRedacted] = sanitizedWithPaths(item, false, `${path}[${index}]`)
      result.push(safeItem)
      redacted.push(...itemRedacted)
    })
    return [result, redacted]
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    const redacted: string[] = []
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const itemPath = `${path}.${key}`
      if (isSensitiveKey(key)) {
        result[key] = REDACTED_MARK
        redacted.push(itemPath)
      } else {
        const [safeItem, itemRedacted] = sanitizedWithPaths(item, false, itemPath)
        result[key] = safeItem
        redacted.push(...itemRedacted)
      }
    }
    return [result, redacted]
  }
  return [value, []]
}

// #endregion

// #region 显示宽度计算(处理中文等全角字符)

// 剥离 ANSI 转义序列
function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

// 单个字符的终端显示宽度: 常见 CJK/全角区块按 2 列计
function charWidth(code: number): number {
  const isWide =
    (code >= 0x11_00 && code <= 0x11_5f) ||
    (code >= 0x2e_80 && code <= 0x30_3e) ||
    (code >= 0x30_41 && code <= 0x33_ff) ||
    (code >= 0x34_00 && code <= 0x4d_bf) ||
    (code >= 0x4e_00 && code <= 0x9f_ff) ||
    (code >= 0xa0_00 && code <= 0xa4_cf) ||
    (code >= 0xac_00 && code <= 0xd7_a3) ||
    (code >= 0xf9_00 && code <= 0xfa_ff) ||
    (code >= 0xfe_30 && code <= 0xfe_4f) ||
    (code >= 0xff_00 && code <= 0xff_60) ||
    (code >= 0xff_e0 && code <= 0xff_e6)
  return isWide ? 2 : 1
}

// 字符串的终端显示宽度
export function displayWidth(value: string): number {
  let width = 0
  for (const character of stripAnsi(value)) {
    width += charWidth(character.codePointAt(0) ?? 0)
  }
  return width
}

// 按显示宽度右侧补空格
function padDisplayEnd(value: string, width: number): string {
  const padding = Math.max(0, width - displayWidth(value))
  return value + ' '.repeat(padding)
}

// #endregion

// #region ANSI 颜色

const ANSI = {
  green: (text: string) => `\u001b[32m${text}\u001b[0m`,
  red: (text: string) => `\u001b[31m${text}\u001b[0m`,
  yellow: (text: string) => `\u001b[33m${text}\u001b[0m`,
  bold: (text: string) => `\u001b[1m${text}\u001b[0m`,
  cyan: (text: string) => `\u001b[36m${text}\u001b[0m`,
}

// 非交互终端(管道/重定向)下去除颜色码
function maybeColorize(colorize: (text: string) => string, text: string): string {
  return process.stdout.isTTY ? colorize(text) : text
}

// #endregion

// 分页元数据映射: API 响应字段 → JSON meta 字段
function paginationMetadata(response: Record<string, unknown>): Record<string, unknown> {
  const mapping: Array<[string, string]> = [
    ['TotalCount', 'total'],
    ['FilteredCount', 'filtered'],
    ['ReturnedCount', 'returned'],
    ['Offset', 'offset'],
  ]
  const metadata: Record<string, unknown> = {}
  for (const [source, target] of mapping) {
    if (response[source] !== undefined && response[source] !== null) {
      metadata[target] = response[source]
    }
  }
  if ('Limit' in response) {
    if (response.Limit === undefined || response.Limit === null) {
      metadata.all = true
    } else {
      metadata.limit = response.Limit
    }
  }
  if (response.RegionSet !== undefined && response.RegionSet !== null) {
    metadata.regions = response.RegionSet
  }
  return metadata
}

// 时间戳单元格格式化为本地时间
function formatTimestamp(seconds: number): string {
  const date = new Date(seconds * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export type ColumnTuple = readonly [key: string, label: string]

// JSON 输出模式写入单行文档(UTF-8, 独立于控制台代码页)
function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

export interface DataOptions {
  rows?: Array<Record<string, unknown>> | null
  columns?: readonly ColumnTuple[]
  // JSON 模式按 columns 的 key 投影为 {items: [...]}
  jsonList?: boolean
  // JSON 模式投影字段(缺省用 columns 的 key, 供 JSON 字段集与表格列不同的命令使用)
  jsonFields?: readonly string[]
  metadata?: Record<string, unknown>
}

export interface ErrorOptions {
  details?: Record<string, unknown>
}

// 渲染器: 表格(人类) / JSON(机器) 双策略, 附带敏感字段脱敏
export class Renderer {
  readonly jsonOutput: boolean
  readonly showSensitive: boolean

  constructor(jsonOutput: boolean, showSensitive = false) {
    this.jsonOutput = jsonOutput
    this.showSensitive = showSensitive
  }

  // #region 数据输出

  // 主输出入口: 表格或 JSON
  data(response: Record<string, unknown>, options: DataOptions = {}): void {
    const {rows = null, columns, jsonList = false, jsonFields, metadata} = options
    if (this.jsonOutput) {
      if (response.ok === false) {
        this.responseError(response)
        return
      }
      const data: Record<string, unknown> = {}
      const responseMetadata: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(response)) {
        if (TRANSPORT_KEYS.has(key)) {
          responseMetadata[key === 'Action' ? 'action' : key === 'RetCode' ? 'ret_code' : 'request_uuid'] = value
        } else {
          data[key] = value
        }
      }
      delete data.ok
      if (data.error === undefined || data.error === null) {
        delete data.error
      }
      if (jsonList) {
        const fields = jsonFields ?? (columns ?? []).map(([key]) => key)
        const items = (rows ?? []).map((row) => {
          const projected: Record<string, unknown> = {}
          for (const field of fields) {
            projected[field] = row[field]
          }
          return projected
        })
        data.items = items
        Object.assign(responseMetadata, paginationMetadata(response))
        if (!('returned' in responseMetadata)) {
          responseMetadata.returned = items.length
        }
      }
      if (metadata) {
        Object.assign(responseMetadata, metadata)
      }
      this.writeSuccess(data, responseMetadata)
      return
    }
    const safe = sanitized(response, this.showSensitive)
    if (rows !== null && columns && columns.length > 0) {
      this.table(rows, columns)
      return
    }
    writeJson(safe)
  }

  // 渲染人类可读表格(无结果时输出提示)
  table(rows: Iterable<Record<string, unknown>> | null, columns: readonly ColumnTuple[]): void {
    const rightAlignKeys = new Set(['CPU', 'GPU', 'InstancePrice', 'Price', 'Size'])
    const rowList = [...(rows ?? [])]
    if (rowList.length === 0) {
      process.stdout.write('没有查询到结果, 请调整过滤条件或检查所选地域。\n')
      return
    }

    // #region 计算列宽
    const widths = columns.map(([key, label]) =>
      Math.max(displayWidth(label), ...rowList.map((row) => displayWidth(this.cellText(row[key], key)))),
    )
    const minResourceIdWidth = 24
    columns.forEach(([key], index) => {
      if (key === 'ResourceId') {
        widths[index] = Math.max(widths[index], minResourceIdWidth)
      }
    })
    // #endregion

    // #region 渲染边框与内容行
    const separator = `+${columns.map((_, index) => '-'.repeat(widths[index] + 2)).join('+')}+`
    const headerBody = columns
      .map(([, label], index) => ` ${padDisplayEnd(process.stdout.isTTY ? ANSI.bold(label) : label, widths[index])} `)
      .join('|')
    const lines: string[] = [separator, `|${headerBody}|`, separator]
    for (const row of rowList) {
      const cells = columns.map(([key], index) => {
        const raw = this.cell(row[key], key)
        const isRightAlign = rightAlignKeys.has(key)
        const visibleWidth = displayWidth(raw)
        const padding = Math.max(0, widths[index] - visibleWidth)
        return ` ${isRightAlign ? `${' '.repeat(padding)}${raw}` : `${raw}${' '.repeat(padding)}`} `
      })
      lines.push(`|${cells.join('|')}|`)
    }
    lines.push(separator)
    process.stdout.write(`${lines.join('\n')}\n`)
    // #endregion
  }

  // #endregion

  // #region 详情/成功/错误输出

  // 渲染紧凑详情卡片; JSON 模式输出原始响应
  details(title: string, fields: Array<[string, unknown]>, response?: Record<string, unknown>): void {
    if (this.jsonOutput) {
      const payload: Record<string, unknown> = {}
      if (response) {
        Object.assign(payload, response)
      } else {
        for (const [label, value] of fields) {
          payload[label] = value
        }
      }
      this.data(payload)
      return
    }
    const rows: string[] = []
    // label 列宽取固定下限 16 与最长 label 的较大值, 保证超长标签也与其他行对齐
    const labelWidth = Math.max(16, ...fields.map(([label]) => displayWidth(label)))
    for (const [label, value] of fields) {
      rows.push(` ${maybeColorize(ANSI.cyan, padDisplayEnd(label, labelWidth))}  ${this.cell(value, label)}`)
    }
    const contentWidth = Math.max(displayWidth(title), ...rows.map((row) => displayWidth(row))) + 2
    // 顶边框总宽需等于 contentWidth + 2: "┌─ " 占 3, 标题后空格 1, 右端 ┐ 占 1, 故横线数为 contentWidth - 标题宽 - 3
    const top = `┌─ ${title} ${'─'.repeat(Math.max(0, contentWidth - displayWidth(title) - 3))}┐`
    const bottom = `└${'─'.repeat(contentWidth)}┘`
    const body = rows.map((row) => `│${row}${' '.repeat(Math.max(0, contentWidth - displayWidth(row)))}│`)
    process.stdout.write(`${[top, ...body, bottom].join('\n')}\n`)
  }

  // 输出成功标记; JSON 模式输出响应文档
  success(message: string, response: Record<string, unknown>): void {
    if (this.jsonOutput) {
      this.data(response)
      return
    }
    process.stdout.write(`${maybeColorize(ANSI.green, '✓')} ${message}\n`)
  }

  // 带错误码的错误输出(JSON 模式输出结构化错误文档)
  codedError(code: string, message: string, options: ErrorOptions = {}): void {
    if (this.jsonOutput) {
      this.writeError(code, message, options.details)
      return
    }
    this.printHumanError(message)
  }

  // 普通错误输出
  error(message: string, options: ErrorOptions = {}): void {
    if (this.jsonOutput) {
      this.writeError('command_error', message, options.details)
      return
    }
    this.printHumanError(message)
  }

  private printHumanError(message: string): void {
    process.stderr.write(`${maybeColorize(ANSI.red, '错误')}: ${message}\n`)
  }

  // #endregion

  // #region JSON 文档写入

  private writeSuccess(data: unknown, metadata?: Record<string, unknown>): void {
    const [safeData, redacted] = sanitizedWithPaths(data, this.showSensitive, 'data')
    const [safeMetadata, metadataRedacted] = sanitizedWithPaths(
      {...metadata},
      this.showSensitive,
      'meta',
    )
    redacted.push(...metadataRedacted)
    if (redacted.length > 0) {
      ;(safeMetadata as Record<string, unknown>).redacted_fields = redacted
    }
    const payload: Record<string, unknown> = {
      ok: true,
      schema_version: JSON_SCHEMA_VERSION,
      data: safeData,
    }
    if (Object.keys(safeMetadata as Record<string, unknown>).length > 0) {
      payload.meta = safeMetadata
    }
    writeJson(payload)
  }

  private writeError(code: string, message: string, details?: Record<string, unknown>): void {
    const error: Record<string, unknown> = {code, message}
    let redacted: string[] = []
    if (details) {
      const [safeDetails, detailsRedacted] = sanitizedWithPaths(details, this.showSensitive, 'error.details')
      error.details = safeDetails
      redacted = detailsRedacted
    }
    const payload: Record<string, unknown> = {
      ok: false,
      schema_version: JSON_SCHEMA_VERSION,
      error,
    }
    if (redacted.length > 0) {
      payload.meta = {redacted_fields: redacted}
    }
    writeJson(payload)
  }

  // 响应自带 ok:false 时的错误透传
  private responseError(response: Record<string, unknown>): void {
    const rawError = response.error
    const details: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(response)) {
      if (key !== 'ok' && key !== 'error' && key !== 'error_code' && key !== 'message') {
        details[key] = value
      }
    }
    let code: string
    let message: string
    if (rawError !== null && typeof rawError === 'object' && !Array.isArray(rawError)) {
      const raw = rawError as Record<string, unknown>
      code = String(raw.code ?? 'operation_failed')
      message = String(raw.message ?? '操作失败。')
      for (const [key, value] of Object.entries(raw)) {
        if (key !== 'code' && key !== 'message' && !(key in details)) {
          details[key] = value
        }
      }
    } else {
      code = String(response.error_code ?? 'operation_failed')
      message = String(rawError ?? response.message ?? '操作失败。')
    }
    this.writeError(code, message, Object.keys(details).length > 0 ? details : undefined)
  }

  // #endregion

  // #region 单元格格式化

  // 单元格纯文本(不含颜色, 供宽度计算)
  private cellText(value: unknown, key: string): string {
    return stripAnsi(this.cell(value, key))
  }

  // 单元格渲染: None/脱敏/布尔/JSON/时间/状态着色
  private cell(value: unknown, key?: string): string {
    if (value === undefined || value === null) {
      return '-'
    }
    if (key && !this.showSensitive && isSensitiveKey(key)) {
      return REDACTED_MARK
    }
    if (typeof value === 'boolean') {
      return value ? '是' : '否'
    }
    if (typeof value === 'object') {
      return JSON.stringify(sanitized(value, this.showSensitive))
    }
    if (key && key.toLowerCase().includes('time') && (typeof value === 'number')) {
      return formatTimestamp(value)
    }
    const normalizedKeyLower = key ? key.toLowerCase() : ''
    if (normalizedKeyLower === 'state' || normalizedKeyLower === 'status') {
      const state = String(value)
      const normalized = state.toLowerCase()
      if (['available', 'running', 'succeeded', 'success'].includes(normalized)) {
        return maybeColorize(ANSI.green, state)
      }
      if (['error', 'failed', 'terminated'].includes(normalized)) {
        return maybeColorize(ANSI.red, state)
      }
      if (!['closed', 'stopped'].includes(normalized)) {
        return maybeColorize(ANSI.yellow, state)
      }
    }
    return String(value)
  }

  // #endregion
}
