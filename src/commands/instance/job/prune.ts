// cps instance job prune: 清理已结束的旧远程作业记录与日志

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {durationSeconds} from '../../../lib/compshare/parsing.js'
import {Renderer} from '../../../lib/compshare/output.js'
import {pruneScript} from '../../../lib/compshare/remote-jobs.js'
import {JOB_COLUMNS, remoteJobRecords} from '../../../lib/compshare/ssh-remote.js'

export default class JobPrune extends CompshareBaseCommand {
  static description = '清理已结束的旧远程作业记录与日志'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --older-than 7d --dry-run']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    'older-than': Flags.string({default: '7d', description: '清理已结束超过该时长的作业, 例如 12h 或 7d'}),
    'dry-run': Flags.boolean({default: false, description: '仅列出将清理的作业, 不实际删除'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobPrune)
    const context = this.compshareContext()
    const olderThanSeconds = durationSeconds(flags['older-than'])
    if (!flags['dry-run']) {
      await confirm(
        context,
        `移除实例 ${args.instance} 上已结束超过 ${flags['older-than']} 的远程作业?`,
        flags.yes,
      )
    }
    const jobs = await remoteJobRecords(
      context,
      args.instance,
      pruneScript({olderThan: olderThanSeconds, delete: !flags['dry-run']}),
    )
    const response = {
      instance: args.instance,
      dry_run: flags['dry-run'],
      JobSet: jobs,
      TotalCount: jobs.length,
    }
    if (context.jsonOutput || flags['dry-run']) {
      context.renderer.data(response, {rows: jobs, columns: JOB_COLUMNS})
    } else {
      new Renderer(false, context.showSensitive).success(`已移除 ${jobs.length} 个远程作业`, response)
    }
  }
}
