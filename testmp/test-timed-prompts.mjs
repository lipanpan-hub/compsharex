// 带超时交互询问工具的自测脚本: node testmp/test-timed-prompts.mjs (需先 npm run build)
// 覆盖: 非交互终端回退、必填项超时退出、abort 标记识别、非超时错误透传

import assert from 'node:assert/strict'

import {
  DEFAULT_PROMPT_TIMEOUT_MS,
  PromptTimeoutError,
  timedInput,
  timedPassword,
  timedSearch,
  timedSelect,
  withPromptTimeout,
} from '../dist/lib/prompts.js'

// 强制非交互终端, 让所有 timed* 询问走"视同超时"的回退路径
function setInteractiveTerminal(isInteractive) {
  Object.defineProperty(process.stdin, 'isTTY', {value: isInteractive, configurable: true})
}

const testCases = []
function testCase(name, runTest) {
  testCases.push({name, runTest})
}

// #region 非交互终端回退(视同超时)

testCase('非交互终端: timedInput 有 default 返回默认值', async () => {
  setInteractiveTerminal(false)
  const result = await timedInput({message: '问题', default: '回退值'})
  assert.equal(result, '回退值')
})

testCase('非交互终端: timedInput 无 default 抛 PromptTimeoutError', async () => {
  setInteractiveTerminal(false)
  await assert.rejects(
    () => timedInput({message: '必填问题'}),
    (error) => {
      assert.ok(error instanceof PromptTimeoutError)
      assert.match(error.message, /必填问题/)
      assert.match(error.message, /30s/)
      return true
    },
  )
})

testCase('非交互终端: timedPassword 有 fallbackValue 返回回退值', async () => {
  setInteractiveTerminal(false)
  const result = await timedPassword({message: '密码', fallbackValue: ''})
  assert.equal(result, '')
})

testCase('非交互终端: timedPassword 无 fallbackValue 抛 PromptTimeoutError', async () => {
  setInteractiveTerminal(false)
  await assert.rejects(() => timedPassword({message: '密码'}), PromptTimeoutError)
})

testCase('非交互终端: timedSelect 有 default 返回默认值', async () => {
  setInteractiveTerminal(false)
  const result = await timedSelect({
    message: '选择',
    choices: [
      {name: 'A', value: 'a'},
      {name: 'B', value: 'b'},
    ],
    default: 'b',
  })
  assert.equal(result, 'b')
})

testCase('非交互终端: timedSelect 无 default 抛 PromptTimeoutError', async () => {
  setInteractiveTerminal(false)
  await assert.rejects(() => timedSelect({message: '选择', choices: [{name: 'A', value: 'a'}]}), PromptTimeoutError)
})

testCase('非交互终端: timedSearch 抛 PromptTimeoutError', async () => {
  setInteractiveTerminal(false)
  await assert.rejects(
    () => timedSearch({message: '搜索', source: () => []}),
    (error) => {
      assert.ok(error instanceof PromptTimeoutError)
      return true
    },
  )
})

// #endregion

// #region 超时控制核心(abort 标记识别)

// 模拟 inquirer 行为: 收到 abort 后以 AbortPromptError 风格抛出(reason 挂在 cause 上)
function fakePromptAbortingOnSignal(abortSignal, delayMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    abortSignal.addEventListener('abort', () => rejectPromise(new Error('AbortPromptError', {cause: abortSignal.reason})))
  })
}

testCase('超时核心: 超时 abort 后命中回退值', async () => {
  setInteractiveTerminal(true)
  const startedAt = Date.now()
  const result = await withPromptTimeout('问题', 80, (abortSignal) => fakePromptAbortingOnSignal(abortSignal, 80), () => '默认值')
  assert.equal(result, '默认值')
  assert.ok((Date.now() - startedAt) < 1000, '应在超时后立即回退而不是阻塞')
})

testCase('超时核心: 无回退值时超时抛 PromptTimeoutError', async () => {
  setInteractiveTerminal(true)
  await assert.rejects(
    () =>
      withPromptTimeout(
        '必填问题',
        80,
        (abortSignal) => fakePromptAbortingOnSignal(abortSignal, 80),
        () => {
          throw new PromptTimeoutError('必填问题', 80)
        },
      ),
    PromptTimeoutError,
  )
})

testCase('超时核心: 非超时错误原样上抛', async () => {
  setInteractiveTerminal(true)
  const businessError = new Error('业务错误')
  await assert.rejects(
    () =>
      withPromptTimeout(
        '问题',
        80,
        () => Promise.reject(businessError),
        () => '不应回退',
      ),
    (error) => error === businessError,
  )
})

// #endregion

// #region 常量

testCase('默认超时为 30 秒', () => {
  assert.equal(DEFAULT_PROMPT_TIMEOUT_MS, 30 * 1000)
})

// #endregion

// 顺序执行全部用例
let failedCount = 0
for (const {name, runTest} of testCases) {
  try {
    await runTest()
    console.log(`通过: ${name}`)
  } catch (error) {
    failedCount += 1
    console.error(`失败: ${name}`)
    console.error(error)
  }
}
setInteractiveTerminal(undefined)

if (failedCount > 0) {
  console.error(`\n${failedCount} 个用例失败`)
  process.exitCode = 1
} else {
  console.log(`\n全部 ${testCases.length} 个用例通过`)
}
