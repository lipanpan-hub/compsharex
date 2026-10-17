// cps llm indextts voice-create: 上传自定义音色(/v1/audio/voice/upload, multipart, 7 天有效期)

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {INDEX_TTS_MODEL, readAudioReferenceFile} from '../../../lib/compshare/llm-indextts-helpers.js'
import {ModelverseClient} from '../../../lib/compshare/modelverse-api.js'

export default class LlmIndexttsVoiceCreate extends CompshareBaseCommand {
  static aliases = ['llm:indextts:voice-create', 'li:voice-create', 'li:vc']
  static description = '上传示例音频创建自定义音色, 返回 voice ID(7 天后自动清理)'

  static examples = [
    '<%= config.bin %> <%= command.id %> 温柔女声 --speakerFile speaker.wav',
    '<%= config.bin %> <%= command.id %> 客服音色A --speakerFile speaker.wav --emotionFile emotion.wav',
  ]

  static args = {
    name: Args.string({required: true, description: '音色名称, 用于列表展示'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    model: Flags.string({default: INDEX_TTS_MODEL, description: '使用该音色的 TTS 模型名称'}),
    // #region Speaker 音色语料(三选一必填, 优先级 file > base64 > url)
    speakerFile: Flags.string({description: '本地音色语料音频文件(MP3/WAV, ≤20MB, 5-30 秒)'}),
    speakerBase64: Flags.string({description: '音色语料音频的 Base64 字符串'}),
    speakerUrl: Flags.string({description: '音色语料音频的公网 URL'}),
    // #endregion
    // #region Emotion 情绪样例(三选一可选, 优先级 file > base64 > url)
    emotionFile: Flags.string({description: '本地情绪样例音频文件(MP3/WAV, ≤20MB, 5-30 秒)'}),
    emotionBase64: Flags.string({description: '情绪样例音频的 Base64 字符串'}),
    emotionUrl: Flags.string({description: '情绪样例音频的公网 URL'}),
    // #endregion
    dryRun: Flags.boolean({default: false, description: '只展示请求计划, 不调用接口'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LlmIndexttsVoiceCreate)
    const context = this.compshareContext()
    const client = new ModelverseClient(
      context.renderer,
      this.config.version,
      context.profile.llmApiKey,
      context.profile.llmBaseUrl,
    )

    // #region 参数校验: 名称与 Speaker 三选一
    const voiceName = args.name.trim()
    if (!(voiceName.length > 0 && voiceName.length <= 64)) {
      throw new UsageError('音色名称必须包含 1-64 个字符。')
    }
    const hasSpeakerInput = Boolean(flags.speakerFile || flags.speakerBase64 || flags.speakerUrl)
    if (!hasSpeakerInput) {
      throw new UsageError('必须提供音色语料之一: --speakerFile、--speakerBase64 或 --speakerUrl。')
    }
    // #endregion

    // #region multipart 表单组装(按文档优先级 file > base64 > url 各取其一)
    if (flags.dryRun) {
      context.renderer.details(
        '创建音色计划(试运行)',
        [
          ['VOICE NAME', voiceName],
          ['MODEL', flags.model],
          ['SPEAKER', flags.speakerFile ?? flags.speakerUrl ?? '(base64)'],
          ['EMOTION', flags.emotionFile ?? flags.emotionUrl ?? (flags.emotionBase64 ? '(base64)' : '-')],
        ],
        {
          dry_run: true,
          endpoint: '/v1/audio/voice/upload',
          request: {name: voiceName, model: flags.model},
        },
      )
      return
    }
    const form = new FormData()
    form.append('name', voiceName)
    form.append('model', flags.model)
    if (flags.speakerFile) {
      const speakerAudio = readAudioReferenceFile(flags.speakerFile)
      form.append(
        'speaker_file',
        new Blob([new Uint8Array(speakerAudio.bytes)], {type: speakerAudio.contentType}),
        speakerAudio.fileName,
      )
    } else if (flags.speakerBase64) {
      form.append('speaker_file_base64', flags.speakerBase64)
    } else {
      form.append('speaker_url', flags.speakerUrl ?? '')
    }
    if (flags.emotionFile) {
      const emotionAudio = readAudioReferenceFile(flags.emotionFile)
      form.append(
        'emotion_file',
        new Blob([new Uint8Array(emotionAudio.bytes)], {type: emotionAudio.contentType}),
        emotionAudio.fileName,
      )
    } else if (flags.emotionBase64) {
      form.append('emotion_file_base64', flags.emotionBase64)
    } else if (flags.emotionUrl) {
      form.append('emotion_url', flags.emotionUrl)
    }
    // #endregion

    const response = await client.request('POST', '/audio/voice/upload', {form, timeoutMs: 120_000})
    context.renderer.details(
      '自定义音色已创建(7 天后自动清理)',
      [
        ['VOICE ID', response.id],
        ['VOICE NAME', voiceName],
      ],
      response,
    )
  }
}
