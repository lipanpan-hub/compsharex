// 远程 SSH 作业编排(移植自 instance.py 的 _locate_ssh_instance/_remote_job_* 辅助函数)
// 模板方法式骨架: 定位实例(带缓存) → 等待运行 → 拼装连接 → 执行 → 解析记录/清理缓存。

import {CompshareContext} from './context.js'
import {UsageError} from './errors.js'
import {sshCacheNamespace, waitForInstance} from './instance-helpers.js'
import {instanceLocation, locateInstance} from './location.js'
import {decodePassword} from './parsing.js'
import {normalizedRecord, parseRecords, RemoteJobProtocolError, shellCommand} from './remote-jobs.js'
import {DEFAULT_TTL, SSHCredentialCache, sshCachePath} from './ssh-cache.js'
import {executeCaptured, executeCapturedWithPassword, executeWithPassword, runCommand, sshLoginCommand} from './ssh-exec.js'

// 作业列表/清理共用表格列
export const JOB_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['JobId', 'JOB ID'],
  ['Name', 'NAME'],
  ['State', 'STATE'],
  ['PID', 'PID'],
  ['ExitCode', 'EXIT CODE'],
  ['CreatedTime', 'CREATED'],
]

// 构建当前上下文的凭据缓存实例
function sshCache(context: CompshareContext): SSHCredentialCache {
  return new SSHCredentialCache(sshCachePath(context.configDirectory))
}

// 定位 SSH 目标实例(带凭据缓存), 返回 [region, zone, host, 凭据来源(cache/api)]
export async function locateSshInstance(
  context: CompshareContext,
  instance: string,
  options: {cacheTtl?: number; refresh?: boolean; useCache?: boolean;} = {},
): Promise<[string, string, Record<string, unknown>, string]> {
  const useCache = options.useCache ?? true
  const refresh = options.refresh ?? false
  const cacheTtl = options.cacheTtl ?? DEFAULT_TTL
  const cache = sshCache(context)
  const profile = sshCacheNamespace(context)
  if (useCache && !refresh) {
    const cachedHost = cache.get(profile, instance, {ttl: cacheTtl})
    if (cachedHost !== null) {
      const [region, zone] = instanceLocation(cachedHost, instance)
      return [region, zone, cachedHost, 'cache']
    }
  }
  const [region, zone, host] = await locateInstance(context, instance)
  if (useCache) {
    cache.put(profile, instance, host)
  }
  return [region, zone, host, 'api']
}

// #region 远程作业执行骨架

// 构建远程作业连接: 实例未运行时先等待, 返回 [argv, 密码, 凭据来源]
async function remoteJobConnection(
  context: CompshareContext,
  instance: string,
  script: string,
  connectTimeout = 30,
): Promise<[string[], string | undefined, string]> {
  const [region, , host, credentialSource] = await locateSshInstance(context, instance, {
    useCache: true,
    refresh: false,
    cacheTtl: DEFAULT_TTL,
  })
  let currentHost = host
  if (host.State && String(host.State) !== 'Running') {
    const ready = await waitForInstance(context, instance, region, {
      desired: new Set(['Running']),
      timeout: 600,
    })
    const hosts = (ready.UHostSet as Array<Record<string, unknown>>) ?? []
    if (hosts.length > 0) {
      currentHost = hosts[0] as Record<string, unknown>
      sshCache(context).put(sshCacheNamespace(context), instance, currentHost)
    }
  }
  const loginCommand = currentHost.SshLoginCommand
  if (!loginCommand) {
    throw new UsageError(`实例 ${instance} 没有 SSH 登录命令。`)
  }
  const rawPassword = currentHost.Password
  const password = rawPassword !== undefined && rawPassword !== null ? decodePassword(String(rawPassword)) : undefined
  const argv = sshLoginCommand(String(loginCommand), connectTimeout)
  argv.push(shellCommand(script))
  return [argv, password, credentialSource]
}

// 执行远程作业脚本并解析协议记录; 连接/认证类失败会清理 SSH 缓存
export async function remoteJobRecords(
  context: CompshareContext,
  instance: string,
  script: string,
  jobId?: string,
): Promise<Array<Record<string, unknown>>> {
  const [argv, password] = await remoteJobConnection(context, instance, script)
  const execution = password ? executeCapturedWithPassword(argv, password) : executeCaptured(argv)
  let protocolError: RemoteJobProtocolError | null = null
  let records: Array<Record<string, string>> = []
  try {
    records = parseRecords(execution.stdout)
  } catch (error) {
    if (error instanceof RemoteJobProtocolError) {
      protocolError = error
      records = []
    } else {
      throw error
    }
  }

  if (execution.exitCode !== 0) {
    if (['authentication', 'connection', 'ssh'].includes(execution.phase)) {
      sshCache(context).delete(sshCacheNamespace(context), instance)
    }
    let message = protocolError ? protocolError.message : execution.stderr.trim()
    if (!message) {
      message = `SSH 以状态码 ${execution.exitCode} 退出。`
    }
    if (jobId) {
      message = `远程作业 ${jobId} 命令执行失败: ${message}`
    }
    throw new UsageError(message)
  }
  if (protocolError) {
    throw new UsageError(`无法解析远程作业响应: ${protocolError.message}`)
  }
  return records.map((record) => normalizedRecord(record))
}

// 透传模式执行远程作业脚本(用于日志 follow), 返回退出码; 255 清理缓存
export async function remoteJobStream(context: CompshareContext, instance: string, script: string): Promise<number> {
  const [argv, password] = await remoteJobConnection(context, instance, script)
  const exitCode = password ? executeWithPassword(argv, password) : runCommand(argv)
  if (exitCode === 255) {
    sshCache(context).delete(sshCacheNamespace(context), instance)
  }
  return exitCode
}

// 取记录列表中的第一条作业记录
export function singleJobRecord(records: Array<Record<string, unknown>>, jobId: string): Record<string, unknown> {
  if (records.length === 0) {
    throw new UsageError(`远程作业 ${jobId} 未返回状态。`)
  }
  return records[0] as Record<string, unknown>
}

// #endregion
