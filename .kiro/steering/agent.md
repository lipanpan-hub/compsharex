---
inclusion: always
---

# Agent 通用经验总结

本文档记录跨项目可复用的通用经验（思维方式、环境知识、工具使用），避免重复犯错。

- 事实判断: 不要用单一样本归纳普适结论
- 需求里的"压缩/合并"等模糊动词必须先确认粒度
- Powershell 环境用 & 串联命令会被当成后台 job 要分多次调用工具，或用 ; 分隔，绝不用 & 进行分割 

## 临时文件与产物的清理

- 临时验证脚本(如 testmp/ 下的)和测试产生的下载/输出文件，任务结束后都要清理，不能只发删除命令就认为完成。
- 清理后必须用 list_directory 递归核实，不能只按单一扩展名删(如只删 *.srt 会漏掉 bug 误建的同名目录)。
- 删除文件优先用 delete_file 工具；删目录用 Remove-Item -LiteralPath ... -Recurse，并再次列目录确认。


## semanticRename 之后必须手动验证覆盖范围

- `semanticRename` 可能遗漏根目录下的配置文件（如 `*.config.ts`），因为它们不一定在语言服务器的索引范围内。
- 重命名后必须用 `grep_search` 搜索旧符号名，确认无遗漏，再用 `getDiagnostics` 检查受影响文件。

## smartRelocate 不更新文件内部的相对路径

- `smartRelocate` 只更新其他文件的 import 路径，**不会**更新被移动文件内部的 `resolve()`、`join()` 等路径计算。
- 移动文件后必须手动检查文件内部所有 `../` 相对路径，必要时运行 `npm run typecheck` 验证。

## 删除功能时要同步清理 package.json scripts

- 删除某个命令或功能时，除了删源码，还要检查 `package.json` 中有无对应的 npm scripts 需要一并删除。
