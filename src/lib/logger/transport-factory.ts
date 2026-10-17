import {join} from 'node:path'
import {type TransportTargetOptions} from 'pino'

import {LOG_DIR_NAME, type LoggerConfig} from './logger-config.js'

export class TransportFactory {
  constructor(
    private readonly config: LoggerConfig,
    private readonly configDir: string,
  ) {}

  createTargets(): TransportTargetOptions[] {
    const targets: TransportTargetOptions[] = []

    // #region 控制台 transport
    if (this.config.console.isEnabled) {
      targets.push({
        level: this.config.console.level,
        options: {
          colorize: this.config.console.isColorized,
          ignore: 'pid,hostname,scope',
          messageFormat: '[{scope}] {msg}',
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        },
        target: 'pino-pretty',
      })
    }
    // #endregion

    // #region 文件 transport: configDir/logs 下按天一个文件
    if (this.config.file.isEnabled) {
      targets.push({
        level: this.config.file.level,
        options: {
          dateFormat: this.config.file.frequency === 'hourly' ? 'yyyy-MM-dd-HH' : 'yyyy-MM-dd',
          extension: '.log',
          file: join(this.configDir, LOG_DIR_NAME, 'app'),
          frequency: this.config.file.frequency,
          limit: {count: this.config.file.retainedFileCount, removeOtherLogFiles: true},
          mkdir: true,
        },
        target: 'pino-roll',
      })
    }
    // #endregion

    // #region mongodb transport
    if (this.config.mongodb.isEnabled) {
      targets.push({
        level: this.config.mongodb.level,
        options: {
          collection: this.config.mongodb.collection,
          database: this.config.mongodb.database,
          uri: this.config.mongodb.uri,
        },
        target: 'pino-mongodb',
      })
    }
    // #endregion

    return targets
  }
}
