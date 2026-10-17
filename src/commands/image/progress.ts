// cps image progress: 查询自定义镜像创建进度

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class ImageProgress extends CompshareBaseCommand {
  static aliases = ['img:progress']
  static description = '查询自定义镜像创建进度'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> --region cn-sh2']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageProgress)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    params.CompShareImageId = args.image
    await invoke(this.compshareContext(), 'GetCompShareImageCreateProgress', params)
  }
}
