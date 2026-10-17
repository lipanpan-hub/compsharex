// llm indextts 命令组共享工具(IndexTTS-2 参数校验 / 参考音频读取 / 请求体组装)

import {readFileSync, statSync} from 'node:fs'

import {UsageError} from './errors.js'

// IndexTTS-2 默认模型名(可在命令中覆盖)
export const INDEX_TTS_MODEL = 'IndexTeam/IndexTTS-2'

// /v1/audio/speech 内置音色(自定义音色为 uspeech:* 形式的 ID, 不在此列)
export const INDEX_TTS_VOICES = new Set([
  'crystla_liu',
  'entertain',
  'jack_cheng',
  'mkas',
  'movie',
  'novel',
  'sales_voice',
  'stephen_chow',
  'xiaoyueyue',
])

// 参考音频约束(与文档一致: MP3/WAV, 单个 ≤ 20MB)
export const AUDIO_REFERENCE_SIZE_LIMIT = 20 * 1024 * 1024
export const AUDIO_REFERENCE_MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
}

// 合成文本上限(IndexTTS-2 单次 600 字符)
export const INDEX_TTS_TEXT_LIMIT = 600

// #region 参数校验
// 校验合成文本(必须包含 1-600 个字符, 且至少含一个 Unicode 字母或数字)
export function validateSynthesisText(text: string): void {
  // \p{L}\p{N} 匹配任意 Unicode 字母或数字, 包含中文
  if (text.length > INDEX_TTS_TEXT_LIMIT || !/[\p{L}\p{N}]/u.test(text)) {
    throw new UsageError(`合成文本必须包含 1-${INDEX_TTS_TEXT_LIMIT} 个字符, 且至少含一个字母或数字。`)
  }
}

// 校验语速(0.25-4.0)
export function validateSpeed(speed: number): void {
  if (!Number.isFinite(speed) || !(speed >= 0.25 && speed <= 4)) {
    throw new UsageError('语速必须介于 0.25 与 4.0 之间。')
  }
}

// 校验音量增益((0, 10], 0 为静音)
export function validateGain(gain: number): void {
  if (!Number.isFinite(gain) || !(gain > 0 && gain <= 10)) {
    throw new UsageError('音量增益必须大于 0 且不超过 10。')
  }
}

// 校验情感权重/融合度(0-1)
export function validateEmotionWeight(weight: number, label: string): void {
  if (!Number.isFinite(weight) || !(weight >= 0 && weight <= 1)) {
    throw new UsageError(`${label}必须介于 0 与 1 之间。`)
  }
}

// 校验情感控制方式(0 无/1 情感音频/2 情感向量/3 情感文本)
export function validateEmotionControlMethod(method: number): void {
  if (!Number.isInteger(method) || ![0, 1, 2, 3].includes(method)) {
    throw new UsageError('情感控制方式必须是 0、1、2 或 3。')
  }
}

// 校验并解析八元情感向量(每个维度 0-1.2, 总和不超过 1.5)
export function emotionVectorValues(raw: string): number[] {
  const values = raw.split(',').map((part) => {
    const value = Number(part.trim())
    return Number.isFinite(value) ? value : Number.NaN
  })
  if (values.some((value) => Number.isNaN(value))) {
    throw new UsageError('情感向量必须包含八个数字。')
  }
  // (value >= 0 && value <= 1.2) 逐项校验取值范围
  if (values.length !== 8 || values.some((value) => !(value >= 0 && value <= 1.2))) {
    throw new UsageError('情感向量必须包含八个介于 0 与 1.2 之间的值。')
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!(total <= 1.5)) {
    throw new UsageError('情感向量所有维度之和不能超过 1.5。')
  }
  return values
}
// #endregion

// #region 参考音频读取
// 读取本地参考音频并校验大小, 返回 multipart 上传所需信息
export function readAudioReferenceFile(filePath: string): {bytes: Buffer; contentType: string; fileName: string} {
  let size: number
  try {
    size = statSync(filePath).size
  } catch (error) {
    throw new UsageError(`无法读取音频文件: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (size <= 0 || size > AUDIO_REFERENCE_SIZE_LIMIT) {
    throw new UsageError(`音频文件大小必须在 1 到 ${AUDIO_REFERENCE_SIZE_LIMIT} 字节之间(≤20MB)。`)
  }
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  const contentType = AUDIO_REFERENCE_MIME[extension]
  if (!contentType) {
    throw new UsageError('参考音频仅支持 MP3 或 WAV 格式。')
  }
  return {bytes: readFileSync(filePath), fileName, contentType}
}
// #endregion
