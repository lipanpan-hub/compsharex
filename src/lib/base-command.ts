import {Command} from '@oclif/core'
import {type Bindings, type Logger} from 'pino'

import {LoggerManager} from './logger/index.js'

export abstract class BaseCommand extends Command {
  // 子类直接用 this.logger 记日志, scope 自动带上命令 id
  protected logger!: Logger

  protected async catch(error: Error & {exitCode?: number}): Promise<unknown> {
    // this.logger?.error({err: error}, `命令执行失败: ${error.message}`)
    return super.catch(error)
  }

  // 命令内部需要更细粒度的 scope 时用它派生, 例如 this.createLogger('downloader')
  protected createLogger(scope: string, bindings: Bindings = {}): Logger {
    return LoggerManager.instance.createChildLogger(`${this.id ?? this.constructor.name}:${scope}`, bindings)
  }

  protected async finally(error: Error | undefined): Promise<unknown> {
    // 退出前必须等 transport worker 落盘, 否则短命进程会丢日志
    await LoggerManager.instance.shutdown()
    return super.finally(error)
  }

  async init(): Promise<void> {
    await super.init()

    LoggerManager.instance.init(this.config.configDir)
    this.logger = LoggerManager.instance.createChildLogger(this.id ?? this.constructor.name)
    this.logger.debug({argv: this.argv}, '命令开始执行')
  }
}
