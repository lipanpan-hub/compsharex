// cps instance ssh: 打开或打印实例 SSH 连接命令(移植自 instance.py 的 ssh 命令)

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {SilentExit, UsageError} from '../../lib/compshare/errors.js'
import {sshCacheNamespace, waitForInstance} from '../../lib/compshare/instance-helpers.js'
import {decodePassword, shlexJoin} from '../../lib/compshare/parsing.js'
import {Renderer} from '../../lib/compshare/output.js'
import {joinedCommand} from '../../lib/compshare/remote-jobs.js'
import {SSHCredentialCache, sshCachePath, DEFAULT_TTL} from '../../lib/compshare/ssh-cache.js'
import {
  connectWithPassword,
  executeCaptured,
  executeCapturedWithPassword,
  executeWithPassword,
  PasswordAutomationUnavailable,
  runCommand,
  sshLoginCommand,
} from '../../lib/compshare/ssh-exec.js'
import {locateSshInstance} from '../../lib/compshare/ssh-remote.js'

export default class InstanceSsh extends CompshareBaseCommand {
  static description = '打开或打印实例 SSH 连接命令'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> -- ls -la']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    remoteCommand: Args.string({multiple: true, description: '远程命令及参数, 使用 -- 分隔选项'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    print: Flags.boolean({default: false, description: '仅打印连接命令, 不执行'}),
    'auto-password': Flags.boolean({
      allowNo: true,
      default: true,
      description: '自动输入 API 返回的密码',
    }),
    wait: Flags.boolean({allowNo: true, default: true, description: '连接前等待实例进入运行状态'}),
    timeout: Flags.integer({default: 600, description: '最长等待秒数'}),
    'connect-timeout': Flags.integer({default: 30, description: 'SSH 连接超时秒数'}),
    cache: Flags.boolean({allowNo: true, default: true, description: '缓存 SSH 连接信息'}),
    'cache-ttl': Flags.integer({default: DEFAULT_TTL, description: 'SSH 连接缓存有效期(秒)'}),
    refresh: Flags.boolean({default: false, description: '连接前强制从 API 刷新连接信息'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceSsh)
    const context = this.compshareContext()
    const instance = args.instance
    // variadic args 运行时是 string[], 静态类型为 string, 需要断言
    const remoteCommand = args.remoteCommand as unknown as string[] | undefined
    const hasRemoteCommand = Boolean(remoteCommand && remoteCommand.length > 0)
    const useCache = flags.cache
    const cache = new SSHCredentialCache(sshCachePath(context.configDirectory))
    const profile = sshCacheNamespace(context)

    // #region 定位实例(未运行时按需等待并刷新缓存)

    let [region, , host, credentialSource] = await locateSshInstance(context, instance, {
      useCache,
      refresh: flags.refresh,
      cacheTtl: flags['cache-ttl'],
    })
    if (flags.wait && host.State && String(host.State) !== 'Running') {
      const ready = await waitForInstance(context, instance, region, {
        desired: new Set(['Running']),
        timeout: flags.timeout,
      })
      const hosts = (ready.UHostSet as Array<Record<string, unknown>>) ?? []
      if (hosts.length > 0) {
        host = hosts[0] as Record<string, unknown>
        if (useCache) {
          cache.put(profile, instance, host)
        }
      }
    }

    // #endregion

    // #region 构建连接命令

    const loginCommand = host.SshLoginCommand
    const rawPassword = host.Password
    const password =
      rawPassword !== undefined && rawPassword !== null ? decodePassword(String(rawPassword)) : undefined
    if (!loginCommand) {
      throw new UsageError(`实例 ${instance} 没有 SSH 登录命令。`)
    }
    const argv = sshLoginCommand(String(loginCommand), flags['connect-timeout'])
    if (hasRemoteCommand) {
      argv.push(joinedCommand(remoteCommand as string[]))
    }

    // #endregion

    // #region 仅打印或 JSON 模式无远程命令: 输出连接命令文档

    if (flags.print || (context.jsonOutput && !hasRemoteCommand)) {
      context.renderer.data({
        instance,
        command: shlexJoin(argv),
        password,
        credential_source: credentialSource,
      })
      return
    }

    // #endregion

    // #region JSON 模式执行远程命令: 捕获输出并结构化返回

    if (hasRemoteCommand && context.jsonOutput) {
      const execution =
        password && flags['auto-password']
          ? executeCapturedWithPassword(argv, password as string)
          : executeCaptured(argv)
      let error: Record<string, unknown> | null = null
      if (execution.exitCode !== 0) {
        const message = execution.stderr.trim() || `SSH 以状态码 ${execution.exitCode} 退出。`
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
        credential_source: credentialSource,
      })
      throw new SilentExit(execution.exitCode)
    }

    // #endregion

    // #region 人类模式: 优先自动输入密码, 失败降级标准 SSH

    if (password && context.showSensitive) {
      process.stdout.write(`Password: ${password}\n`)
    }
    if (password && flags['auto-password']) {
      try {
        const exitCode = hasRemoteCommand
          ? executeWithPassword(argv, password)
          : connectWithPassword(argv, password)
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
        process.stderr.write('当前终端无法自动输入密码, 改用标准 SSH 继续。\n')
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
