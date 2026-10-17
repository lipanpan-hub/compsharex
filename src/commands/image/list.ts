// cps image list: 列出平台/自定义/社区/共享/已发布镜像

import {Flags} from '@oclif/core'

import {collectPages} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {communityRows, collectPlatformImages, IMAGE_COLUMNS, imageSource} from '../../lib/compshare/image-helpers.js'
import {compact, splitCsv} from '../../lib/compshare/parsing.js'

// 各镜像来源支持的过滤参数集合
const ALLOWED_FILTERS: Record<string, ReadonlySet<string>> = {
  platform: new Set(['Author', 'CompShareImageId', 'ImageType', 'Name', 'Tag']),
  custom: new Set(['CompShareImageId']),
  community: new Set([
    'Author',
    'CompShareImageId',
    'FuzzySearch',
    'GroupId',
    'IfAutoStart',
    'IsFree',
    'IsOfficial',
    'Name',
    'SortCondition',
    'Tag',
  ]),
  shared: new Set(['CompShareImageId']),
  published: new Set([
    'Author',
    'CompShareImageId',
    'FuzzySearch',
    'GroupId',
    'IfAutoStart',
    'IsFree',
    'IsOfficial',
    'Name',
    'SortCondition',
    'Tag',
  ]),
  user: new Set(['TargetTopOrganizationId']),
}

export default class ImageList extends CompshareBaseCommand {
  static aliases = ['img:list', 'img:ls']
  static description = '列出平台/自定义/社区/共享/已发布镜像'

  static examples = ['<%= config.bin %> <%= command.id %> --source community']

  static flags = {
    ...compshareGlobalFlags,
    source: Flags.string({default: 'platform', description: '镜像来源: platform/custom/community/shared/published/user'}),
    id: Flags.string({description: '按镜像 ID 过滤'}),
    group: Flags.string({description: '按版本组 ID 过滤'}),
    name: Flags.string({description: '按镜像名称精确过滤'}),
    author: Flags.string({description: '按镜像作者过滤'}),
    query: Flags.string({description: '按名称或作者模糊搜索'}),
    tag: Flags.string({multiple: true, description: '按标签过滤, 可重复'}),
    type: Flags.string({description: '按镜像类型过滤'}),
    free: Flags.boolean({exclusive: ['paid'], description: '仅看免费社区镜像'}),
    paid: Flags.boolean({description: '仅看付费社区镜像'}),
    official: Flags.boolean({exclusive: ['unofficial'], description: '仅看官方镜像'}),
    unofficial: Flags.boolean({description: '仅看社区作者镜像'}),
    autostart: Flags.boolean({allowNo: true, description: '按是否支持自动启动过滤'}),
    sort: Flags.string({description: '社区镜像排序字段'}),
    ascending: Flags.boolean({default: false, description: '升序排列'}),
    user: Flags.integer({description: '组织 ID(source=user 时必填)'}),
    limit: Flags.integer({default: 20, min: 1, max: 100, description: '返回条数上限'}),
    offset: Flags.integer({default: 0, min: 0, description: '跳过条数'}),
    all: Flags.boolean({default: false, description: '返回全部结果'}),
    region: Flags.string({description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ImageList)
    const context = this.compshareContext()
    const source = flags.source.toLowerCase()
    const {action, listKey, grouped} = imageSource(source)
    if (source === 'user' && flags.user === undefined) {
      throw new UsageError('镜像来源为 user 时必须提供 --user。')
    }

    // #region 构造过滤参数并按来源校验
    const tags = splitCsv(flags.tag ?? [])
    if (source === 'platform' && tags.length > 1) {
      throw new UsageError('平台镜像搜索只支持一个 --tag。')
    }
    const filters = compact({
      CompShareImageId: flags.id,
      GroupId: flags.group,
      Name: flags.name,
      Author: flags.author,
      FuzzySearch: flags.query,
      Tag: source === 'platform' ? (tags[0] ?? null) : (tags.length > 0 ? tags : null),
      ImageType: flags.type,
      IsFree: flags.free === true ? true : (flags.paid === true ? false : undefined),
      IsOfficial: flags.official === true ? true : (flags.unofficial === true ? false : undefined),
      IfAutoStart: flags.autostart,
      SortCondition: flags.sort ? {Field: flags.sort, ASC: flags.ascending} : undefined,
      TargetTopOrganizationId: flags.user,
    })
    const unsupported = Object.keys(filters)
      .filter((key) => !ALLOWED_FILTERS[source].has(key))
      .sort()
    if (unsupported.length > 0) {
      throw new UsageError(`镜像来源 ${source} 不支持参数: ${unsupported.join(', ')}。`)
    }
    // #endregion

    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    Object.assign(params, filters)

    const limit = flags.all ? null : flags.limit
    const response =
      source === 'platform'
        ? await collectPlatformImages(context, params, {offset: flags.offset, limit})
        : await collectPages(
            context,
            action,
            params,
            grouped ? 'CompshareImageGroup' : listKey,
            {offset: flags.offset, limit},
          )
    const rows = grouped ? communityRows(response) : ((response[listKey] as Array<Record<string, unknown>>) ?? [])
    context.renderer.data(response, {
      rows,
      columns: IMAGE_COLUMNS,
      jsonList: true,
      metadata: {source, all: flags.all},
    })
  }
}
