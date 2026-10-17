// cps minimax audio create: 创建 IndexTTS 2.5 语音任务

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient, newIdempotencyKey} from '../../../lib/compshare/minimax-api.js'
import {
  AUDIO_LANGUAGES,
  MINIMAX_AUDIO_PATH,
  emotionValues,
  floatFlag,
  pronunciationRules,
  selectVoiceIdInteractively,
  submitTask,
} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxAudioCreate extends CompshareBaseCommand {
  static aliases = ['mm:audio:create', 'mm:audio:new', 'ma:create', 'ma:new', 'ma:tts']
  static description = '创建 IndexTTS 2.5 语音任务'

  static examples = ['<%= config.bin %> <%= command.id %> "你好, 欢迎" --voice-id <VOICE_ID>']

  static args = {
    text: Args.string({required: true, description: '语音文本, 最多 2000 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    voiceSource: Flags.string({default: 'preset', description: 'preset、custom 或 asset'}),
    voiceId: Flags.string({description: '预置或自定义音色 ID, 省略时从音色列表交互选择'}),
    assetId: Flags.string({description: '已注册的引用音频资产 ID'}),
    language: Flags.string({default: 'ZH', description: 'ZH/EN/JA/ES/AR'}),
    speed: floatFlag({default: 1, description: '语速 (0 或 0.5-2.0)'}),
    autoEmotion: Flags.boolean({allowNo: true, default: true, description: '自动情感控制'}),
    emotionDescription: Flags.string({description: '情感描述'}),
    emotionStrength: floatFlag({default: 0.8, description: '情感强度 (0-1)'}),
    emotionVector: Flags.string({description: '八个逗号分隔的情感值'}),
    emotionVectorMode: Flags.string({description: 'single 或 mixed'}),
    pronunciation: Flags.string({multiple: true, description: '发音规则 WORD:KIND:VALUE, 可重复'}),
    saveVoice: Flags.boolean({default: false, description: '将资产保存为自定义音色'}),
    voiceName: Flags.string({description: '保存的自定义音色名称'}),
    idempotencyKey: Flags.string({description: '幂等键'}),
    dryRun: Flags.boolean({default: false, description: '只展示请求'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxAudioCreate)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version, context.profile.minimaxApiKey)
    // \p{L}\p{N} 匹配任意 Unicode 字母或数字, 包含中文; 旧正则 [^\W_] 因 \w 不含中文而误拒中文文本
    if (args.text.length > 2000 || !/[\p{L}\p{N}]/u.test(args.text)) {
      throw new UsageError('语音文本必须包含 1-2000 个字母或数字字符。')
    }
    if (!AUDIO_LANGUAGES.has(flags.language)) {
      throw new UsageError(`不支持的语音语言: ${flags.language}。`)
    }
    if (!Number.isFinite(flags.speed) || (flags.speed !== 0 && !(flags.speed >= 0.5 && flags.speed <= 2))) {
      throw new UsageError('语速必须为 0 或介于 0.5 与 2.0 之间。')
    }
    if (!Number.isFinite(flags.emotionStrength) || !(flags.emotionStrength >= 0 && flags.emotionStrength <= 1)) {
      throw new UsageError('情感强度必须介于 0 与 1 之间。')
    }
    if (!['asset', 'custom', 'preset'].includes(flags.voiceSource)) {
      throw new UsageError('音色来源必须是 preset、custom 或 asset。')
    }

    // #region 音色来源约束校验
    let voice: Record<string, unknown>
    if (flags.voiceSource === 'asset') {
      if (!flags.assetId || flags.voiceId) {
        throw new UsageError('asset 音色来源需要提供 --asset-id 且不能提供 --voice-id。')
      }
      voice = {source: 'asset', asset_id: flags.assetId}
    } else {
      if (flags.assetId) {
        throw new UsageError('preset 或 custom 音色来源不能提供 --asset-id。')
      }
      // 未显式提供 --voice-id 时, 拉取同类型音色列表交互式单选
      const voiceId = flags.voiceId ?? (await selectVoiceIdInteractively(client, flags.voiceSource))
      voice = {source: flags.voiceSource, voice_id: voiceId}
    }
    if (flags.saveVoice && (flags.voiceSource !== 'asset' || !flags.voiceName || !(flags.voiceName.trim().length > 0 && flags.voiceName.trim().length <= 64))) {
      throw new UsageError('--save-voice 需要 asset 音色来源和 1-64 字符的名称。')
    }
    if (flags.voiceName && !flags.saveVoice) {
      throw new UsageError('--voice-name 需要同时提供 --save-voice。')
    }
    // #endregion

    if (flags.emotionDescription && flags.emotionDescription.length > 200) {
      throw new UsageError('情感描述不能超过 200 个字符。')
    }
    if (flags.emotionVectorMode && !['mixed', 'single'].includes(flags.emotionVectorMode)) {
      throw new UsageError('情感向量模式必须是 single 或 mixed。')
    }
    if (flags.emotionVectorMode && !flags.emotionVector) {
      throw new UsageError('情感向量模式需要同时提供 --emotion-vector。')
    }
    if (flags.emotionVector && (flags.autoEmotion || flags.emotionDescription)) {
      throw new UsageError('情感向量需要 --no-auto-emotion 且不能提供情感描述。')
    }

    const payload: Record<string, unknown> = {
      text: args.text,
      language: flags.language,
      voice,
      speed: flags.speed,
      auto_emotion: flags.autoEmotion,
      emotion_strength: flags.emotionStrength,
    }
    if (flags.emotionDescription) {
      payload.emotion_description = flags.emotionDescription
    }
    if (flags.emotionVector) {
      payload.emotion_vector = emotionValues(flags.emotionVector, flags.emotionVectorMode)
      if (flags.emotionVectorMode) {
        payload.emotion_vector_mode = flags.emotionVectorMode
      }
    }
    if ((flags.pronunciation ?? []).length > 0) {
      payload.pronunciations = pronunciationRules(flags.pronunciation ?? [])
    }
    if (flags.saveVoice) {
      payload.save_voice = true
      payload.voice_name = flags.voiceName ? flags.voiceName.trim() : ''
    }
    await submitTask(
      context,
      client,
      MINIMAX_AUDIO_PATH,
      payload,
      newIdempotencyKey(flags.idempotencyKey),
      flags.dryRun,
      flags.yes,
      [
        ['LANGUAGE', flags.language],
        ['VOICE SOURCE', flags.voiceSource],
        ['TEXT LENGTH', args.text.length],
      ],
    )
  }
}
