// cps image show: 查看镜像详情

import {Args, Flags} from '@oclif/core'

import {call} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {communityRows, imageSource} from '../../lib/compshare/image-helpers.js'

export default class ImageShow extends CompshareBaseCommand {
  static description = '查看镜像详情'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID>']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    source: Flags.string({default: 'platform', description: '镜像来源'}),
    region: Flags.string({description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageShow)
    const context = this.compshareContext()
    const source = flags.source.toLowerCase()
    if (!['community', 'custom', 'platform', 'published', 'shared'].includes(source)) {
      throw new UsageError(`镜像来源 ${source} 不支持按 ID 查询。`)
    }
    const {action} = imageSource(source)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    params.CompShareImageId = args.image
    const response = await call(context, action, params)

    // #region 定位目标镜像行
    const rows =
      source === 'community' || source === 'published'
        ? communityRows(response)
        : ((response.ImageSet as Array<Record<string, unknown>>) ?? [])
    const item = rows.find((row) => row.CompShareImageId === args.image) ?? rows[0]
    if (!item) {
      throw new UsageError(`未找到镜像 ${args.image}。`)
    }
    // #endregion

    context.renderer.details(
      '镜像详情',
      [
        ['ID', item.CompShareImageId],
        ['NAME', item.Name],
        ['TYPE', item.ImageType],
        ['STATUS', item.Status],
        ['AUTHOR', item.Author],
        ['VERSION', item.VersionName],
        ['TAGS', item.Tags],
        ['PRICE/H', item.Price],
        ['DESCRIPTION', item.Description],
      ],
      {
        Action: response.Action,
        RetCode: response.RetCode,
        request_uuid: response.request_uuid,
        source,
        image: item,
      },
    )
  }
}
