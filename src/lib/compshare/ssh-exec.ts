// 本机 ssh/scp 执行器(移植自 compshare_cli/ssh.py)
// 策略模式: 标准透传 / BatchMode 捕获 / askpass 密码注入三种执行策略,
// 密码自动化依赖 OpenSSH 的 SSH_ASKPASS 机制(askpass 脚本按平台临时生成, 用完即删)。

import {spawnSync} from 'node:child_process'
import {chmodSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {basename, join} from 'node:path'
import {tmpdir} from 'node:os'

import {CLIError, UsageError} from './errors.js'
import {shlexSplit} from './parsing.js'

// #region 常量与结果类型

// 传给 askpass 脚本的密码文件环境变量
const ASKPASS_PASSWORD_FILE_ENV = 'COMPSHARE_INTERNAL_SSH_PASSWORD_FILE'

// 需要取值的 SSH 选项集合(用于从登录命令推导 scp 参数)
const SSH_OPTIONS_WITH_VALUE = new Set([
  '-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J',
  '-L', '-l', '-m', '-O', '-o', '-P', '-p', '-R', '-S', '-W', '-w',
])

// ssh/scp 共享的选项集合
const SCP_SHARED_OPTIONS = new Set(['-c', '-F', '-i', '-J', '-o'])

// 捕获的远程执行结果与错误分类
export interface RemoteExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  // 错误阶段: completed/remote_command/connection/authentication/ssh/file_transfer
  phase: string
  errorCode?: string
}

// 统一的进程运行结果
interface RunOutcome {
  exitCode: number
  stdout: string
  stderr: string
}

// 当前终端无法安全自动化 SSH 密码输入(命令层捕获后降级标准 SSH)
export class PasswordAutomationUnavailable extends CLIError {}

// #endregion

// #region 登录命令与 scp 命令推导

// 校验 API 登录命令并注入连接超时, 返回可执行的 argv
export function sshLoginCommand(command: string, connectTimeout = 30): string[] {
  let argv: string[]
  try {
    argv = shlexSplit(command)
    scpConnection(argv)
  } catch {
    throw new UsageError('实例的 SSH 登录命令无效。')
  }
  argv.splice(1, 0, '-o', `ConnectTimeout=${connectTimeout}`)
  return argv
}

// 把 API 提供的 SSH 登录命令转换为 SCP 上传命令
export function scpUploadCommand(
  sshArgv: string[],
  localPath: string,
  remotePath: string,
  options: {recursive?: boolean} = {},
): string[] {
  const [scpOptions, destination] = scpConnection(sshArgv)
  if (options.recursive) {
    scpOptions.push('-r')
  }
  return ['scp', ...scpOptions, `${destination}:${remotePath}`, localPath]
}

// 把 API 提供的 SSH 登录命令转换为 SCP 下载命令(默认递归)
export function scpDownloadCommand(
  sshArgv: string[],
  remotePath: string,
  localPath: string,
  options: {recursive?: boolean} = {},
): string[] {
  const recursive = options.recursive ?? true
  const [scpOptions, destination] = scpConnection(sshArgv)
  if (recursive) {
    scpOptions.push('-r')
  }
  return ['scp', ...scpOptions, `${destination}:${remotePath}`, localPath]
}

// 从 SSH 登录命令提取 scp 兼容选项与目标地址(移植 _scp_connection)
function scpConnection(sshArgv: string[]): [string[], string] {
  if (sshArgv.length === 0 || !isSshExecutable(sshArgv[0])) {
    throw new Error('unsupported SSH executable')
  }
  let destination: string | undefined
  let login: string | undefined
  const scpOptions: string[] = []
  let index = 1
  while (index < sshArgv.length) {
    const token = sshArgv[index] as string
    if (token === '--') {
      index += 1
      continue
    }
    const option = token.startsWith('-') && token.length > 1 ? token.slice(0, 2) : undefined
    if (option !== undefined && SSH_OPTIONS_WITH_VALUE.has(option)) {
      let value: string
      if (token.length > 2) {
        value = token.slice(2)
      } else {
        index += 1
        if (index >= sshArgv.length) {
          throw new Error(`missing value for SSH option ${option}`)
        }
        value = sshArgv[index] as string
      }
      if (option === '-p') {
        // scp 的端口选项是大写 -P
        scpOptions.push('-P', value)
      } else if (option === '-l') {
        login = value
      } else if (SCP_SHARED_OPTIONS.has(option)) {
        scpOptions.push(option, value)
      }
    } else if (token.startsWith('-')) {
      // 无值短选项中只有 4/6/C/q/v 对 scp 有意义
      const flagChars = token.slice(1)
      if (flagChars && [...flagChars].every((character) => '46Cqv'.includes(character))) {
        scpOptions.push(token)
      }
    } else if (destination === undefined) {
      destination = token
    } else {
      throw new Error('SSH login command contains a remote command')
    }
    index += 1
  }
  if (!destination) {
    throw new Error('SSH login command has no destination')
  }
  if (destination.startsWith('ssh://')) {
    const parsed = new URL(destination)
    // URI 形式只接受纯主机(可带用户/端口), 不允许路径/查询/片段
    if (!parsed.hostname || (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
      throw new Error('invalid SSH destination URI')
    }
    destination = parsed.hostname
    login = login || parsed.username || undefined
    if (parsed.port && !scpOptions.includes('-P')) {
      scpOptions.push('-P', parsed.port)
    }
  }
  // rpartition('@'): 无 @ 时整体视为主机名
  const atIndex = destination.lastIndexOf('@')
  let username = ''
  let hostname = destination
  if (atIndex !== -1) {
    username = destination.slice(0, atIndex)
    hostname = destination.slice(atIndex + 1)
  }
  // IPv6 字面量主机需用 [] 包裹, 避免与 scp 的 host:path 分隔冲突
  if (hostname.includes(':') && !hostname.startsWith('[')) {
    hostname = `[${hostname}]`
  }
  const effectiveLogin = login || username
  return [scpOptions, effectiveLogin ? `${effectiveLogin}@${hostname}` : hostname]
}

// #endregion

// #region 参数增强策略

// 判定 argv[0] 是否为 ssh 可执行文件
function isSshExecutable(executable: string): boolean {
  const name = basename(executable).toLowerCase()
  return name === 'ssh' || name === 'ssh.exe'
}

// 判定 argv[0] 是否为 scp 可执行文件
function isScpExecutable(executable: string): boolean {
  const name = basename(executable).toLowerCase()
  return name === 'scp' || name === 'scp.exe'
}

// 密码认证参数: 禁用公钥, 只用密码/键盘交互
function passwordAuthentication(argv: string[], options: {commandMode?: boolean} = {}): string[] {
  if (argv.length === 0 || !isSshExecutable(argv[0] as string)) {
    throw new PasswordAutomationUnavailable('SSH 密码自动化仅支持 ssh 命令。')
  }
  const options_: string[] = [
    argv[0] as string,
    '-o', 'PreferredAuthentications=password,keyboard-interactive',
    '-o', 'PubkeyAuthentication=no',
    '-o', 'NumberOfPasswordPrompts=1',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=no',
  ]
  if (options.commandMode) {
    // 非交互执行: 阻止 stdin 读取与伪终端分配
    options_.push('-n', '-T')
  }
  return [...options_, ...argv.slice(1)]
}

// scp 密码认证参数
function scpPasswordAuthentication(argv: string[]): string[] {
  if (argv.length === 0 || !isScpExecutable(argv[0] as string)) {
    throw new PasswordAutomationUnavailable('SCP 密码自动化仅支持 scp 命令。')
  }
  return [
    argv[0] as string,
    '-o', 'PreferredAuthentications=password,keyboard-interactive',
    '-o', 'PubkeyAuthentication=no',
    '-o', 'NumberOfPasswordPrompts=1',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=no',
    ...argv.slice(1),
  ]
}

// #endregion

// #region 执行入口

// 用 API 密码非交互执行远程命令(透传输出), 返回退出码
export function executeWithPassword(argv: string[], password: string): number {
  return runWithAskpass(passwordAuthentication(argv, {commandMode: true}), password, false) as number
}

// 用 API 密码执行并捕获输出(不暴露密码)
export function executeCapturedWithPassword(argv: string[], password: string): RemoteExecutionResult {
  const outcome = runWithAskpass(passwordAuthentication(argv, {commandMode: true}), password, true) as RunOutcome
  return remoteExecutionResult(outcome.exitCode, outcome.stdout, outcome.stderr)
}

// 用本机默认认证(BatchMode)执行并捕获输出
export function executeCaptured(argv: string[]): RemoteExecutionResult {
  if (argv.length === 0 || !isSshExecutable(argv[0] as string)) {
    throw new PasswordAutomationUnavailable('SSH 密码自动化仅支持 ssh 命令。')
  }
  const command = [
    argv[0] as string,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-n', '-T',
    ...argv.slice(1),
  ]
  const outcome = runCommandCaptured(command)
  return remoteExecutionResult(outcome.exitCode, outcome.stdout, outcome.stderr)
}

// 交互式登录并自动应答第一次密码提示
// (与 Python 版 Windows 路径一致, 统一走 SSH_ASKPASS_REQUIRE=force, 依赖 OpenSSH >= 8.4)
export function connectWithPassword(argv: string[], password: string): number {
  return runWithAskpass(passwordAuthentication(argv), password, false) as number
}

// 用 API 密码执行 SCP 传输(透传输出), 返回退出码
export function copyWithPassword(argv: string[], password: string): number {
  return runWithAskpass(scpPasswordAuthentication(argv), password, false) as number
}

// 用 API 密码执行 SCP 并捕获输出
export function copyCapturedWithPassword(argv: string[], password: string): RemoteExecutionResult {
  const outcome = runWithAskpass(scpPasswordAuthentication(argv), password, true) as RunOutcome
  return remoteExecutionResult(outcome.exitCode, outcome.stdout, outcome.stderr, true)
}

// 用本机默认认证(BatchMode)执行 SCP 并捕获输出
export function copyCaptured(argv: string[]): RemoteExecutionResult {
  if (argv.length === 0 || !isScpExecutable(argv[0] as string)) {
    throw new PasswordAutomationUnavailable('SCP 密码自动化仅支持 scp 命令。')
  }
  const command = [
    argv[0] as string,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    ...argv.slice(1),
  ]
  const outcome = runCommandCaptured(command)
  return remoteExecutionResult(outcome.exitCode, outcome.stdout, outcome.stderr, true)
}

// 透传执行(继承当前终端), 返回退出码
export function runCommand(argv: string[], environment?: NodeJS.ProcessEnv): number {
  const result = spawnSync(argv[0] as string, argv.slice(1), {
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) {
    throw new CLIError(`无法运行 ${argv[0]}: ${result.error.message}`)
  }
  return result.status ?? 1
}

// 捕获执行, 输出按 UTF-8 解码(非法序列自动替换)
function runCommandCaptured(argv: string[], environment?: NodeJS.ProcessEnv): RunOutcome {
  const result = spawnSync(argv[0] as string, argv.slice(1), {
    env: environment,
    encoding: 'utf8',
  })
  if (result.error) {
    throw new CLIError(`无法运行 ${argv[0]}: ${result.error.message}`)
  }
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

// #endregion

// #region 错误分类

// 对 OpenSSH 常见失败归类, 保留原始诊断信息
export function remoteExecutionResult(
  exitCode: number,
  stdout: string,
  stderr: string,
  transfer = false,
): RemoteExecutionResult {
  if (exitCode === 0) {
    return {exitCode, stdout, stderr, phase: 'completed'}
  }
  if (exitCode !== 255 && !transfer) {
    // 非 255 退出码说明 ssh 本身成功, 是远端命令失败
    return {exitCode, stdout, stderr, phase: 'remote_command', errorCode: 'remote_exit_nonzero'}
  }
  const diagnostic = stderr.toLowerCase()
  const patterns: Array<[string, string, string]> = [
    ['could not resolve hostname', 'connection', 'dns_resolution_failed'],
    ['name or service not known', 'connection', 'dns_resolution_failed'],
    ['connection timed out', 'connection', 'connection_timeout'],
    ['operation timed out', 'connection', 'connection_timeout'],
    ['no route to host', 'connection', 'network_unreachable'],
    ['network is unreachable', 'connection', 'network_unreachable'],
    ['connection refused', 'connection', 'connection_refused'],
    ['host key verification failed', 'connection', 'host_key_verification_failed'],
    ['permission denied (', 'authentication', 'authentication_failed'],
    ['authentication failed', 'authentication', 'authentication_failed'],
    ['too many authentication failures', 'authentication', 'authentication_failed'],
  ]
  for (const [marker, phase, errorCode] of patterns) {
    if (diagnostic.includes(marker)) {
      return {exitCode, stdout, stderr, phase, errorCode}
    }
  }
  if (exitCode === 255) {
    return {exitCode, stdout, stderr, phase: 'ssh', errorCode: 'ssh_failed'}
  }
  return {exitCode, stdout, stderr, phase: 'file_transfer', errorCode: 'transfer_failed'}
}

// #endregion

// #region askpass 密码注入

// 借助 SSH_ASKPASS 机制运行命令: 密码写入临时文件, askpass 脚本读取后输出
function runWithAskpass(argv: string[], password: string, capture: boolean): RunOutcome | number {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'compshare-ssh-'))
  try {
    const passwordFile = join(temporaryDirectory, 'password')
    writeFileSync(passwordFile, password, {encoding: 'utf8', mode: 0o600})
    const isWindows = process.platform === 'win32'
    const askpassPath = join(temporaryDirectory, isWindows ? 'askpass.cmd' : 'askpass')
    writeFileSync(askpassPath, askpassScript(), {encoding: 'utf8', mode: 0o700})
    if (!isWindows) {
      chmodSync(askpassPath, 0o700)
    }
    const environment: NodeJS.ProcessEnv = {...process.env}
    environment.SSH_ASKPASS = askpassPath
    environment.SSH_ASKPASS_REQUIRE = 'force'
    environment[ASKPASS_PASSWORD_FILE_ENV] = passwordFile
    // POSIX OpenSSH 仅在疑似无 X 环境时启用 askpass, 提供一个 DISPLAY 兜底
    if (!environment.DISPLAY) {
      environment.DISPLAY = 'compshare-ssh'
    }
    return capture ? runCommandCaptured(argv, environment) : runCommand(argv, environment)
  } finally {
    rmSync(temporaryDirectory, {recursive: true, force: true})
  }
}

// 按平台生成 askpass 脚本: 输出密码文件内容并追加换行
function askpassScript(): string {
  if (process.platform === 'win32') {
    // 密码不经过 cmd 变量展开, 由 PowerShell 直接读文件
    return (
      '@powershell.exe -NoProfile -NonInteractive -Command ' +
      '"[Console]::Out.Write((Get-Content -Raw -LiteralPath ' +
      '$env:COMPSHARE_INTERNAL_SSH_PASSWORD_FILE) + [char]10)"\r\n'
    )
  }
  return '#!/bin/sh\ncat "$COMPSHARE_INTERNAL_SSH_PASSWORD_FILE" 2>/dev/null\necho\n'
}

// #endregion
