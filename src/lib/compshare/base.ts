// CompShare 命令基类(模板方法模式): 统一解析全局 flags 并构建运行时上下文,
// 子命令只需声明业务 flags 与实现 run。

import {Flags} from '@oclif/core'

import {BaseCommand} from '../base-command.js'

import {CompshareContext} from './context.js'
import {SilentExit} from './errors.js'

// 全局输出与档案选项: 所有 compshare 业务命令共享, 子类 flags 必须展开此对象
export const compshareGlobalFlags = {
  json: Flags.boolean({description: '以 JSON 格式输出结果', default: false}),
  'show-sensitive': Flags.boolean({description: '显示敏感字段的明文值', default: false}),
  profile: Flags.string({description: '使用的配置档案名称'}),
}

export abstract class CompshareBaseCommand extends BaseCommand {
  // 全局输出与档案选项
  static flags = compshareGlobalFlags

  protected jsonOutput = false
  protected showSensitive = false
  protected profileName?: string
  private cachedContext?: CompshareContext

  protected async catch(error: Error & {exitCode?: number}): Promise<unknown> {
    // 错误已由 Renderer 分类输出, 这里只设置退出码, 不再重复打印
    if (error instanceof SilentExit) {
      process.exitCode = error.exitCode
      return
    }
    return super.catch(error)
  }

  async init(): Promise<void> {
    await super.init()
    // 无参 parse 默认聚合当前子类的 static flags/args
    const parsed = await this.parse()
    const flags = parsed.flags as {json?: boolean; profile?: string; 'show-sensitive'?: boolean;}
    this.jsonOutput = Boolean(flags.json)
    this.showSensitive = Boolean(flags['show-sensitive'])
    this.profileName = flags.profile
  }

  // 懒构建运行时上下文(配置档案/渲染器/SDK 工厂)
  protected compshareContext(): CompshareContext {
    if (!this.cachedContext) {
      this.cachedContext = new CompshareContext({
        configDir: this.config.configDir,
        jsonOutput: this.jsonOutput,
        showSensitive: this.showSensitive,
        profileName: this.profileName,
      })
    }
    return this.cachedContext
  }
}
