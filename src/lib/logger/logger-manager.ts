import {
  type Bindings,
  type DestinationStream,
  levels,
  type Logger,
  pino,
  transport,
  type TransportTargetOptions,
} from 'pino'

import {ChildLoggerLevelResolver} from './child-logger-level-resolver.js'
import {type LoggerConfig, LoggerConfigLoader, type LogLevel} from './logger-config.js'
import {TransportFactory} from './transport-factory.js'

// transport 关闭兜底超时, 避免 mongodb 连不上时进程挂住
const SHUTDOWN_TIMEOUT_MS = 2000

type ClosableStream = DestinationStream & {
  end(): void
  on(event: string, listener: () => void): void
}

export class LoggerManager {
  private static singleton: LoggerManager | undefined
  private childLevelResolver: ChildLoggerLevelResolver | undefined
  private loadedConfig: LoggerConfig | undefined
  private rootLogger: Logger | undefined
  private transportStream: ClosableStream | undefined

  private static resolveRootLevel(targets: TransportTargetOptions[]): LogLevel {
    // 根 level 必须取所有 target 中最宽松的一档, 否则低级别日志到不了 transport
    const levelValues = targets
      .map((target) => levels.values[String(target.level)])
      .filter((value): value is number => typeof value === 'number')

    if (levelValues.length === 0) return 'info'
    return (levels.labels[Math.min(...levelValues)] ?? 'info') as LogLevel
  }

  get config(): LoggerConfig | undefined {
    return this.loadedConfig
  }

  static get instance(): LoggerManager {
    LoggerManager.singleton ??= new LoggerManager()
    return LoggerManager.singleton
  }

  get isInitialized(): boolean {
    return this.rootLogger !== undefined
  }

  createChildLogger(scope: string, bindings: Bindings = {}): Logger {
    // 基于根 logger 派生子 logger, 复用同一条 transport 通道
    if (!this.rootLogger) {
      throw new Error('LoggerManager 尚未初始化, 请先调用 init(configDir)')
    }

    // child(bindings) 的参数是"绑定字段": 对象里的每个键值会被固定附加到该 logger 输出的每条日志上
    // scope 标识日志来源(pino-pretty 用它拼成 '[scope] msg'), 展开的 bindings 是调用方额外的上下文字段
    // 第二参数按 scope 匹配白名单单独给这个 child 设 level, 未命中的 child 为 silent
    const level = this.childLevelResolver?.resolve(scope) ?? 'silent'
    return this.rootLogger.child({scope, ...bindings}, {level})
  }

  init(configDir: string): Logger {
    // 幂等: 一个进程只构建一次 transport 通道
    if (this.rootLogger) return this.rootLogger

    // 加载 transport 配置多级覆盖 用户配置覆盖默认配置 环境变量配置覆盖用户配置 
    const config = LoggerConfigLoader.load(configDir)
    const targets = new TransportFactory(config, configDir).createTargets()
    this.loadedConfig = config

    // env 存在时作为强制级别覆盖所有 child, 与 transport 的 SPIDER_LOG_LEVEL 覆盖保持一致
    const forcedLevel = process.env.SPIDER_LOG_LEVEL as LogLevel | undefined
    this.childLevelResolver = new ChildLoggerLevelResolver(config.childLoggerLevels, forcedLevel)

    if (targets.length === 0) {
      // 三个开关全关时不建 transport, 直接静默
      this.rootLogger = pino({level: 'silent'})
      return this.rootLogger
    }

    const stream = transport({dedupe: false, targets}) as ClosableStream
    this.transportStream = stream
    this.rootLogger = pino({level: LoggerManager.resolveRootLevel(targets)}, stream)
    return this.rootLogger
  }

  async shutdown(): Promise<void> {
    const stream = this.transportStream
    this.childLevelResolver = undefined
    this.loadedConfig = undefined
    this.rootLogger = undefined
    this.transportStream = undefined
    LoggerManager.singleton = undefined
    if (!stream) return

    // 等 worker 线程把缓冲写完再退出, 否则短命 CLI 进程会丢日志
    // thread-stream 的 end() 只 emit finish, close 不一定来, 两个事件都监听
    await new Promise<void>((resolve) => {
      let isSettled = false
      const finish = (timer: NodeJS.Timeout) => {
        if (isSettled) return
        isSettled = true
        clearTimeout(timer)
        resolve()
      }

      const timer = setTimeout(() => finish(timer), SHUTDOWN_TIMEOUT_MS)
      stream.on('close', () => finish(timer))
      stream.on('finish', () => finish(timer))
      stream.end()
    })
  }
}
