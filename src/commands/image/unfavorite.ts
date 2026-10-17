// cps image unfavorite: 取消收藏社区镜像组

import {Args} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class ImageUnfavorite extends CompshareBaseCommand {
  static aliases = ['img:unfavorite']
  static description = '取消收藏社区镜像组'

  static examples = ['<%= config.bin %> <%= command.id %> <GROUP_ID>']

  static args = {
    group: Args.string({required: true, description: '版本组 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(ImageUnfavorite)
    const params: Record<string, unknown> = CompshareContext.request()
    params.GroupId = args.group
    await invoke(this.compshareContext(), 'DeleteCompShareImageFavorite', params, {
      success: `已取消收藏镜像组 ${args.group}`,
    })
  }
}
