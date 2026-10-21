// config 模块统一导出入口（Barrel）
export {ConfigManager} from './config-manager.js'
export type {ConfigFile, NamedProfile} from './config-manager.js'
export {ToolConfigManager} from './config.js'
// 注意: 不要在此导出 edit-config-tui(会同步拉入 pi-tui/marked, 拖慢 init hook 与所有 config 命令), 使用方请动态 import
export {ExternalEditor} from './external-editor.js'
export type {Config, Profile} from './types.js'
