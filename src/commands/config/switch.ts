import * as inquirer from '@inquirer/prompts'
import {Args} from '@oclif/core'
import Fuse from 'fuse.js'

import {BaseCommand} from '../../lib/base-command.js'
import {ToolConfigManager} from '../../lib/config/index.js'

export default class ConfigSwitch extends BaseCommand {
  static aliases = ['cf:sw', 'cf:use']
  static description = '切换配置文件中的默认(当前激活)配置档案'

  static examples = [
    '<%= config.bin %> <%= command.id %> work',
    '<%= config.bin %> <%= command.id %>',
  ]

  static args = {
    name: Args.string({description: '要切换到的配置档案名, 省略时进入交互式选择'}),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(ConfigSwitch)
    const configManager = ToolConfigManager.fromConfigDir(this.config.configDir)

    // 确保配置存在, 首次使用时自动生成默认档案
    configManager.ensureConfig()
    const config = configManager.readConfig()
    const profileNames = (config?.profiles ?? []).map((profile) => profile.name)

    if (profileNames.length === 0) {
      this.error('配置文件中没有任何配置档案, 请先添加档案 (可通过配置编辑命令手动添加)')
    }

    const currentName = configManager.getCurrentProfile()?.name ?? ''

    // #region 参数直切: 显式指定档案名时跳过交互
    if (args.name) {
      if (!configManager.switchProfile(args.name)) {
        this.error(`未找到名为 "${args.name}" 的配置档案, 可用档案: ${profileNames.join(', ')}`)
      }
      this.log(`已切换默认配置: ${currentName || '(无)'} -> ${args.name}`)
      return
    }
    // #endregion

    // #region 交互选择: 模糊搜索过滤档案, 也可直接输入新名称创建档案
    // kind 区分用户意图: switch 切换到已有档案, create 新建同名档案并激活
    type ChoiceValue = {kind: 'switch' | 'create'; name: string}

    const nameFuse = new Fuse(profileNames)
    const selected = await inquirer.search({
      message: '输入或选择要切换到的配置档案 (支持模糊搜索):',
      source: (term = '') => {
        const keyword = term.trim()
        // 空关键字展示全部档案, 非空关键字按 fuse.js 模糊匹配过滤
        const matchedNames = keyword ? nameFuse.search(keyword).map((result) => result.item) : profileNames
        const choices: {name: string; value: ChoiceValue}[] = matchedNames.map((name) => ({
          name: name === currentName ? `${name} (当前)` : name,
          value: {kind: 'switch', name},
        }))
        // 输入的名称不在档案列表时, 追加新建该档案的选项
        if (keyword && !profileNames.includes(keyword)) {
          choices.push({name: `新建配置档案: ${keyword}`, value: {kind: 'create', name: keyword}})
        }
        return choices
      },
    })

    // 新建分支: 直接以输入的名称建档并激活, 其余字段走默认回退
    if (selected.kind === 'create') {
      configManager.upsertProfile({name: selected.name}, true)
      this.log(`已新建并切换默认配置: ${currentName || '(无)'} -> ${selected.name}`)
      return
    }

    if (selected.name === currentName) {
      this.log(`当前默认配置已是 "${selected.name}", 无需切换`)
      return
    }

    // 目标档案名来自档案列表, 切换必然成功
    configManager.switchProfile(selected.name)
    this.log(`已切换默认配置: ${currentName || '(无)'} -> ${selected.name}`)
    // #endregion
  }
}
