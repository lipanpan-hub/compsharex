import {Hook} from '@oclif/core'
import {ToolConfigManager} from '../../lib/config/index.js'

const hook: Hook<'init'> = async function (options) {

  // #region 配置文件初始化
  // 确保 configDir 下存在 config.yml,不存在则创建含默认档案的配置文件
  const configManager = ToolConfigManager.fromConfigDir(options.config.configDir)
  this.log(configManager.getConfigPath())
  if (configManager.ensureConfig()) {
    this.log(`已创建默认配置文件: ${configManager.getConfigPath()}`)
  }
  // #endregion
  
}

export default hook
