#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {Exit} from '@oclif/core/handle'
import {execute} from '@oclif/core'

// 同 bin/run.js: 避免 process.exit 与 fetch 残留句柄竞态导致 Windows 下 libuv 断言崩溃
const FORCE_EXIT_DELAY_MS = 3000
Exit.exit = (code = 0) => {
  process.exitCode = code
  // 兜底: 残留句柄(ssh/定时器/stdin)导致迟迟不退出时强制退出; unref 保证正常自然退出不被拖延
  setTimeout(() => process.exit(code), FORCE_EXIT_DELAY_MS).unref()
}

// 同 bin/run.js: Windows 下预设 SHELL 以跳过 oclif getShell() 每次启动拉起 PowerShell 子进程的探测(约 590ms)
if ((process.platform === 'win32') && (!process.env.SHELL)) {
  process.env.SHELL = 'powershell'
}

await execute({development: true, dir: import.meta.url})
