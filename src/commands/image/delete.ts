// cps image delete: 永久删除自定义镜像

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {confirm} from '../../lib/compshare/confirm.js'

export default class ImageDelete extends CompshareBaseCommand {
  static description = '永久删除自定义镜像'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> --region cn-sh2 --yes']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({description: '可用区'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageDelete)
    const context = this.compshareContext()
    await confirm(context, `确认永久删除自定义镜像 ${args.image}?`, flags.yes)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    params.CompShareImageId = args.image
    await invoke(context, 'TerminateCompShareCustomImage', params, {
      success: `已删除镜像 ${args.image}`,
    })
  }
}
