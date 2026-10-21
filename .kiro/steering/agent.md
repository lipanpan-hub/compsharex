---
inclusion: always
---

# Agent 通用经验总结

本文档记录跨项目可复用的通用经验（思维方式、环境知识、工具使用），避免重复犯错。

- Powershell 环境用 & 串联命令会被当成后台 job 要分多次调用工具，或用 ; 分隔，绝不用 & 进行分割 
- 执行重命名操作后必须用 `grep_search` 搜索旧符号名，确认无遗漏，根目录下的配置文件很容易被遗漏（如 `*.config.ts`），因为它们不一定在语言服务器的索引范围内
- 移动文件后必须自动检查文件内部所有相对路径，被移动文件内部的 `resolve()`、`join()` 等路径计算很容易被忽略检查而出错, 必要时运行 `npm run typecheck` 验证

## 临时文件与产物的清理

- 临时验证脚本(如 testmp/ 下的)和测试产生的下载/输出文件，任务结束后都要清理，不能只发删除命令就认为完成。
- 清理后必须用 list_directory 递归核实，不能只按单一扩展名删(如只删 *.srt 会漏掉 bug 误建的同名目录)。
- 删除文件优先用 delete_file 工具；删目录用 Remove-Item -LiteralPath ... -Recurse，并再次列目录确认。


## 删除功能时要同步清理 package.json scripts

- 删除某个命令或功能时，除了删源码，还要检查 `package.json` 中有无对应的 npm scripts 需要一并删除。

## 构建命令不要与代码编辑并行调用

- 同一批并行工具调用里同时放"str_replace 编辑"和"npm run build"会竞态: 构建可能读到编辑前的文件, 结果看似通过实则漏了最后一处改动。
- 必须等所有编辑完成后, 再单独发起构建; 若已并行过, 重新构建一次再看结论。

## list_directory 的 depth 对部分目录不展开子级

- 对 `src/lib` 传 `depth: 2/3` 只返回空列表, 没有子文件。需要递归列表时改用 `Get-ChildItem <路径> -Recurse -File`。

## PowerShell 的 Select-String 没有 -Recurse 参数

- 递归搜内容写成 `Get-ChildItem <目录> -Recurse -Include *.js -File | Select-String -Pattern ...`; 优先用 `grep_search` 工具。
- `grep_search` 单次最多 100 条匹配, 命中过多会被截断(出现 `[truncated: too many matches]`), 要缩小 includePattern 或 query 再搜。

## 捕获 Node 的 DEBUG 输出

- `DEBUG=*` 的日志走 stderr, 且 PowerShell 里 `2>&1 | Out-String` 可能拿不到, 稳妥写法是 `node ... *>&1 | Select-Object -First N`。
- `$env:DEBUG='*'` 用完要 `Remove-Item Env:DEBUG`, 避免污染后续命令。

