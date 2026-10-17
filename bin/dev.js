#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {Exit} from '@oclif/core/handle'
import {execute} from '@oclif/core'

// 同 bin/run.js: 避免 process.exit 与 fetch 残留句柄竞态导致 Windows 下 libuv 断言崩溃
Exit.exit = (code = 0) => {
  process.exitCode = code
}

await execute({development: true, dir: import.meta.url})
