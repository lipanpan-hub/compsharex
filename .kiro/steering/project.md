---
inclusion: always
---

# 本项目经验总结

本文档记录与本项目技术栈强相关的经验，避免重复犯错。

## npm link 后 Permission denied

- 原因：`bin/run.js` / `bin/dev.js` 缺少执行权限，Windows 克隆到 Linux 时权限位会丢失。
- 修复：`chmod +x bin/run.js bin/dev.js`

## prompts autocomplete 类型必须提供 choices 属性

- `autocomplete` 类型必须同时提供 `choices` 属性，`suggest` 函数签名是 `(input, choices)`，不能只传 `input`。
- 正确写法：`suggest: async (input: string, choices: any[]) => { if (!input) return choices; ... }`

