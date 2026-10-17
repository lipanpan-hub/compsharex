// cps llm indextts clone: 上传说话人参考音频, 调用 IndexTTS-2 声音克隆合成(/v1/audio/infer, multipart)

import {Args, Flags} from '@oclif/core'
import {writeFileSync} from 'node:fs'
import {resolve as resolvePath} from 'node:path'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {
  INDEX_TTS_MODEL,
  emotionVectorValues,
  readAudioReferenceFile,
  validateEmotionControlMethod,
  validateEmotionWeight,
  validateGain,
  validateSpeed,
  validateSynthesisText,
} from '../../../lib/compshare/llm-indextts-helpers.js'
import {floatFlag} from '../../../lib/compshare/minimax-helpers.js'
import {ModelverseClient} from '../../../lib/compshare/modelverse-api.js'

// 克隆合成含音频上传与推理, 超时放宽
const SYNTHESIS_TIMEOUT_MS = 180_000

export default class LlmIndexttsClone extends CompshareBaseCommand {
  static aliases = ['llm:indextts:clone', 'li:clone']
  static description = '上传说话人参考音频, 调用 IndexTTS-2 克隆音色合成语音'

  static examples = [
    '<%= config.bin %> <%= command.id %> "酒楼丧尽天良, 开始借机竞拍房间" --spkAudio speaker.wav -o clone.wav',
    '<%= config.bin %> <%= command.id %> "哎, 一群蠢货" --spkAudio speaker.wav --emoAudio emo_sad.wav --emoControlMethod 1 --emoWeight 0.8',
  ]

  static args = {
    input: Args.string({required: true, description: '合成文本, 最多 600 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    spkAudio: Flags.string({required: true, description: '说话人参考音频文件(MP3/WAV, ≤20MB, 5-30 秒)'}),
    emoAudio: Flags.string({description: '情感参考音频文件(MP3/WAV, ≤20MB), 搭配 --emoControlMethod 1'}),
    output: Flags.string({char: 'o', default: 'clone.wav', description: '输出 WAV 文件路径'}),
    model: Flags.string({default: INDEX_TTS_MODEL, description: 'TTS 模型名称'}),
    speed: floatFlag({default: 1, description: '语速 (0.25-4.0)'}),
    // #region payload 配置参数(infer 接口, 与 speech 扩展字段命名略有差异)
    sampleRate: Flags.integer({description: '输出采样率 Hz, 如 22050/44100/48000'}),
    gain: floatFlag({description: '音量增益系数 ((0, 10], 0 为静音)'}),
    emoControlMethod: Flags.integer({
      description: '情感控制方式: 0 无/1 情感音频(需 --emoAudio)/2 情感向量/3 情感文本',
    }),
    emoAlpha: floatFlag({description: '情感融合权重 (0-1)'}),
    emoVec: Flags.string({description: '八个逗号分隔的情感值 [高兴,生气,悲伤,害怕,厌恶,忧郁,惊讶,平静]'}),
    emoText: Flags.string({description: '情感文本描述, 如 "愉快"'}),
    useRandom: Flags.boolean({allowNo: true, description: '是否引入情感随机性'}),
    intervalSilence: Flags.integer({description: '句间静音时长(毫秒), 默认 200'}),
    // #endregion
    dryRun: Flags.boolean({default: false, description: '只展示请求计划, 不调用接口'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LlmIndexttsClone)
    const context = this.compshareContext()
    const client = new ModelverseClient(
      context.renderer,
      this.config.version,
      context.profile.llmApiKey,
      context.profile.llmBaseUrl,
    )

    // #region 参数校验
    validateSynthesisText(args.input)
    validateSpeed(flags.speed)
    if (flags.gain !== undefined) {
      validateGain(flags.gain)
    }
    if (flags.emoControlMethod !== undefined) {
      validateEmotionControlMethod(flags.emoControlMethod)
    }
    if (flags.emoAlpha !== undefined) {
      validateEmotionWeight(flags.emoAlpha, '情感融合权重')
    }
    // #endregion

    // #region 参考音频读取(试运行不读取文件, 只展示路径)
    const speakerAudio = flags.dryRun ? null : readAudioReferenceFile(flags.spkAudio)
    const emotionAudio = flags.emoAudio && !flags.dryRun ? readAudioReferenceFile(flags.emoAudio) : null
    // #endregion

    // #region payload 配置组装(仅收集显式提供的字段)
    const payload: Record<string, unknown> = {
      input: args.input,
      speed: flags.speed,
    }
    if (flags.sampleRate !== undefined) {
      payload.sample_rate = flags.sampleRate
    }
    if (flags.gain !== undefined) {
      payload.gain = flags.gain
    }
    if (flags.emoControlMethod !== undefined) {
      payload.emo_control_method = flags.emoControlMethod
    }
    if (flags.emoAlpha !== undefined) {
      payload.emo_alpha = flags.emoAlpha
    }
    if (flags.emoVec) {
      payload.emo_vec = emotionVectorValues(flags.emoVec)
    }
    if (flags.emoText) {
      payload.emo_text = flags.emoText
    }
    if (flags.useRandom !== undefined) {
      payload.use_random = flags.useRandom
    }
    if (flags.intervalSilence !== undefined) {
      payload.interval_silence = flags.intervalSilence
    }
    // #endregion

    // #region 试运行: 展示 multipart 计划后返回
    if (flags.dryRun) {
      context.renderer.details(
        '声音克隆计划(试运行)',
        [
          ['MODEL', flags.model],
          ['SPK AUDIO', flags.spkAudio],
          ['EMO AUDIO', flags.emoAudio ?? '-'],
          ['TEXT LENGTH', args.input.length],
          ['OUTPUT', resolvePath(flags.output)],
        ],
        {dry_run: true, endpoint: '/v1/audio/infer', payload},
      )
      return
    }
    // #endregion

    // #region 组装 multipart 表单并调用接口
    const form = new FormData()
    form.append('model', flags.model)
    if (speakerAudio) {
      form.append(
        'spk_audio_file',
        new Blob([new Uint8Array(speakerAudio.bytes)], {type: speakerAudio.contentType}),
        speakerAudio.fileName,
      )
    }
    if (emotionAudio) {
      form.append(
        'emo_audio_file',
        new Blob([new Uint8Array(emotionAudio.bytes)], {type: emotionAudio.contentType}),
        emotionAudio.fileName,
      )
    }
    form.append('payload', JSON.stringify(payload))
    const audioBytes = await client.download('POST', '/audio/infer', {
      form,
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
    })
    // #endregion

    // #region 写入 WAV 文件并输出结果
    const outputPath = resolvePath(flags.output)
    writeFileSync(outputPath, audioBytes)
    context.renderer.details(
      '声音克隆完成',
      [
        ['OUTPUT', outputPath],
        ['SIZE', `${audioBytes.length} 字节`],
        ['MODEL', flags.model],
        ['SPK AUDIO', flags.spkAudio],
      ],
      {output: outputPath, bytes: audioBytes.length, model: flags.model},
    )
    // #endregion
  }
}
