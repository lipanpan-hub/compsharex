// cps image create: 从实例创建自定义镜像

import {Flags} from '@oclif/core'
import {setTimeout as delay} from 'node:timers/promises'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {confirm} from '../../lib/compshare/confirm.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {locateInstance} from '../../lib/compshare/location.js'
import {compact} from '../../lib/compshare/parsing.js'

// 进度轮询间隔(秒)
const PROGRESS_INTERVAL_SECONDS = 5

export default class ImageCreate extends CompshareBaseCommand {
  static description = '从实例创建自定义镜像'

  static examples = ['<%= config.bin %> <%= command.id %> --instance <ID> --name my-image']

  static flags = {
    ...compshareGlobalFlags,
    instance: Flags.string({required: true, description: '源实例 ID'}),
    name: Flags.string({required: true, description: '自定义镜像名称'}),
    description: Flags.string({description: '自定义镜像描述'}),
    wait: Flags.boolean({allowNo: true, description: '等待镜像创建完成(默认交互终端开启)'}),
    timeout: Flags.integer({default: 1800, min: 1, description: '最长等待秒数'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ImageCreate)
    const context = this.compshareContext()
    await confirm(context, `确认从实例 ${flags.instance} 创建自定义镜像 ${flags.name}?`, flags.yes)
    const [region, zone] = await locateInstance(context, flags.instance)
    const params: Record<string, unknown> = CompshareContext.request({
      zone: true,
      regionValue: region,
      zoneValue: zone,
    })
    Object.assign(params, compact({UHostId: flags.instance, Name: flags.name, Description: flags.description}))
    const created = await call(context, 'CreateCompShareCustomImage', params)

    // #region 等待镜像创建完成(非 JSON 且 TTY 默认开启)
    const result: Record<string, unknown> = {operation: created}
    const imageId = (created.CompShareImageId as string | undefined) ?? (created.ImageId as string | undefined)
    const isWaitEnabled = flags.wait ?? (!context.jsonOutput && process.stdout.isTTY === true)
    if (isWaitEnabled && imageId) {
      const startedAt = Date.now()
      let previous = ''
      for (;;) {
        const progressParams: Record<string, unknown> = CompshareContext.request({
          zone: true,
          regionValue: region,
          zoneValue: zone,
        })
        progressParams.CompShareImageId = imageId
        const current = await call(context, 'GetCompShareImageCreateProgress', progressParams)
        const status = String(current.Status ?? current.State ?? 'Creating')
        const percent = current.Progress ?? current.Percent
        const display = percent !== undefined && percent !== null ? `${status} (${percent}%)` : status
        if (display !== previous && !context.jsonOutput) {
          process.stdout.write(`等待镜像 ${imageId}: ${display}\n`)
          previous = display
        }
        if (['available', 'done', 'succeeded', 'success'].includes(status.toLowerCase()) || percent === 100) {
          result.final = current
          break
        }
        if (['error', 'failed'].includes(status.toLowerCase())) {
          throw new UsageError(`镜像创建失败: ${status}`)
        }
        if ((Date.now() - startedAt) / 1000 >= flags.timeout) {
          throw new UsageError(`等待镜像 ${imageId} 超过 ${flags.timeout} 秒, 已超时。`)
        }
        await delay(PROGRESS_INTERVAL_SECONDS * 1000)
      }
    }
    // #endregion

    context.renderer.success(`已提交创建镜像 ${flags.name}`, result)
  }
}
