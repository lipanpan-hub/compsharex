// CompShare 命令行错误体系(移植自 compshare_cli/errors.py + api.py 的错误分类)

// 面向用户的命令行错误基类
export class CLIError extends Error {}

// 配置缺失或非法时抛出
export class ConfigError extends CLIError {}

// 命令选项组合非法时抛出
export class UsageError extends CLIError {}

// UCloud API 返回 RetCode != 0(对齐 Python 端 RetCodeException)
export class UCloudApiError extends CLIError {
  readonly action: string
  readonly retCode: number
  readonly requestId: string

  constructor(action: string, retCode: number, message: string, requestId: string) {
    super(message)
    this.action = action
    this.retCode = retCode
    this.requestId = requestId
  }
}

// 传输层失败(网络不可达/超时/响应非 JSON 等)
export class UCloudTransportError extends CLIError {}

// 静默退出: 错误信息已由 Renderer 输出, 基类 catch 只设置退出码不再打印
export class SilentExit extends Error {
  readonly exitCode: number

  constructor(exitCode: number) {
    super('silent exit')
    this.exitCode = exitCode
  }
}
