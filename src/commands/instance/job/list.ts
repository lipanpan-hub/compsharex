// cps instance job list: 列出实例上的持久远程作业

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {JOB_STATES, listScript} from '../../../lib/compshare/remote-jobs.js'
import {JOB_COLUMNS, remoteJobRecords} from '../../../lib/compshare/ssh-remote.js'

export default class JobList extends CompshareBaseCommand {
  static description = '列出实例上的持久远程作业'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --state Running']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    state: Flags.string({description: '按作业状态过滤'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobList)
    const context = this.compshareContext()
    let requestedState: string | undefined
    if (flags.state) {
      requestedState = flags.state.trim().toLowerCase()
      const validStates = JOB_STATES.map((value) => value.toLowerCase())
      if (!validStates.includes(requestedState)) {
        throw new UsageError(`--state 必须为以下之一: ${[...JOB_STATES].sort().join(', ')}。`)
      }
    }
    const jobs = await remoteJobRecords(context, args.instance, listScript())
    // 按 CreatedTime 倒序(最新在前), 缺失时间按 0 处理
    jobs.sort((first, second) => (Number(second.CreatedTime ?? 0) || 0) - (Number(first.CreatedTime ?? 0) || 0))
    const filtered = requestedState
      ? jobs.filter((job) => String(job.State ?? '').toLowerCase() === requestedState)
      : jobs
    for (const job of filtered) {
      delete job.Command
      delete job.Existing
    }
    context.renderer.data(
      {instance: args.instance, JobSet: filtered, TotalCount: filtered.length},
      {rows: filtered, columns: JOB_COLUMNS, jsonList: true, metadata: {instance: args.instance}},
    )
  }
}
