# @lppx/compsharex

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@lppx/compsharex.svg)](https://npmjs.org/package/@lppx/compsharex)
[![Downloads/week](https://img.shields.io/npm/dw/@lppx/compsharex.svg)](https://npmjs.org/package/@lppx/compsharex)

优云智算 CompShare 的命令行工具,命令名为 `cps`。用终端管理 GPU 实例、镜像、存储、带宽和团队,也可以直接调用平台上的 MiniMax 与 LLM 服务。

## 功能概览

- **实例管理**:创建、启停、重启、重装、变更配置、改密码、查价格和退款金额,支持本地模板与定时关机。
- **远程连接**:`ssh` 登录、`cp` 在本地与实例间传文件,支持缓存连接信息和自动输入密码。
- **远程作业**:提交在断开终端后仍持续运行的任务,可查看日志、等待完成或取消。
- **镜像**:创建自定义镜像,分享、发布到社区,收藏社区镜像。
- **存储与带宽**:数据盘与 US3 挂载,独立带宽与共享带宽的购买、调整、切换。
- **团队**:成员、邀请、配额拨发与回收、账单导出、操作审计。
- **AI 服务**:MiniMax 视频/语音/图像任务,IndexTTS 语音合成与音色克隆。
- **多档案配置**:一份配置文件保存多套凭据,按需切换。
- **自动化友好**:所有业务命令支持 `--json` 输出,写操作可用 `--yes` 跳过确认,`instance create` 还支持 `--dryRun` 只校验不创建。

## 安装

要求 Node.js 18 或更高版本。

```sh
npm install -g @lppx/compsharex
cps --version
```

## 快速开始

### 1. 配置凭据

```sh
# 交互式录入 accessKeyId / accessKeySecret,写入当前档案
cps config set

# 检查本地环境、凭据、API 连通性和 OpenSSH
cps doctor
```

### 2. 创建并连接实例

```sh
# 查询某可用区内的 4090 规格
cps instance search --region cn-bj2 --zone cn-bj2-a --gpu 4090

# 交互式向导创建实例;也可以全部用参数指定,配合 --yes 用于脚本
cps instance create

# 查看实例列表,SSH 登录
cps instance list
cps instance ssh <INSTANCE_ID>
```

### 3. 传文件与跑任务

```sh
# 实例路径以冒号开头:上传和下载
cps instance cp <INSTANCE_ID> ./local.txt :/root/remote.txt
cps instance cp <INSTANCE_ID> :/root/remote.log ./download.log

# 提交持久远程作业,关闭终端后继续运行
cps instance job submit <INSTANCE_ID> -- python train.py --epochs 10
cps instance job list <INSTANCE_ID> --state Running
cps instance job logs <INSTANCE_ID> <JOB_ID>
```

## 命令分组

运行 `cps <分组> --help` 查看分组下的全部命令。

- `cps instance`:管理 GPU 实例。子分组有 `job`(远程作业)、`template`(本地实例模板)、`schedule`(定时关机)、`ports`、`software`。
- `cps image`:镜像的创建、分享、发布与收藏。
- `cps storage`:`disk`(数据盘)与 `us3`(对象存储挂载)。
- `cps bandwidth`:独立带宽与共享带宽。
- `cps team`:团队及其成员、邀请、配额、账单。
- `cps minimax`:MiniMax 视频任务,子分组 `audio`、`image`、`skill`。
- `cps llm`:优云智算 LLM 服务,子分组 `indextts`。
- `cps config`:`set`、`show`、`switch`、`edit`,管理凭据与档案。
- `cps doctor`:只读环境诊断。
- `cps feedback <类别> <内容>`:提交使用反馈或缺陷报告。

常用命令有简写别名,例如 `cps ins ssh`、`cps ins cp`、`cps doc`、`cps fb`。别名可在各命令的 `--help` 里的 `ALIASES` 查到。

## 全局选项

所有业务命令都支持下面三个选项。

- `--json`:以 JSON 输出结果,方便被脚本解析。
- `--profile <名称>`:本次命令使用指定档案,不改变当前激活的档案。
- `--show-sensitive`:显示敏感字段的明文,默认会脱敏。

## 配置

配置保存为 YAML 文件,支持多个档案,`current` 指向当前激活的档案。

- Windows:`%LOCALAPPDATA%\compsharex\config.yml`
- macOS / Linux:`~/.config/compsharex/config.yml`

```yaml
current: default
profiles:
  - name: default
    accessKeyId: <GPU 接口 accessKeyId>
    accessKeySecret: <GPU 接口 accessKeySecret>
    llmApiKey: <LLM 服务 apiKey>
    llmBaseUrl: <LLM 服务地址>
    minimaxApiKey: <MiniMax API Key>
    documentsPath: <工作目录>
```

各服务的凭据用对应命令录入,不必手写文件。

- `cps config set`:GPU 接口凭据
- `cps llm cfset`:LLM 服务凭据
- `cps minimax cfset`:MiniMax 凭据
- `cps config show`:查看全部配置
- `cps config switch [名称]`:切换档案,省略名称时交互选择
- `cps config edit`:用内置 TUI 编辑器修改,加 `-e` 改用外部编辑器

配置文件里保存的是明文凭据。不要把它提交到仓库或发给他人。

## 命令参考

每个分组和命令都带有 `--help`,里面有完整的参数说明、默认值和示例。

```sh
cps --help                  # 列出所有分组和顶层命令
cps instance --help         # 列出分组下的命令
cps instance create --help  # 查看单个命令的参数与示例
```


## 开发

```sh
git clone https://github.com/lipanpan-hub/compsharex.git
cd compsharex
npm install
npm run build      # 清理产物 → tsc 编译 → 生成 oclif manifest
npm start -- --help
```

目录结构:

- `src/commands/`:命令定义,只放参数声明与调用。目录层级对应命令层级,如 `instance/job/submit.ts` 对应 `cps instance job submit`。
- `src/lib/`:命令的核心逻辑。`compshare/` 是 API 调用、SSH、输出渲染等业务代码,`config/` 是多档案配置,`logger/` 是日志。
- `src/hooks/init/`:CLI 启动时的初始化钩子。
- `test/`:Mocha 测试,用 `npm test` 运行(结束后会跟一次 lint)。
- `nsis/`:Windows 安装包脚本。

打包安装包:`npm run pack:win`、`pack:macos`、`pack:deb`、`pack:tarballs`。

推送 `v*` 标签后,GitHub Actions 会自动发布到 npm。

## 反馈

在命令行里运行 `cps feedback <类别> <内容>`,或到 [GitHub Issues](https://github.com/lipanpan-hub/compsharex/issues) 提交问题。
