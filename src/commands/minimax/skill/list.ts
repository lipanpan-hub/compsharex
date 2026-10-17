// cps minimax skill list: 列出官方与自定义视频技能

import {Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {MINIMAX_SKILL_PATH, SKILL_COLUMNS} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxSkillList extends CompshareBaseCommand {
  static aliases = ['mm:skill:list', 'mm:skill:ls']
  static description = '列出官方与自定义视频技能'

  static examples = ['<%= config.bin %> <%= command.id %>']

  static flags = {
    ...compshareGlobalFlags,
    page: Flags.integer({default: 1, min: 1, description: '页码, 从 1 开始'}),
    pageSize: Flags.integer({default: 20, min: 1, max: 100, description: '每页条数 (1-100)'}),
    keyword: Flags.string({description: '按关键词过滤'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MinimaxSkillList)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const query: Record<string, unknown> = {page_num: flags.page, page_size: flags.pageSize}
    if (flags.keyword) {
      query.keyword = flags.keyword
    }
    const response = await client.request('GET', MINIMAX_SKILL_PATH, {query})
    const rows = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : []
    context.renderer.data(response, {rows, columns: SKILL_COLUMNS})
  }
}
