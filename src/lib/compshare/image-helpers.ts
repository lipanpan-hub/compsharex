// image 命令组共享工具(移植自 commands/image.py 内部函数)

import {collectPages} from './api.js'
import {CompshareContext} from './context.js'
import {UsageError} from './errors.js'

// 镜像列表统一列定义
export const IMAGE_COLUMNS = [
  ['CompShareImageId', 'ID'],
  ['Name', 'NAME'],
  ['ImageType', 'TYPE'],
  ['Author', 'AUTHOR'],
  ['Status', 'STATUS'],
  ['Price', 'PRICE/H'],
  ['VersionName', 'VERSION'],
  ['Tags', 'TAGS'],
] as const satisfies readonly (readonly [string, string])[]

// 平台镜像类型集合(未指定类型时跨类型聚合分页)
export const PLATFORM_IMAGE_TYPES = ['System', 'App', 'Game', 'Other'] as const

// 镜像来源 → API 动作/列表键/是否分组
const SOURCE_MAPPING: Record<string, {action: string; grouped: boolean; listKey: string;}> = {
  platform: {action: 'DescribeCompShareImages', listKey: 'ImageSet', grouped: false},
  custom: {action: 'DescribeCompShareCustomImages', listKey: 'ImageSet', grouped: false},
  community: {action: 'DescribeCommunityImages', listKey: 'CompshareImageGroup', grouped: true},
  shared: {action: 'DescribeCompShareSharingImages', listKey: 'ImageSet', grouped: false},
  published: {action: 'DescribeSelfCommunityImages', listKey: 'CompshareImageGroup', grouped: true},
  user: {action: 'DescribeUserCommunityImages', listKey: 'CompshareImageGroup', grouped: true},
}

// 解析镜像来源, 返回 API 动作/列表键/是否分组
export function imageSource(source: string): {action: string; grouped: boolean; listKey: string;} {
  const mapping = SOURCE_MAPPING[source.toLowerCase()]
  if (!mapping) {
    throw new UsageError('--source 必须是 platform、custom、community、shared、published 或 user。')
  }
  return mapping
}

// 展开社区镜像分组为行(缺省继承组名/状态, 无条件覆盖 GroupId)
export function communityRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const groups = (response.CompshareImageGroup as Array<Record<string, unknown>>) ?? []
  const rows: Array<Record<string, unknown>> = []
  for (const group of groups) {
    const items = (group.Data as Array<Record<string, unknown>>) ?? []
    for (const raw of items) {
      const row: Record<string, unknown> = {...raw}
      if (row.Name === undefined || row.Name === null) {
        row.Name = group.ImageName
      }
      if (row.Status === undefined || row.Status === null) {
        row.Status = group.Status
      }
      row.GroupId = group.GroupId
      rows.push(row)
    }
  }
  return rows
}

// 平台镜像跨类型聚合分页(每个类型独立分页, 按全局 offset/limit 切片)
export async function collectPlatformImages(
  context: CompshareContext,
  params: Record<string, unknown>,
  options: {limit: number | null; offset: number;},
): Promise<Record<string, unknown>> {
  // #region 指定类型时直接走单类型分页
  if (params.ImageType) {
    return collectPages(context, 'DescribeCompShareImages', params, 'ImageSet', {
      offset: options.offset,
      limit: options.limit,
    })
  }
  // #endregion

  // #region 跨类型聚合: 依次消耗全局 offset 与 limit
  const rows: Array<Record<string, unknown>> = []
  let totalCount = 0
  let pendingOffset = options.offset
  let remaining = options.limit
  let combined: Record<string, unknown> | null = null
  for (const imageType of PLATFORM_IMAGE_TYPES) {
    const response = await collectPages(
      context,
      'DescribeCompShareImages',
      {...params, ImageType: imageType},
      'ImageSet',
      {offset: pendingOffset, limit: remaining},
    )
    if (combined === null) {
      combined = {...response}
    }
    const pageRows = (response.ImageSet as Array<Record<string, unknown>>) ?? []
    const typeTotal = typeof response.TotalCount === 'number' ? response.TotalCount : pageRows.length
    totalCount += typeTotal
    if (pendingOffset >= typeTotal) {
      // 该类型全部落在 offset 之前, 继续扣减 offset
      pendingOffset -= typeTotal
      continue
    }
    pendingOffset = 0
    let page = pageRows
    if (remaining !== null) {
      page = page.slice(0, remaining)
      remaining -= page.length
    }
    rows.push(...page)
  }
  // #endregion

  const result = combined ?? {}
  result.ImageSet = rows
  result.TotalCount = totalCount
  result.ReturnedCount = rows.length
  result.Offset = options.offset
  if (options.limit !== null) {
    result.Limit = options.limit
  }
  return result
}
