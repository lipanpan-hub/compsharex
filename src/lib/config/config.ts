import {execSync} from 'node:child_process'
import {existsSync, mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import type {Profile} from './types.js'

import {ConfigManager} from './config-manager.js'

/**
 * vptool 专属配置管理器。
 *
 * 继承通用 {@link ConfigManager} 复用 YAML 读写与多档案编排能力(门面模式),
 * 在此之上承载本项目特有的字段级便捷访问(工作目录 / 下载前缀 / TikHub Token),
 * 并实现模板方法 createDefaultProfile 提供 vptool 的默认档案。
 */
export class ToolConfigManager extends ConfigManager<Profile> {
  /**
   * 基于配置目录构造管理器, 自动拼接 config.yml 文件名。
   *
   * @param configDir - 配置目录(通常为 oclif 的 this.config.configDir)
   */
  static fromConfigDir(configDir: string): ToolConfigManager {
    return new ToolConfigManager(join(configDir, 'config.yml'))
  }

  /**
   * 确保用户工作目录存在并返回其路径, 作为 documentsPath 的默认值。
   *
   * Windows 通过 PowerShell 获取真实 Documents 路径(支持重定向), 失败则降级到
   * `%USERPROFILE%/Documents`; 其余平台使用 `~/Documents`。目录不存在时自动创建。
   */
  static ensureDocumentsDir(): string {
    // #region 解析 Documents 基础路径(区分平台)
    let documentsPath: string
    if (process.platform === 'win32') {
      try {
        const result = execSync('powershell -command "[Environment]::GetFolderPath(\'MyDocuments\')"', {
          encoding: 'utf8',
        })
        documentsPath = result.trim()
      } catch {
        documentsPath = join(process.env.USERPROFILE || homedir(), 'Documents')
      }
    } else {
      documentsPath = join(homedir(), 'Documents')
    }
    // #endregion

    // #region 拼接 tool 子目录并确保存在
    const toolPath = join(documentsPath, 'tool')
    if (!existsSync(toolPath)) {
      try {
        mkdirSync(toolPath, {recursive: true})
        process.stdout.write(`已创建配置目录: ${toolPath}\n`)
      } catch (error) {
        process.stderr.write(`创建配置目录失败: ${error}\n`)
      }
    }

    return toolPath
    // #endregion
  }

  // #region 字段级便捷访问(操作当前档案)

  /**
   * 读取当前档案的工作目录, 未配置时回退到 `ensureDocumentsDir` 默认值。
   */
  getDocumentsPath(): string {
    return this.getCurrentProfile()?.documentsPath || ToolConfigManager.ensureDocumentsDir()
  }

  // #endregion

  // 模板方法实现: 供基类 ensureConfig 调用, 提供 vptool 默认档案
  protected createDefaultProfile(): Profile {
    return this.buildDefaultProfile()
  }

  // 构造一份带默认值的档案, overrides 覆盖对应字段
  private buildDefaultProfile(overrides: Partial<Profile> = {}): Profile {
    return {
      name: 'default',
      documentsPath: ToolConfigManager.ensureDocumentsDir(),
      ...overrides,
    }
  }
}
