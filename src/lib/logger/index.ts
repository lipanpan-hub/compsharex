import {type Bindings, type Logger} from 'pino'

import {LoggerManager} from './logger-manager.js'

export {ChildLoggerLevelResolver} from './child-logger-level-resolver.js'
export {
  type ConsoleTransportConfig,
  type FileTransportConfig,
  LOG_DIR_NAME,
  LOGGER_CONFIG_FILE_NAME,
  type LoggerConfig,
  LoggerConfigLoader,
  type LogLevel,
  type MongodbTransportConfig,
} from './logger-config.js'
export {LoggerManager} from './logger-manager.js'
export {TransportFactory} from './transport-factory.js'

export function createLogger(scope: string, bindings: Bindings = {}): Logger {
  // 给 src/lib 下的普通模块用的便捷入口, 命令内优先用 this.logger
  return LoggerManager.instance.createChildLogger(scope, bindings)
}
