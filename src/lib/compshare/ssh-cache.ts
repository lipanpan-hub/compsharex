// SSH 连接凭据短缓存(移植自 compshare_cli/ssh_cache.py)
// 以 档案:公钥指纹 + 实例ID 为键缓存 API 返回的连接信息, 避免连续 SSH 操作重复查询库存;
// 缓存只是优化, 任何读写失败都必须静默降级, 不能影响 SSH 连接本身。

import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'

export const DEFAULT_TTL = 3600

const CACHE_VERSION = 1
const DPAPI_PREFIX = 'dpapi:'

// 缓存仅保留 SSH 连接必需的字段
const CACHED_HOST_FIELDS = ['Password', 'Region', 'SshLoginCommand', 'State', 'UHostId', 'Zone'] as const

// #region Windows DPAPI 保护(通过 PowerShell 调用 ProtectedData, 输入输出均为 base64)

const PROTECT_SCRIPT =
  `$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;` +
  `$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());` +
  `$enc=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);` +
  `[Console]::Out.Write([Convert]::ToBase64String($enc))`

const UNPROTECT_SCRIPT =
  `$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;` +
  `$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());` +
  `$raw=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);` +
  `[Console]::Out.Write([Convert]::ToBase64String($raw))`

// 调用 PowerShell 执行 DPAPI 脚本, 返回 base64 输出
function runDpapi(script: string, base64Input: string): string | undefined {
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: base64Input,
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    })
    if (result.status !== 0) {
      return undefined
    }
    const output = (result.stdout ?? '').trim()
    if (!output || !/^[A-Za-z0-9+/]+={0,2}$/.test(output)) {
      return undefined
    }
    return output
  } catch {
    return undefined
  }
}

// 保护密码: Windows 上用 DPAPI, 其他平台原样返回(与 Python 版一致)
function protectPassword(password: string): string | undefined {
  if (process.platform !== 'win32') {
    return password
  }
  const payload = Buffer.from(password, 'utf8').toString('base64')
  const encrypted = runDpapi(PROTECT_SCRIPT, payload)
  return encrypted ? `${DPAPI_PREFIX}${encrypted}` : undefined
}

// 还原密码: 不支持的格式或解密失败时返回 undefined
function unprotectPassword(value: string): string | undefined {
  if (process.platform !== 'win32') {
    return value
  }
  if (!value.startsWith(DPAPI_PREFIX)) {
    return undefined
  }
  const decrypted = runDpapi(UNPROTECT_SCRIPT, value.slice(DPAPI_PREFIX.length))
  return decrypted ? Buffer.from(decrypted, 'base64').toString('utf8') : undefined
}

// #endregion

// 生成缓存档案命名空间: 档案名 + API 公钥指纹
export function sshCacheProfile(profileName: string, accessKeyId: string): string {
  const credential = createHash('sha256').update(accessKeyId, 'utf8').digest('hex').slice(0, 16)
  return `${profileName}:${credential}`
}

// 缓存文件路径: 配置目录下 ssh-cache.json, 可用环境变量覆盖
export function sshCachePath(configDir: string): string {
  return process.env.COMPSHARE_SSH_CACHE_FILE || join(configDir, 'ssh-cache.json')
}

export class SSHCredentialCache {
  private readonly cachePath: string

  constructor(cachePath: string) {
    this.cachePath = cachePath
  }

  // #region 读写接口

  // 读取缓存(过期/缺字段即视为未命中)
  get(profile: string, instance: string, options: {now?: number; ttl?: number;} = {}): Record<string, unknown> | null {
    const ttl = options.ttl ?? DEFAULT_TTL
    if (ttl <= 0) {
      return null
    }
    const raw = this.read().entries[this.cacheKey(profile, instance)]
    if (typeof raw !== 'object' || raw === null) {
      return null
    }
    const record = raw as {cached_at?: unknown; host?: unknown}
    const cachedAt = record.cached_at
    const host = record.host
    const current = options.now ?? Date.now() / 1000
    if (typeof cachedAt !== 'number' || current - cachedAt < 0 || current - cachedAt > ttl) {
      return null
    }
    if (typeof host !== 'object' || host === null) {
      return null
    }
    const source = host as Record<string, unknown>
    for (const field of ['Region', 'Zone', 'SshLoginCommand'] as const) {
      if (typeof source[field] !== 'string' || !(source[field] as string).trim()) {
        return null
      }
    }
    const result: Record<string, unknown> = {...source}
    const password = result.Password
    if (password !== undefined && password !== null && typeof password !== 'string') {
      return null
    }
    if (typeof password === 'string') {
      const clear = unprotectPassword(password)
      if (clear === undefined) {
        return null
      }
      result.Password = clear
    }
    return result
  }

  // 写入缓存(缺 SshLoginCommand 时不缓存)
  put(profile: string, instance: string, host: Record<string, unknown>, options: {now?: number} = {}): void {
    const cachedHost: Record<string, unknown> = {}
    for (const field of CACHED_HOST_FIELDS) {
      if (host[field] !== undefined && host[field] !== null) {
        cachedHost[field] = host[field]
      }
    }
    if (!cachedHost.SshLoginCommand) {
      return
    }
    const password = cachedHost.Password
    if (typeof password === 'string') {
      const protectedValue = protectPassword(password)
      if (protectedValue === undefined) {
        return
      }
      cachedHost.Password = protectedValue
    }
    const data = this.read()
    data.entries[this.cacheKey(profile, instance)] = {
      cached_at: options.now ?? Date.now() / 1000,
      host: cachedHost,
    }
    this.write(data)
  }

  // 删除指定缓存条目
  delete(profile: string, instance: string): void {
    const data = this.read()
    const key = this.cacheKey(profile, instance)
    if (!(key in data.entries)) {
      return
    }
    delete data.entries[key]
    this.write(data)
  }

  // #endregion

  private cacheKey(profile: string, instance: string): string {
    return `${profile}\0${instance}`
  }

  // #region 文件读写(失败一律静默)

  private read(): {entries: Record<string, unknown>; version: number;} {
    const empty = {version: CACHE_VERSION, entries: {} as Record<string, unknown>}
    let content: string
    try {
      content = readFileSync(this.cachePath, 'utf8')
    } catch {
      return empty
    }
    try {
      const data = JSON.parse(content) as unknown
      if (typeof data !== 'object' || data === null) {
        return empty
      }
      const record = data as {entries?: unknown; version?: unknown;}
      if (record.version !== CACHE_VERSION || typeof record.entries !== 'object' || record.entries === null) {
        return empty
      }
      return {version: CACHE_VERSION, entries: record.entries as Record<string, unknown>}
    } catch {
      return empty
    }
  }

  private write(data: {entries: Record<string, unknown>; version: number;}): void {
    let temporary = ''
    try {
      mkdirSync(dirname(this.cachePath), {recursive: true})
      // 临时文件与目标同目录, 保证 rename 原子生效; Windows 文件名不允许冒号, 不能拼入完整路径
      temporary = join(dirname(this.cachePath), `.${basename(this.cachePath)}.${Date.now()}.tmp`)
      writeFileSync(temporary, `${JSON.stringify(data)}\n`, {encoding: 'utf8', mode: 0o600})
      renameSync(temporary, this.cachePath)
      chmodSync(this.cachePath, 0o600)
    } catch {
      if (temporary) {
        try {
          unlinkSync(temporary)
        } catch {
          // 清理失败同样忽略
        }
      }
    }
  }

  // #endregion
}
