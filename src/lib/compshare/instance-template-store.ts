// 本地实例配置模板存储(移植自 compshare_cli/instance_templates.py)
// 模板保存 create 命令的可复用参数组合, 以 JSON 文件形式与 config.yml 同目录存放。

import {chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'

import {ConfigError, UsageError} from './errors.js'

const TEMPLATE_SCHEMA_VERSION = 1

// 模板参数按类型分组校验
const TEXT_PARAMETERS = new Set([
  'charge',
  'disk',
  'disk_type',
  'firewall',
  'gpu',
  'image',
  'image_source',
  'memory',
  'name',
  'platform',
  'region',
  'remark',
  'zone',
])
const INTEGER_PARAMETERS = new Set(['count', 'cpu', 'max_count', 'quantity'])
const LIST_PARAMETERS = new Set(['data_disk'])
const BOOLEAN_PARAMETERS = new Set(['us3'])
const TEMPLATE_PARAMETERS = new Set([...BOOLEAN_PARAMETERS, ...INTEGER_PARAMETERS, ...LIST_PARAMETERS, ...TEXT_PARAMETERS])

export interface InstanceTemplate {
  name: string
  description: string
  parameters: Record<string, unknown>
  created_at: string
  updated_at: string
}

// 模板文件路径: 配置目录下 instance-templates.json, 可用环境变量覆盖
export function templatePath(configDir: string): string {
  return process.env.COMPSHARE_TEMPLATE_FILE || join(configDir, 'instance-templates.json')
}

// 生成秒级精度的 UTC 时间戳文本
function timestampText(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// 校验并归一化模板参数
function validatedParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const unknown = Object.keys(parameters)
    .filter((key) => !TEMPLATE_PARAMETERS.has(key))
    .sort()
  if (unknown.length > 0) {
    throw new ConfigError(`未知的实例模板参数: ${unknown.join(', ')}`)
  }
  const validated: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) {
      continue
    }
    if (TEXT_PARAMETERS.has(key)) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new ConfigError(`实例模板参数 ${key} 必须是非空字符串。`)
      }
      validated[key] = value
    } else if (INTEGER_PARAMETERS.has(key)) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new ConfigError(`实例模板参数 ${key} 必须是正整数。`)
      }
      validated[key] = value
    } else if (LIST_PARAMETERS.has(key)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
        throw new ConfigError(`实例模板参数 ${key} 必须是字符串列表。`)
      }
      validated[key] = [...value]
    } else if (BOOLEAN_PARAMETERS.has(key)) {
      if (typeof value !== 'boolean') {
        throw new ConfigError(`实例模板参数 ${key} 必须是布尔值。`)
      }
      validated[key] = value
    }
  }
  return validated
}

export class InstanceTemplateStore {
  private readonly path: string

  constructor(path: string) {
    this.path = path
  }

  // #region 读取

  // 列出全部模板(按名称排序)
  list(): InstanceTemplate[] {
    const templates = this.read().templates
    return Object.keys(templates)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((name) => ({...templates[name]}))
  }

  // 获取单个模板(不存在时报错)
  get(name: string): InstanceTemplate {
    const template = this.read().templates[name]
    if (!template) {
      throw new UsageError(`实例模板不存在: ${name}`)
    }
    return {...template}
  }

  // #endregion

  // #region 写入

  // 保存模板(默认不允许覆盖)
  save(
    name: string,
    parameters: Record<string, unknown>,
    options: {description?: string; overwrite?: boolean} = {},
  ): InstanceTemplate {
    if (!name.trim()) {
      throw new UsageError('实例模板名称不能为空。')
    }
    const clean = validatedParameters(parameters)
    if (Object.keys(clean).length === 0) {
      throw new UsageError('请至少指定一个实例模板参数。')
    }
    if (options.description !== undefined && typeof options.description !== 'string') {
      throw new UsageError('实例模板描述必须是字符串。')
    }

    const data = this.read()
    const existing = data.templates[name]
    if (existing && !options.overwrite) {
      throw new UsageError(`实例模板已存在: ${name}。请使用 --force 覆盖。`)
    }
    const now = timestampText()
    const template: InstanceTemplate = {
      name,
      description: options.description ?? existing?.description ?? '',
      parameters: clean,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    data.templates[name] = template
    this.write(data)
    return {...template}
  }

  // 删除模板(不存在时报错)
  delete(name: string): void {
    const data = this.read()
    if (!(name in data.templates)) {
      throw new UsageError(`实例模板不存在: ${name}`)
    }
    delete data.templates[name]
    this.write(data)
  }

  // #endregion

  // #region 文件读写(解析失败会抛出配置错误, 因为模板内容影响创建行为)

  private read(): {schema_version: number; templates: Record<string, InstanceTemplate>} {
    if (!existsSync(this.path)) {
      return {schema_version: TEMPLATE_SCHEMA_VERSION, templates: {}}
    }
    let data: unknown
    try {
      data = JSON.parse(readFileSync(this.path, 'utf8'))
    } catch (error) {
      throw new ConfigError(`无法读取实例模板文件 ${this.path}: ${String(error)}`)
    }
    if (typeof data !== 'object' || data === null) {
      throw new ConfigError(`实例模板文件格式无效: ${this.path}`)
    }
    const record = data as {schema_version?: unknown; templates?: unknown}
    if (record.schema_version !== TEMPLATE_SCHEMA_VERSION) {
      throw new ConfigError(`实例模板文件版本不支持: ${String(record.schema_version)}`)
    }
    if (typeof record.templates !== 'object' || record.templates === null) {
      throw new ConfigError(`实例模板文件格式无效: ${this.path}`)
    }
    const normalized: Record<string, InstanceTemplate> = {}
    for (const [name, raw] of Object.entries(record.templates as Record<string, unknown>)) {
      if (!name.trim() || typeof raw !== 'object' || raw === null) {
        throw new ConfigError(`实例模板文件格式无效: ${this.path}`)
      }
      const entry = raw as {created_at?: unknown; description?: unknown; parameters?: unknown; updated_at?: unknown}
      if (typeof entry.parameters !== 'object' || entry.parameters === null) {
        throw new ConfigError(`实例模板 ${name} 格式无效: ${this.path}`)
      }
      normalized[name] = {
        name,
        description: typeof entry.description === 'string' ? entry.description : '',
        parameters: validatedParameters(entry.parameters as Record<string, unknown>),
        created_at: String(entry.created_at ?? ''),
        updated_at: String(entry.updated_at ?? ''),
      }
    }
    return {schema_version: TEMPLATE_SCHEMA_VERSION, templates: normalized}
  }

  private write(data: {schema_version: number; templates: Record<string, InstanceTemplate>}): void {
    let temporary = ''
    try {
      mkdirSync(dirname(this.path), {recursive: true})
      // 临时文件与目标同目录, 保证 rename 原子生效; Windows 文件名不允许冒号, 不能拼入完整路径
      temporary = join(dirname(this.path), `.${basename(this.path)}.${Date.now()}.tmp`)
      writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, {encoding: 'utf8', mode: 0o600})
      renameSync(temporary, this.path)
      chmodSync(this.path, 0o600)
    } catch (error) {
      if (temporary) {
        try {
          unlinkSync(temporary)
        } catch {
          // 清理失败则忽略
        }
      }
      throw new ConfigError(`无法写入实例模板文件 ${this.path}: ${String(error)}`)
    }
  }

  // #endregion
}
