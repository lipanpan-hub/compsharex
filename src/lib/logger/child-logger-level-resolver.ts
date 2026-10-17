import {type LogLevel} from './logger-config.js'

interface CompiledLevelRule {
  level: LogLevel
  pattern: RegExp
}

export class ChildLoggerLevelResolver {
  // 未命中任何正则时的兜底级别: child logger 默认静默
  private static readonly DEFAULT_LEVEL: LogLevel = 'silent'
  private readonly forcedLevel: LogLevel | undefined
  private readonly rules: CompiledLevelRule[]

  constructor(levelRules: Record<string, LogLevel>, forcedLevel?: LogLevel) {
    // forcedLevel 来自 SPIDER_LOG_LEVEL, 一旦存在就无视白名单让所有 child 输出, 保住临时排查能力
    this.forcedLevel = forcedLevel
    this.rules = Object.entries(levelRules).map(([pattern, level]) => ({
      level,
      pattern: new RegExp(pattern),
    }))
  }

  resolve(scope: string): LogLevel {
    if (this.forcedLevel) return this.forcedLevel

    // 按配置顺序匹配, 命中第一条正则即用其 level; 都不命中则用默认 silent
    const matched = this.rules.find((rule) => rule.pattern.test(scope))
    return matched?.level ?? ChildLoggerLevelResolver.DEFAULT_LEVEL
  }
}
