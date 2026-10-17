// cps instance cp: 在本地与实例之间复制文件或目录(移植自 instance.py 的 cp 命令)

import {existsSync, statSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join, resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {SilentExit, UsageError} from '../../lib/compshare/errors.js'
import {sshCacheNamespace} from '../../lib/compshare/instance-helpers.js'
import {decodePassword, shlexJoin} from '../../lib/compshare/parsing.js'
import {Renderer} from '../../lib/compshare/output.js'
import {SSHCredentialCache, sshCachePath, DEFAULT_TTL} from '../../lib/compshare/ssh-cache.js'
import {
  copyCaptured,
  copyCapturedWithPassword,
  copyWithPassword,
  PasswordAutomationUnavailable,
  runCommand,
  scpDownloadCommand,
  scpUploadCommand,
  sshLoginCommand,
} from '../../lib/compshare/ssh-exec.js'
import {locateSshInstance} from '../../lib/compshare/ssh-remote.js'

// 展开 ~ 为用户主目录
function expandUser(value: string): string {
  if (value === '~') {
    return homedir()
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(homedir(), value.slice(2))
  }
  return value
}

// 判定路径是否为已存在的目录
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export default class InstanceCp extends CompshareBaseCommand {
  static aliases = ['ins:cp']
  static description = '在本地与实例之间复制文件或目录'
  static examples = [
    '<%= config.bin %> <%= command.id %> <INSTANCE_ID> ./local.txt :/root/remote.txt',
    '<%= config.bin %> <%= command.id %> <INSTANCE_ID> :/root/remote.log ./download.log',
  ]

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    source: Args.string({required: true, description: '源路径, 实例路径以 : 开头'}),
    destination: Args.string({required: true, description: '目标路径, 实例路径以 : 开头'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    print: Flags.boolean({default: false, description: '仅打印复制命令, 不执行'}),
    'auto-password': Flags.boolean({
      allowNo: true,
      default: true,
      description: '自动输入 API 返回的密码',
    }),
    'connect-timeout': Flags.integer({default: 30, description: 'SSH 连接超时秒数'}),
    cache: Flags.boolean({allowNo: true, default: true, description: '缓存 SSH 连接信息'}),
    'cache-ttl': Flags.integer({default: DEFAULT_TTL, description: 'SSH 连接缓存有效期(秒)'}),
    refresh: Flags.boolean({default: false, description: '复制前强制从 API 刷新连接信息'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceCp)
    const context = this.compshareContext()
    const instance = args.instance
    const useCache = flags.cache
    const cache = new SSHCredentialCache(sshCachePath(context.configDirectory))
    const profile = sshCacheNamespace(context)

    // #region 解析本地/远程路径与传输方向

    const sourceIsRemote = args.source.startsWith(':')
    const destinationIsRemote = args.destination.startsWith(':')
    if (sourceIsRemote && destinationIsRemote) {
      throw new UsageError('源路径与目标路径不能同时为实例路径。')
    }
    const direction = sourceIsRemote ? 'download' : 'upload'
    let remotePath: string
    let localPath: string
    if (direction === 'download') {
      remotePath = args.source.slice(1)
      const resolved = resolve(expandUser(args.destination))
      // 目标是已存在目录时复制进该目录, 否则取其父目录做存在性校验
      const localParent = isDirectory(resolved) ? resolved : dirname(resolved)
      if (!existsSync(localParent)) {
        throw new UsageError(`本地目标父目录 ${localParent} 不存在。`)
      }
      localPath = resolved
    } else {
      const sourcePath = expandUser(args.source)
      if (!existsSync(sourcePath)) {
        throw new UsageError(`本地路径 ${args.source} 不存在。`)
      }
      localPath = sourcePath
      remotePath = destinationIsRemote ? args.destination.slice(1) : args.destination
    }
    if (!remotePath) {
      throw new UsageError('远程路径不能为空。')
    }

    // #endregion

    // #region 定位实例并推导 scp 命令

    const host = (await locateSshInstance(context, instance, {
      useCache,
      refresh: flags.refresh,
      cacheTtl: flags['cache-ttl'],
    }))[2]
    const loginCommand = host.SshLoginCommand
    const rawPassword = host.Password
    const password =
      rawPassword !== undefined && rawPassword !== null ? decodePassword(String(rawPassword)) : undefined
    if (!loginCommand) {
      throw new UsageError(`实例 ${instance} 没有 SSH 登录命令。`)
    }
    const sshArgv = sshLoginCommand(String(loginCommand), flags['connect-timeout'])
    let argv: string[]
    try {
      argv =
        direction === 'download'
          ? scpDownloadCommand(sshArgv, remotePath, localPath, {recursive: true})
          : scpUploadCommand(sshArgv, resolve(localPath), remotePath, {recursive: isDirectory(localPath)})
    } catch {
      throw new UsageError('实例的 SSH 登录命令无法用于 SCP。')
    }

    // #endregion

    // #region 仅打印

    if (flags.print) {
      context.renderer.data({instance, command: shlexJoin(argv)})
      return
    }

    // #endregion

    // #region JSON 模式: 捕获传输输出并结构化返回

    if (context.jsonOutput) {
      const execution =
        password && flags['auto-password']
          ? copyCapturedWithPassword(argv, password as string)
          : copyCaptured(argv)
      let error: Record<string, unknown> | null = null
      if (execution.exitCode !== 0) {
        const message = execution.stderr.trim() || `SCP 以状态码 ${execution.exitCode} 退出。`
        error = {phase: execution.phase, code: execution.errorCode, message}
        if (useCache && ['authentication', 'connection', 'ssh'].includes(execution.phase)) {
          cache.delete(profile, instance)
        }
      }
      new Renderer(true, context.showSensitive).data({
        instance,
        ok: execution.exitCode === 0,
        phase: execution.phase,
        exit_code: execution.exitCode,
        stdout: execution.stdout,
        stderr: execution.stderr,
        error,
      })
      throw new SilentExit(execution.exitCode)
    }

    // #endregion

    // #region 人类模式: 优先自动输入密码, 失败降级标准 SCP

    if (password && context.showSensitive) {
      process.stdout.write(`Password: ${password}\n`)
    }
    if (password && flags['auto-password']) {
      try {
        const exitCode = copyWithPassword(argv, password)
        if (exitCode === 255 && useCache) {
          cache.delete(profile, instance)
        }
        throw new SilentExit(exitCode)
      } catch (error) {
        if (error instanceof SilentExit) {
          throw error
        }
        if (!(error instanceof PasswordAutomationUnavailable)) {
          throw error
        }
        process.stderr.write('当前终端无法自动输入密码, 改用标准 SCP 继续。\n')
      }
    }
    if (password && !context.showSensitive) {
      process.stdout.write('密码已隐藏, 使用 --show-sensitive 参数重新运行以显示。\n')
    }
    const exitCode = runCommand(argv)
    if (exitCode === 255 && useCache) {
      cache.delete(profile, instance)
    }
    throw new SilentExit(exitCode)

    // #endregion
  }
}
