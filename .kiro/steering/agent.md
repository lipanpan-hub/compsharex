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

## Windows 子进程中文乱码: 控制台代码页 vs locale 是两套机制

- 现象: spawn 出的交互式 shell 里,`dir` 中文正常但 `ls` 乱码成 `$'\217'` 八进制转义 + `□`。
- 根因(第一性原理): 同一个控制台里两类程序判断字符编码的依据不同——
  - cmd 原生命令(dir 等)看 **Windows 控制台代码页**,需 `chcp 65001` 切到 UTF-8。
  - GNU/MSYS 工具(Git for Windows 自带的 ls.exe 等)不看代码页,看 **locale 环境变量** `LANG`/`LC_ALL`;locale 非 UTF-8 时 ls 认为中文字节"不可打印",用 `$'\nnn'` 八进制转义显示。
- 修复: 两者都要处理。Windows 下 `cmd /K "chcp 65001 >nul"` 切代码页,同时给子进程注入 `env: {LANG, LC_ALL}`。
- locale 名要用标准 `language_TERRITORY.charset` 格式(如 `zh_CN.UTF-8`);`C.UTF-8` 的 `C` 不符合该模式,在 Cygwin/MSYS runtime 下可能被忽略而失效。
- `$'\nnn'` 八进制转义是 GNU ls 判定"locale 非 UTF-8"的明确信号,见到它先查 locale 而非代码页。
- 编码对了若仍显示 `□` 方块,则是终端字体缺中日韩字形的问题,与编码无关。

## semanticRename 之后必须手动验证覆盖范围

- `semanticRename` 可能遗漏根目录下的配置文件（如 `*.config.ts`），因为它们不一定在语言服务器的索引范围内。
- 重命名后必须用 `grep_search` 搜索旧符号名，确认无遗漏，再用 `getDiagnostics` 检查受影响文件。

## smartRelocate 不更新文件内部的相对路径

- `smartRelocate` 只更新其他文件的 import 路径，**不会**更新被移动文件内部的 `resolve()`、`join()` 等路径计算。
- 移动文件后必须手动检查文件内部所有 `../` 相对路径，必要时运行 `npm run typecheck` 验证。

## 删除功能时要同步清理 package.json scripts

- 删除某个命令或功能时，除了删源码，还要检查 `package.json` 中有无对应的 npm scripts 需要一并删除。

## 大文件处理：按输入特征选流式策略

- 行式格式（JSONL/CSV/日志）：`createReadStream` + `readline`，逐行处理立即释放。
- 非行式顺序消费：固定大小分块 + 滑动窗口处理跨块边界。
- 需要随机访问：`fs.open` + `read(fd, buf, offset, length)` 按需读取。
- 禁止"看似流式实则累积"：把每行 push 到数组再处理就退化回全量加载。
- 耗时操作必须有进度反馈（百分比/已处理量+速率），按时间间隔节流避免刷屏。
