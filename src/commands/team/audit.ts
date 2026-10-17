// cps team audit: 列出团队操作日志

import {Args, Flags} from '@oclif/core'

import {collectPages} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {compact, splitCsv} from '../../lib/compshare/parsing.js'
import {teamParams, timeParams} from '../../lib/compshare/team-helpers.js'

// 操作日志统一列定义
const AUDIT_COLUMNS = [
  ['CreateTime', 'CREATED'],
  ['OperateType', 'ACTION'],
  ['Status', 'STATUS'],
  ['Content', 'MESSAGE'],
] as const satisfies readonly (readonly [string, string])[]

export default class TeamAudit extends CompshareBaseCommand {
  static description = '列出团队操作日志'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> --start 7d']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
    operation: Flags.string({multiple: true, description: '操作类型, 可重复'}),
    status: Flags.string({multiple: true, description: '状态, 可重复'}),
    ascending: Flags.boolean({default: false, description: '升序排列'}),
    limit: Flags.integer({default: 25, min: 1, max: 100, description: '返回条数上限'}),
    offset: Flags.integer({default: 0, min: 0, description: '跳过条数'}),
    all: Flags.boolean({default: false, description: '返回全部结果'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TeamAudit)
    const context = this.compshareContext()
    const params = teamParams(context, {
      TeamId: args.team,
      OperateType: splitCsv(flags.operation ?? []).length > 0 ? splitCsv(flags.operation ?? []) : null,
      Status: splitCsv(flags.status ?? []).length > 0 ? splitCsv(flags.status ?? []) : null,
      OrderByASC: flags.ascending,
      ...compact(timeParams(flags.start, flags.end)),
    })
    const response = await collectPages(context, 'ListCompShareTeamOperateLog', params, 'Logs', {
      offset: flags.offset,
      limit: flags.all ? null : flags.limit,
    })
    const rows = (response.Logs as Array<Record<string, unknown>>) ?? []
    context.renderer.data(response, {rows, columns: AUDIT_COLUMNS, jsonList: true, metadata: {all: flags.all}})
  }
}
