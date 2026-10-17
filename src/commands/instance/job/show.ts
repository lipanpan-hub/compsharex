// cps instance job show: 查看持久远程作业状态与元数据

import {Args} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {validateJobId, showScript} from '../../../lib/compshare/remote-jobs.js'
import {remoteJobRecords, singleJobRecord} from '../../../lib/compshare/ssh-remote.js'

export default class JobShow extends CompshareBaseCommand {
  static description = '查看持久远程作业状态与元数据'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    jobId: Args.string({required: true, description: '远程作业 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(JobShow)
    const context = this.compshareContext()
    const selectedId = validateJobId(args.jobId)
    const job = singleJobRecord(
      await remoteJobRecords(
        context,
        args.instance,
        showScript(selectedId),
        selectedId,
      ),
      selectedId,
    )
    context.renderer.details(
      '远程作业',
      [
        ['JOB ID', job.JobId],
        ['NAME', job.Name],
        ['STATE', job.State],
        ['PID', job.PID],
        ['EXIT CODE', job.ExitCode],
        ['CREATED TIME', job.CreatedTime],
        ['STARTED TIME', job.StartedTime],
        ['FINISHED TIME', job.FinishedTime],
        ['CWD', job.Cwd],
        ['COMMAND', job.Command],
      ],
      {instance: args.instance, job},
    )
  }
}
