// 操作确认交互(移植自 compshare_cli/commands/common.py 的 confirm/confirm_details)

import {confirm as promptConfirm} from '@inquirer/prompts'

import type {CompshareContext} from './context.js'
import {UsageError} from './errors.js'
import {Renderer} from './output.js'

// 危险操作确认; JSON 模式禁止交互, 必须传 --yes
export async function confirm(context: CompshareContext, message: string, yes: boolean): Promise<void> {
  if (yes) {
    return
  }
  if (context.jsonOutput) {
    throw new UsageError('JSON 模式无法进行交互确认, 请传入 --yes 确认操作。')
  }
  const answer = await promptConfirm({
    message: `${message}`,
    default: false,
  })
  if (!answer) {
    // 用户拒绝即中止
    throw new UsageError('操作已取消。')
  }
}

// 先展示操作要点再确认
export async function confirmDetails(
  context: CompshareContext,
  title: string,
  fields: Array<[string, unknown]>,
  message: string,
  yes: boolean,
): Promise<void> {
  if (!context.jsonOutput) {
    new Renderer(false, context.showSensitive).details(title, fields)
  }
  await confirm(context, message, yes)
}
