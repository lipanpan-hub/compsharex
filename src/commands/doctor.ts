// cps doctor: 只读的环境、凭证、API 与 OpenSSH 诊断(移植自 commands/doctor.py)

import {createRequire} from 'node:module'
import {existsSync, statSync} from 'node:fs'
import {delimiter, dirname, join} from 'node:path'
import {platform} from 'node:os'

import {callCaptured} from '../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../lib/compshare/base.js'
import {ToolConfigManager} from '../lib/config/config.js'

// 诊断结果行
interface DiagnosticCheck {
  Check: string
  Status: 'Success' | 'Failed' | 'Warning'
  Detail: string
}

function check(name: string, status: DiagnosticCheck['Status'], detail: string): DiagnosticCheck {
  return {Check: name, Status: status, Detail: detail}
}

// 在 PATH 中查找可执行文件(对齐 Python shutil.which)
function whichSync(executable: string): string | null {
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  const directories = (process.env.PATH ?? '').split(delimiter)
  for (const directory of directories) {
    if (!directory) {
      continue
    }
    for (const extension of extensions) {
      const candidate = join(directory, `${executable}${extension.toLowerCase()}`)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return null
}

export default class Doctor extends CompshareBaseCommand {
  static aliases = ['doc']
  static description = '运行安装、凭证、API 与 OpenSSH 只读诊断'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    await this.parse(Doctor)
    const context = this.compshareContext()
    const checks: DiagnosticCheck[] = []

    // #region Node 版本与 SDK 检查
    const nodeMajor = Number(process.versions.node.split('.')[0])
    checks.push(
      check(
        'Node',
        nodeMajor >= 18 ? 'Success' : 'Failed',
        nodeMajor >= 18
          ? `版本 ${process.versions.node}; 满足最低要求 18。`
          : `版本 ${process.versions.node}; 需要 Node 18 或更新版本。`,
      ),
    )
    let sdkVersion: string
    try {
      const require = createRequire(import.meta.url)
      sdkVersion = require('@ucloud-sdks/ucloud-sdk-js/package.json').version as string
    } catch {
      sdkVersion = '未安装'
    }
    checks.push(check('SDK', sdkVersion === '未安装' ? 'Failed' : 'Success', sdkVersion))
    // #endregion

    // #region 凭证档案检查
    let profileLoaded = false
    let profileError: string | null = null
    try {
      // 仅触发档案加载以校验凭证
      profileLoaded = context.profile.name.length > 0
    } catch (error) {
      profileError = String(error instanceof Error ? error.message : error)
    }
    checks.push(
      check(
        'Credentials',
        profileLoaded ? 'Success' : 'Failed',
        profileLoaded ? '凭证档案加载成功' : profileError ?? '未知错误',
      ),
    )
    // #endregion

    // #region 配置文件权限检查
    const configPath = ToolConfigManager.fromConfigDir(this.config.configDir).getConfigPath()
    if (existsSync(configPath) && platform() === 'win32') {
      checks.push(check('Permissions', 'Warning', `配置 ${configPath}: 由 Windows ACL 管控, 跳过 POSIX 权限检查。`))
    } else if (existsSync(configPath)) {
      const fileMode = statSync(configPath).mode & 0o777
      const directoryMode = statSync(dirname(configPath)).mode & 0o777
      const permissionsOk = (fileMode & 0o077) === 0 && (directoryMode & 0o077) === 0
      checks.push(
        check(
          'Permissions',
          permissionsOk ? 'Success' : 'Failed',
          `配置 ${configPath}: 文件 ${fileMode.toString(8)}, 目录 ${directoryMode.toString(8)}`,
        ),
      )
    } else {
      checks.push(check('Permissions', 'Failed', `配置文件不存在: ${configPath}`))
    }
    // #endregion

    // #region API 连通性检查
    if (profileLoaded) {
      const [response, error] = await callCaptured(context, 'DescribeCompShareSupportZone', {})
      if (error) {
        checks.push(check('API', 'Failed', String(error.message)))
      } else {
        const zoneCount = ((response?.ZoneInfo as unknown[]) ?? []).length
        checks.push(check('API', 'Success', `连接成功; 返回 ${zoneCount} 个可用区。`))
      }
    } else {
      checks.push(check('API', 'Failed', '因凭证不可用而跳过'))
    }
    // #endregion

    // #region OpenSSH 工具检查
    for (const executable of ['ssh', 'scp']) {
      const path = whichSync(executable)
      checks.push(
        check(executable, path ? 'Success' : 'Warning', path ?? '未安装; 远程访问命令可能不可用'),
      )
    }
    // #endregion

    const isOk = !checks.some((item) => item.Status === 'Failed')
    const payload: Record<string, unknown> = {ok: isOk, checks}
    if (!isOk) {
      payload.error = {code: 'diagnostic_failed', message: '一个或多个诊断检查未通过。'}
    }
    context.renderer.data(payload, {
      rows: checks as unknown as Array<Record<string, unknown>>,
      columns: [
        ['Check', 'CHECK'],
        ['Status', 'STATUS'],
        ['Detail', 'DETAIL'],
      ],
    })
    if (!isOk) {
      process.exitCode = 1
    }
  }
}
