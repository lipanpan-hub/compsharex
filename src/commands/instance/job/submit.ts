// cps instance job submit: 提交持久远程作业并立即返回

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {newJobId, joinedCommand, submitScript, validateJobId} from '../../../lib/compshare/remote-jobs.js'
import {remoteJobRecords, singleJobRecord} from '../../../lib/compshare/ssh-remote.js'

export default class JobSubmit extends CompshareBaseCommand {
  static description = '提交可在断开终端后继续运行的持久远程作业并立即返回'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> -- python train.py --epochs 10']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    remoteCommand: Args.string({multiple: true, description: '远程命令及参数, 使用 -- 分隔选项'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    name: Flags.string({description: '作业名称'}),
    cwd: Flags.string({description: '远程工作目录'}),
    'job-id': Flags.string({description: '客户端生成的幂等 ID, 缺省自动生成'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobSubmit)
    const context = this.compshareContext()
    const selectedId = flags['job-id'] ? validateJobId(flags['job-id']) : newJobId()
    // variadic args 运行时是 string[], 静态类型为 string, 需要断言
    const remoteCommand = (args.remoteCommand as unknown as string[] | undefined) ?? []
    const command = joinedCommand(remoteCommand)
    if (!context.jsonOutput) {
      process.stdout.write(`正在提交远程作业 ${selectedId}...\n`)
    }
    const job = singleJobRecord(
      await remoteJobRecords(
        context,
        args.instance,
        submitScript(selectedId, command, {name: flags.name, cwd: flags.cwd}),
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
        ['CREATED TIME', job.CreatedTime],
      ],
      {instance: args.instance, job},
    )
    if (!context.jsonOutput) {
      const message = job.Existing ? `远程作业 ${selectedId} 已存在` : `已提交远程作业 ${selectedId}`
      process.stdout.write(`✓ ${message}\n`)
    }
  }
}
