// 命令运行时上下文: 承载输出选项 / 配置档案 / SDK 工厂 / 渲染器
// (对齐 compshare_cli/runtime.py + commands/common.py 的 runtime/request 职责)

import type {Profile} from '../config/types.js'
import {ToolConfigManager} from '../config/config.js'

import {ConfigError} from './errors.js'
import {CompShareSDK} from './sdk.js'
import {Renderer} from './output.js'

export class CompshareContext {
  readonly jsonOutput: boolean
  readonly showSensitive: boolean
  readonly profileName?: string
  // 配置目录(oclif configDir), 供缓存文件等派生资源定位
  get configDirectory(): string {
    return this.configDir
  }
  private readonly configDir: string
  private cachedProfile?: Profile
  private readonly rendererInstance: Renderer

  constructor(options: {
    configDir: string
    jsonOutput: boolean
    profileName?: string
    showSensitive: boolean
  }) {
    this.configDir = options.configDir
    this.jsonOutput = options.jsonOutput
    this.showSensitive = options.showSensitive
    this.profileName = options.profileName
    this.rendererInstance = new Renderer(options.jsonOutput, options.showSensitive)
  }

  // 输出渲染器
  get renderer(): Renderer {
    return this.rendererInstance
  }

  // 当前生效的配置档案(懒加载; 指定名称优先, 否则取当前档案)
  get profile(): Profile {
    if (this.cachedProfile) {
      return this.cachedProfile
    }
    const manager = ToolConfigManager.fromConfigDir(this.configDir)
    manager.ensureConfig()
    const profile = this.profileName
      ? manager.readConfig()?.profiles.find((item) => item.name === this.profileName) ?? null
      : manager.getCurrentProfile()
    if (!profile) {
      const target = this.profileName ?? manager.readConfig()?.current ?? '当前'
      throw new ConfigError(`未找到${target}配置档案, 请先运行 cps config set 完成配置。`)
    }
    this.cachedProfile = profile
    return profile
  }

  // 构造 SDK 实例(凭据取自档案; region 可按请求覆盖)
  sdk(params: Record<string, unknown> = {}): CompShareSDK {
    const profile = this.profile
    if (!profile.accessKeyId || !profile.accessKeySecret) {
      throw new ConfigError(
        `配置档案 ${profile.name} 缺少 accessKeyId 或 accessKeySecret, 请运行 cps config set 补全。`,
      )
    }
    const rawRegion = params.Region
    const region = rawRegion !== undefined && rawRegion !== null ? String(rawRegion) : undefined
    return new CompShareSDK({
      publicKey: profile.accessKeyId,
      privateKey: profile.accessKeySecret,
      region,
    })
  }

  // 构造通用请求参数(对齐 common.request: region/zone/project 三件套)
  static request(options: {
    projectId?: string | null
    regionValue?: string | null
    zone?: boolean
    zoneValue?: string | null
  } = {}): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    if (options.regionValue !== undefined && options.regionValue !== null) {
      payload.Region = options.regionValue
    }
    if (options.zone) {
      if (options.zoneValue === undefined || options.zoneValue === null) {
        throw new ConfigError('该请求必须提供 Zone。')
      }
      payload.Zone = options.zoneValue
    }
    if (options.projectId) {
      payload.ProjectId = options.projectId
    }
    return payload
  }
}
