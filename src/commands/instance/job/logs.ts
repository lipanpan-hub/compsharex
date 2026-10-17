// cps instance job logs: 读取或跟踪持久远程作业日志

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {SilentExit, UsageError} from '../../../lib/compshare/errors.js'
import {Renderer} from '../../../lib/compshare/output.js'
import {followScript, logsScript, validateJobId} from '../../../lib/compshare/remote-jobs.js'
import {remoteJobRecords, remoteJobStream, singleJobRecord} from '../../../lib/compshare/ssh-remote.js'

export default class JobLogs extends CompshareBaseCommand {
  static description = '读取或跟踪持久远程作业日志'
  static examples = [
    '<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID>',
    '<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID> --follow',
    '<%= config.bin %> <%= command.id %> <INSTANCE_ID> <JOB_ID> --stdout-offset 0 --limit 65536',
  ]

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
    jobId: Args.string({required: true, description: '远程作业 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    tail: Flags.integer({default: 200, description: '尾部行数'}),
    follow: Flags.boolean({char: 'f', default: false, description: '持续跟踪日志直到作业结束'}),
    stream: Flags.string({default: 'all', description: '日志流: all、stdout 或 stderr'}),
    'stdout-offset': Flags.integer({description: '从该字节偏移读取 stdout(替代按行尾读取)'}),
    'stderr-offset': Flags.integer({description: '从该字节偏移读取 stderr(替代按行尾读取)'}),
    limit: Flags.integer({default: 65_536, description: 'offset 模式每个流最多读取的字节数'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(JobLogs)
    const context = this.compshareContext()
    const selectedId = validateJobId(args.jobId)
    const normalizedStream = flags.stream.trim().toLowerCase()
    if (!['all', 'stderr', 'stdout'].includes(normalizedStream)) {
      throw new UsageError('--stream 必须为 all、stdout 或 stderr。')
    }

    // #region follow 模式: 远端 tail -F 直通输出

    if (flags.follow) {
      if (context.jsonOutput) {
        throw new UsageError('JSON 模式不支持 --follow, 请改用字节偏移轮询日志。')
      }
      throw new SilentExit(
        await remoteJobStream(
          context,
          args.instance,
          followScript(selectedId, {tail: flags.tail, stream: normalizedStream}),
        ),
      )
    }

    // #endregion

    // #region 拉取日志记录

    const isOffsetMode = flags['stdout-offset'] !== undefined || flags['stderr-offset'] !== undefined
    const logRecord = singleJobRecord(
      await remoteJobRecords(
        context,
        args.instance,
        logsScript(selectedId, {
          tail: isOffsetMode ? null : flags.tail,
          stdoutOffset: flags['stdout-offset'],
          stderrOffset: flags['stderr-offset'],
          limit: flags.limit,
        }),
        selectedId,
      ),
      selectedId,
    )
    // 单流模式删除另一条流的字段
    if (normalizedStream === 'stdout') {
      for (const key of Object.keys(logRecord)) {
        if (key.startsWith('Stderr')) {
          delete logRecord[key]
        }
      }
    } else if (normalizedStream === 'stderr') {
      for (const key of Object.keys(logRecord)) {
        if (key.startsWith('Stdout')) {
          delete logRecord[key]
        }
      }
    }

    // #endregion

    // #region 输出

    if (context.jsonOutput) {
      new Renderer(true, context.showSensitive).data({
        instance: args.instance,
        job_id: selectedId,
        logs: logRecord,
      })
      return
    }
    process.stdout.write(`远程作业 ${selectedId} 日志 (${String(logRecord.State ?? '')})\n`)
    if ('Stdout' in logRecord) {
      process.stdout.write('==> stdout <==\n')
      process.stdout.write(`${String(logRecord.Stdout ?? '')}\n`)
    }
    if ('Stderr' in logRecord) {
      process.stdout.write('==> stderr <==\n')
      process.stdout.write(`${String(logRecord.Stderr ?? '')}\n`)
    }

    // #endregion
  }
}
