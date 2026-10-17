// cps minimax audio upload: 上传并注册引用音频

import {Args, Flags} from '@oclif/core'
import {extname} from 'node:path'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {AUDIO_MIME, uploadAsset} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioUpload extends CompshareBaseCommand {
  static aliases = ['mm:audio:upload']
  static description = '上传并注册引用音频'

  static examples = ['<%= config.bin %> <%= command.id %> ref.wav --duration-ms 3000']

  static args = {
    file: Args.string({required: true, description: '音频文件路径 (WAV/MP3/FLAC/OGG/M4A)'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    durationMs: Flags.integer({required: true, min: 500, max: 15_000, description: '实际时长, 单位毫秒'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioUpload)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    const fileName = args.file.split(/[\\/]/).pop() ?? args.file
    if (fileName.length > 255) {
      throw new UsageError('音频文件名不能超过 255 个字符。')
    }
    const contentType = AUDIO_MIME[extname(args.file).toLowerCase()]
    if (!contentType) {
      throw new UsageError('音频文件必须是 WAV、MP3、FLAC、OGG 或 M4A 格式。')
    }
    await uploadAsset(
      context,
      client,
      'audio',
      args.file,
      contentType,
      15 * 1024 * 1024,
      {duration_ms: flags.durationMs},
      flags.yes,
    )
  }
}
