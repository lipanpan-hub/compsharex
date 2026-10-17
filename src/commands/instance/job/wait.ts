// cps instance job wait: 等待持久远程作业结束(超时不取消)

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {SilentExit} from '../../../lib/compshare/errors.js'
import {validateJobId, waitScript} from '../../../lib/compshare/remote-jobs.js'
import {remoteJobRecords, singleJobRecord} from '../../../lib/compshare/ssh-remote.js'

export default class JobWait extends CompshareBaseCommand {
  static description = '等待持久远程作业结束(超时不取消作业)'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID> --timeout 300']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    jobId: Args.string({required: true, description: '远程作业 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    timeout: Flags.integer({default: 300, description: '最长等待秒数'}),
    interval: Flags.integer({default: 2, description: '轮询间隔秒数'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobWait)
    const context = this.compshareContext()
    const selectedId = validateJobId(args.jobId)
    const records = await remoteJobRecords(
      context,
      args.instance,
      waitScript(selectedId, {timeout: flags.timeout, interval: flags.interval}),
      selectedId,
    )
    const job = singleJobRecord(records, selectedId)
    // 第二条记录承载 WaitTimedOut 标记
    const waitStatus = records.length > 1 ? (records[1] as Record<string, unknown>) : {}
    const isTimedOut = Boolean(waitStatus.WaitTimedOut)
    job.WaitTimedOut = isTimedOut
    context.renderer.details(
      '远程作业',
      [
        ['JOB ID', job.JobId],
        ['STATE', job.State],
        ['EXIT CODE', job.ExitCode],
        ['FINISHED TIME', job.FinishedTime],
        ['WAIT TIMED OUT', isTimedOut],
      ],
      {instance: args.instance, job},
    )
    if (isTimedOut) {
      // 124 与 timeout 工具的约定一致
      throw new SilentExit(124)
    }
    if (job.State === 'Succeeded') {
      return
    }
    const exitCode = job.ExitCode
    throw new SilentExit(typeof exitCode === 'number' && exitCode !== 0 ? exitCode : 1)
  }
}
