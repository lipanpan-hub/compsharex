#!/usr/bin/env node

import {Exit} from '@oclif/core/handle'
import {execute} from '@oclif/core'

// Windows + Node v24 下 process.exit 会与 fetch(undici) 残留句柄的关闭过程竞态,
// 触发 libuv 断言崩溃(assert async.c); 替换 oclif 的退出桩为自然退出, 退出码不受影响
const FORCE_EXIT_DELAY_MS = 3000
Exit.exit = (code = 0) => {
  process.exitCode = code
  // 兜底: 残留句柄(ssh/定时器/stdin)导致迟迟不退出时强制退出; unref 保证正常自然退出不被拖延
  setTimeout(() => process.exit(code), FORCE_EXIT_DELAY_MS).unref()
}

// Windows 下未设置 SHELL 时, oclif 的 getShell() 每次启动都会同步拉起一个 PowerShell 子进程探测父进程(约 590ms);
// 预设占位值可直接跳过该探测, config.shell 仅影响 help 续行符、autocomplete 默认 shell 与 version 详情
if ((process.platform === 'win32') && (!process.env.SHELL)) {
  process.env.SHELL = 'powershell'
}

await execute({dir: import.meta.url})
