// cps instance job cancel: 取消运行中的持久远程作业

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {confirm} from '../../../lib/compshare/confirm.js'
import {cancelScript, validateJobId} from '../../../lib/compshare/remote-jobs.js'
import {remoteJobRecords, singleJobRecord} from '../../../lib/compshare/ssh-remote.js'

export default class JobCancel extends CompshareBaseCommand {
  static description = '取消运行中的持久远程作业'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID> --force']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    jobId: Args.string({required: true, description: '远程作业 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    force: Flags.boolean({default: false, description: '立即终止远端进程组(KILL)'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobCancel)
    const context = this.compshareContext()
    const selectedId = validateJobId(args.jobId)
    await confirm(context, `取消实例 ${args.instance} 上的远程作业 ${selectedId}?`, flags.yes)
    const job = singleJobRecord(
      await remoteJobRecords(
        context,
        args.instance,
        cancelScript(selectedId, {force: flags.force}),
        selectedId,
      ),
      selectedId,
    )
    context.renderer.success(`已请求取消远程作业 ${selectedId}`, {instance: args.instance, job})
  }
}
