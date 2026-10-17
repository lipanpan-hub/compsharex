import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {parse, stringify} from 'yaml'

// 档案基础约束: 任意档案至少要有唯一 name, 用于检索与激活; 其余字段由具体项目自行扩展
export interface NamedProfile {
  name: string
}

// 顶层配置结构: 多档案 + 当前激活档案名(对档案内部字段不作任何假设)
export interface ConfigFile<TProfile extends NamedProfile> {
  current: string
  profiles: TProfile[]
}

/**
 * 通用配置管理器(门面 Facade + 模板方法 Template Method)。
 *
 * 对上层屏蔽 YAML 文件读写与多档案编排细节, 且对档案内部字段零假设(通过泛型 TProfile 承载),
 * 因此可跨项目直接复用。它统一暴露两组能力:
 * - 核心读写: readConfig / writeConfig
 * - 档案管理: getCurrentProfile / updateCurrentProfile / upsertProfile
 *
 * 唯一与项目相关的"默认档案"由抽象方法 createDefaultProfile 延迟到子类实现(模板方法模式)。
 */
export abstract class ConfigManager<TProfile extends NamedProfile> {
  private configPath: string

  constructor(configPath: string) {
    this.configPath = configPath
  }

  getConfigPath(): string {
    return this.configPath
  }

  /**
   * 确保配置文件存在: 不存在时创建默认档案并设为当前档案。
   *
   * @returns 本次是否新建了配置文件(已存在返回 `false`)
   */
  ensureConfig(): boolean {
    if (existsSync(this.configPath)) return false
    this.upsertProfile(this.createDefaultProfile(), true)
    return true
  }

  // #region 核心读写

  /**
   * 读取并解析配置文件。
   *
   * @returns 解析后的配置对象; 若文件不存在或解析失败则返回 `null`
   */
  readConfig(): ConfigFile<TProfile> | null {
    if (!existsSync(this.configPath)) return null
    try {
      return parse(readFileSync(this.configPath, 'utf8')) as ConfigFile<TProfile>
    } catch {
      return null
    }
  }

  /**
   * 将配置对象序列化并写入配置文件(必要时自动创建目录)。
   *
   * @param config - 要持久化的完整配置对象
   */
  writeConfig(config: ConfigFile<TProfile>): void {
    const dir = dirname(this.configPath)
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true})
    writeFileSync(this.configPath, stringify(config), 'utf8')
  }
  // #endregion

  // #region 档案管理

  /**
   * 获取当前激活的配置档案(profile)。
   *
   * @returns 当前档案对象; 若配置不存在、未设置当前档案或未找到匹配档案则返回 `null`
   */
  getCurrentProfile(): null | TProfile {
    const config = this.readConfig()
    if (!config || !config.current) return null
    return config.profiles.find((profile) => profile.name === config.current) ?? null
  }

  /**
   * 局部更新当前激活档案的字段。
   *
   * @param updates - 需要合并到当前档案的部分字段
   * @returns 更新成功返回 `true`; 若无配置、未设置当前档案或未找到档案则返回 `false`
   */
  updateCurrentProfile(updates: Partial<TProfile>): boolean {
    const config = this.readConfig()
    if (!config || !config.current) return false
    const index = config.profiles.findIndex((profile) => profile.name === config.current)
    if (index === -1) return false
    config.profiles[index] = {...config.profiles[index], ...updates}
    this.writeConfig(config)
    return true
  }

  /**
   * 新增或更新一个配置档案(存在则覆盖, 不存在则追加)。
   *
   * @param profile - 要写入的档案对象
   * @param setCurrent - 是否同时将该档案设为当前激活档案, 默认 `false`
   */
  upsertProfile(profile: TProfile, setCurrent = false): void {
    const config = this.readConfig() ?? {current: '', profiles: []}
    const index = config.profiles.findIndex((existing) => existing.name === profile.name)
    if (index === -1) config.profiles.push(profile)
    else config.profiles[index] = profile
    if (setCurrent) config.current = profile.name
    this.writeConfig(config)
  }

  /**
   * 切换当前激活档案为指定名称的档案。
   *
   * @param name - 目标档案名
   * @returns 切换成功返回 `true`; 若无配置或未找到该档案则返回 `false`
   */
  switchProfile(name: string): boolean {
    const config = this.readConfig()
    if (!config || !config.profiles.some((profile) => profile.name === name)) return false
    config.current = name
    this.writeConfig(config)
    return true
  }
  // #endregion

  // 模板方法的可变步骤: 由具体项目提供本项目的默认档案(供 ensureConfig 调用)
  protected abstract createDefaultProfile(): TProfile
}
