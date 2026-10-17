// cps llm indextts create: 调用 IndexTTS-2 将文本合成为语音(/v1/audio/speech, OpenAI 兼容)

import {Args, Flags} from '@oclif/core'
import {writeFileSync} from 'node:fs'
import {resolve as resolvePath} from 'node:path'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {
  INDEX_TTS_MODEL,
  emotionVectorValues,
  validateEmotionControlMethod,
  validateEmotionWeight,
  validateGain,
  validateSpeed,
  validateSynthesisText,
} from '../../../lib/compshare/llm-indextts-helpers.js'
import {floatFlag} from '../../../lib/compshare/minimax-helpers.js'
import {ModelverseClient} from '../../../lib/compshare/modelverse-api.js'

// 语音合成下载超时(单次 600 字符合成通常在数秒到数十秒)
const SYNTHESIS_TIMEOUT_MS = 120_000

export default class LlmIndexttsCreate extends CompshareBaseCommand {
  static aliases = ['llm:indextts:create', 'llm:indextts:new', 'li:create', 'li:new', 'li:tts']
  static description = '调用 IndexTTS-2 将文本合成为语音并保存为 WAV 文件'

  static examples = [
    '<%= config.bin %> <%= command.id %> "你好, 欢迎使用优云智算语音合成" -o speech.wav',
    '<%= config.bin %> <%= command.id %> "激动人心的消息" --emoControlMethod 3 --emoText 激动 --emoWeight 0.6',
  ]

  static args = {
    input: Args.string({required: true, description: '合成文本, 最多 600 字符'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    output: Flags.string({char: 'o', default: 'speech.wav', description: '输出 WAV 文件路径'}),
    model: Flags.string({default: INDEX_TTS_MODEL, description: 'TTS 模型名称'}),
    voice: Flags.string({
      default: 'jack_cheng',
      description: '内置音色名或自定义音色 ID(uspeech:*), 可用 llm indextts voices 查询',
    }),
    speed: floatFlag({default: 1, description: '语速 (0.25-4.0)'}),
    instructions: Flags.string({description: '音色风格描述文本(OpenAI 基础字段)'}),
    // #region IndexTTS 扩展参数(仅优云智算平台对 IndexTTS 系列模型生效)
    sampleRate: Flags.integer({description: '输出采样率 Hz, 如 22050/44100/48000'}),
    gain: floatFlag({description: '音量增益系数 ((0, 10], 0 为静音)'}),
    emoControlMethod: Flags.integer({description: '情感控制方式: 0 无/2 情感向量/3 情感文本'}),
    emoWeight: floatFlag({description: '情感权重 (0-1), 文本情感模式建议 0.6'}),
    emoVec: Flags.string({description: '八个逗号分隔的情感值 [高兴,生气,悲伤,害怕,厌恶,忧郁,惊讶,平静]'}),
    emoText: Flags.string({description: '情感文本描述, 如 "愉快"'}),
    emoRandom: Flags.boolean({allowNo: true, description: '是否引入情感随机性'}),
    intervalSilence: Flags.integer({description: '句间静音时长(毫秒), 建议 200'}),
    maxTextTokensPerSentence: Flags.integer({description: '单句切分最大 token 数, 建议 120'}),
    // #endregion
    dryRun: Flags.boolean({default: false, description: '只展示请求, 不调用接口'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(LlmIndexttsCreate)
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
    if (flags.emoWeight !== undefined) {
      validateEmotionWeight(flags.emoWeight, '情感权重')
    }
    // #endregion

    // #region 请求体组装(基础字段 + 仅收集显式提供的扩展字段)
    const payload: Record<string, unknown> = {
      model: flags.model,
      input: args.input,
      voice: flags.voice,
      speed: flags.speed,
    }
    if (flags.instructions) {
      payload.instructions = flags.instructions
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
    if (flags.emoWeight !== undefined) {
      payload.emo_weight = flags.emoWeight
    }
    if (flags.emoVec) {
      payload.emo_vec = emotionVectorValues(flags.emoVec)
    }
    if (flags.emoText) {
      payload.emo_text = flags.emoText
    }
    if (flags.emoRandom !== undefined) {
      payload.emo_random = flags.emoRandom
    }
    if (flags.intervalSilence !== undefined) {
      payload.interval_silence = flags.intervalSilence
    }
    if (flags.maxTextTokensPerSentence !== undefined) {
      payload.max_text_tokens_per_sentence = flags.maxTextTokensPerSentence
    }
    // #endregion

    // #region 试运行: 展示请求体后返回
    if (flags.dryRun) {
      context.renderer.details(
        '语音合成计划(试运行)',
        [
          ['MODEL', flags.model],
          ['VOICE', flags.voice],
          ['TEXT LENGTH', args.input.length],
          ['OUTPUT', resolvePath(flags.output)],
        ],
        {dry_run: true, endpoint: '/v1/audio/speech', request: payload},
      )
      return
    }
    // #endregion

    // #region 调用接口并写入 WAV 文件
    const audioBytes = await client.download('POST', '/audio/speech', {
      body: payload,
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
    })
    const outputPath = resolvePath(flags.output)
    writeFileSync(outputPath, audioBytes)
    // #endregion

    context.renderer.details(
      '语音合成完成',
      [
        ['OUTPUT', outputPath],
        ['SIZE', `${audioBytes.length} 字节`],
        ['MODEL', flags.model],
        ['VOICE', flags.voice],
      ],
      {output: outputPath, bytes: audioBytes.length, model: flags.model, voice: flags.voice},
    )
  }
}
