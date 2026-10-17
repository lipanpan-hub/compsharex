import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

export type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'silent' | 'trace' | 'warn'

// 控制台 transport: pino-pretty
export interface ConsoleTransportConfig {
  isColorized: boolean
  isEnabled: boolean
  level: LogLevel
}

// 文件 transport: pino-roll, 按天滚动
export interface FileTransportConfig {
  frequency: 'daily' | 'hourly'
  isEnabled: boolean
  level: LogLevel
  retainedFileCount: number
}

// 数据库 transport: pino-mongodb
export interface MongodbTransportConfig {
  collection: string
  database: string
  isEnabled: boolean
  level: LogLevel
  uri: string
}

export interface LoggerConfig {
  // child logger 级别白名单: 键是匹配 scope 的正则字符串, 值是该 scope 应用的级别
  // 未被任何正则命中的 child logger 默认 silent
  childLoggerLevels: Record<string, LogLevel>
  console: ConsoleTransportConfig
  file: FileTransportConfig
  mongodb: MongodbTransportConfig
}

export const LOGGER_CONFIG_FILE_NAME = 'logger.json'
export const LOG_DIR_NAME = 'logs'

const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  // 示例: {"^sitemap": "debug"} 表示 scope 以 sitemap 开头的 child 用 debug, 其余 silent
  childLoggerLevels: {
    ".*":"debug",
  },
  console: {isColorized: true, isEnabled: true, level: 'info'},
  file: {frequency: 'daily', isEnabled: true, level: 'debug', retainedFileCount: 14},
  mongodb: {
    collection: 'logs',
    database: 'spider',
    isEnabled: false,
    level: 'info',
    uri: 'mongodb://127.0.0.1:27017/',
  },
}

export class LoggerConfigLoader {
  static load(configDir: string): LoggerConfig {
    // 读取 configDir/logger.json, 不存在则落地一份默认配置供用户改开关
    const configFilePath = join(configDir, LOGGER_CONFIG_FILE_NAME)
    if (!existsSync(configFilePath)) {
      mkdirSync(configDir, {recursive: true})
      writeFileSync(configFilePath, `${JSON.stringify(DEFAULT_LOGGER_CONFIG, null, 2)}\n`, 'utf8')
      return LoggerConfigLoader.applyEnvOverride(DEFAULT_LOGGER_CONFIG)
    }

    let userConfig: Partial<LoggerConfig> = {}
    try {
      userConfig = JSON.parse(readFileSync(configFilePath, 'utf8')) as Partial<LoggerConfig>
    } catch {
      // 配置文件损坏时退回默认配置, 不阻断命令执行
      userConfig = {}
    }

    // 最终需要把 这里的 默认配置 和 用户配置合并在一起  后面的配置会覆盖前面的配置
    // 对象展开是 浅拷贝 深拷贝用 structuredClone  
    const merged: LoggerConfig = {
      childLoggerLevels: {...DEFAULT_LOGGER_CONFIG.childLoggerLevels, ...userConfig.childLoggerLevels},
      console: {...DEFAULT_LOGGER_CONFIG.console, ...userConfig.console},
      file: {...DEFAULT_LOGGER_CONFIG.file, ...userConfig.file},
      mongodb: {...DEFAULT_LOGGER_CONFIG.mongodb, ...userConfig.mongodb},
    }
    return LoggerConfigLoader.applyEnvOverride(merged)
  }

  private static applyEnvOverride(config: LoggerConfig): LoggerConfig {
    // SPIDER_LOG_LEVEL 临时调整所有 transport 的级别, 方便排查问题
    const envLevel = process.env.SPIDER_LOG_LEVEL as LogLevel | undefined
    if (!envLevel) return config

    return {
      childLoggerLevels: config.childLoggerLevels,
      console: {...config.console, level: envLevel},
      file: {...config.file, level: envLevel},
      mongodb: {...config.mongodb, level: envLevel},
    }
  }
}
