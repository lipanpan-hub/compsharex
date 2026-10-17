// cps team billing export: 导出团队订单为 CSV 文件

import {Args, Flags} from '@oclif/core'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'

import {downloadFile} from '../../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {compact, splitCsv} from '../../../lib/compshare/parsing.js'
import {teamParams, timeParams} from '../../../lib/compshare/team-helpers.js'

export default class BillingExport extends CompshareBaseCommand {
  static aliases = ['tm:billing:export']
  static description = '导出团队订单为 CSV 文件'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> --output orders.csv']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    output: Flags.string({required: true, description: '目标 CSV 文件路径'}),
    member: Flags.integer({default: 0, min: 0, description: '虚拟成员 ID, 0 表示全部'}),
    start: Flags.string({description: '开始时间或过去时长'}),
    end: Flags.string({description: '结束时间'}),
    status: Flags.string({multiple: true, description: '订单状态, 可重复'}),
    force: Flags.boolean({default: false, description: '覆盖已存在的目标文件'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BillingExport)
    const context = this.compshareContext()
    const outputPath = resolve(flags.output)
    if (existsSync(outputPath) && !flags.force) {
      throw new UsageError(`目标文件已存在: ${outputPath}。使用 --force 覆盖。`)
    }

    const params = teamParams(context, {
      TeamId: args.team,
      VirtualCompanyId: flags.member,
      OrderStates: splitCsv(flags.status ?? []).length > 0 ? splitCsv(flags.status ?? []) : null,
      ...compact(timeParams(flags.start, flags.end)),
    })
    const {bytes, headers} = await downloadFile(context, 'DownloadTeamOrder', params)
    try {
      mkdirSync(dirname(outputPath), {recursive: true})
      writeFileSync(outputPath, bytes)
    } catch (error) {
      throw new UsageError(`无法写入文件 ${outputPath}: ${String(error)}`)
    }
    const result = {path: outputPath, bytes: bytes.length, content_type: headers['Content-Type']}
    context.renderer.details(
      '导出完成',
      [
        ['PATH', result.path],
        ['SIZE', result.bytes],
      ],
      result,
    )
  }
}
