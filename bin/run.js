#!/usr/bin/env node

import {Exit} from '@oclif/core/handle'
import {execute} from '@oclif/core'

// Windows + Node v24 下 process.exit 会与 fetch(undici) 残留句柄的关闭过程竞态,
// 触发 libuv 断言崩溃(assert async.c); 替换 oclif 的退出桩为自然退出, 退出码不受影响
Exit.exit = (code = 0) => {
  process.exitCode = code
}

await execute({dir: import.meta.url})
