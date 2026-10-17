// minimax cfset 链路自测: MiniMaxClient.apiKey 优先级 + 配置档案读写
import assert from 'node:assert/strict'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {MiniMaxClient} from '../dist/lib/compshare/minimax-api.js'
import {Renderer} from '../dist/lib/compshare/output.js'
import {ToolConfigManager} from '../dist/lib/config/index.js'

const ENV_NAME = 'COMPSHARE_MINIMAX_API_KEY'
const renderer = new Renderer(true, true)

// 构造隔离的临时配置目录
function createTempConfigDir() {
  return mkdtempSync(join(tmpdir(), 'cps-cfset-'))
}

// 静默捕获 SilentExit 类失败
function captureFailure(action) {
  try {
    action()
    return null
  } catch (error) {
    return error
  }
}

// #region 用例 1: 环境变量优先于配置档案
delete process.env[ENV_NAME]
const clientEnvFirst = new MiniMaxClient(renderer, 'test', 'sk-ml-from-config')
process.env[ENV_NAME] = 'sk-ml-from-env'
assert.equal(clientEnvFirst.apiKey(), 'sk-ml-from-env', '环境变量应优先于配置档案')
delete process.env[ENV_NAME]
console.log('用例 1 通过: 环境变量优先于配置档案')
// #endregion

// #region 用例 2: 环境变量缺省时回退配置档案
const clientFromConfig = new MiniMaxClient(renderer, 'test', 'sk-ml-from-config')
assert.equal(clientFromConfig.apiKey(), 'sk-ml-from-config', '环境变量缺省时应回退到配置档案')
console.log('用例 2 通过: 环境变量缺省时回退配置档案')
// #endregion

// #region 用例 3: 两者均缺省时以退出码 2 报配置错误
const clientNoKey = new MiniMaxClient(renderer, 'test')
const noKeyError = captureFailure(() => clientNoKey.apiKey())
assert.ok(noKeyError, '两者均缺省时应抛出错误')
assert.equal(noKeyError.exitCode, 2, '配置缺失的退出码应为 2')
console.log('用例 3 通过: 两者均缺省时报配置错误(退出码 2)')
// #endregion

// #region 用例 4: 非 sk-ml- 前缀的 Key 被拒绝
const clientBadKey = new MiniMaxClient(renderer, 'test', 'sk-wrong-prefix')
const badKeyError = captureFailure(() => clientBadKey.apiKey())
assert.ok(badKeyError, '非 sk-ml- 前缀应被拒绝')
assert.equal(badKeyError.exitCode, 2, '前缀校验失败的退出码应为 2')
console.log('用例 4 通过: 非 sk-ml- 前缀被拒绝')
// #endregion

// #region 用例 5: cfset 写入路径 - ensureConfig + updateCurrentProfile 持久化 minimaxApiKey
const configDir = createTempConfigDir()
try {
  const configManager = ToolConfigManager.fromConfigDir(configDir)
  configManager.ensureConfig()
  const isUpdated = configManager.updateCurrentProfile({minimaxApiKey: 'sk-ml-e2e-key'})
  assert.equal(isUpdated, true, 'updateCurrentProfile 应返回 true')

  // 重新读取验证持久化
  const reloadedManager = ToolConfigManager.fromConfigDir(configDir)
  assert.equal(reloadedManager.getCurrentProfile().minimaxApiKey, 'sk-ml-e2e-key', '重新加载后应能读到写入的 Key')

  // 持久化的 Key 能被 client 实际使用
  const clientE2E = new MiniMaxClient(renderer, 'test', reloadedManager.getCurrentProfile().minimaxApiKey)
  assert.equal(clientE2E.apiKey(), 'sk-ml-e2e-key', 'client 应能使用档案中的 Key')
  console.log('用例 5 通过: 配置档案写入与回读闭环')
} finally {
  rmSync(configDir, {recursive: true, force: true})
}
// #endregion

console.log('全部用例通过')
