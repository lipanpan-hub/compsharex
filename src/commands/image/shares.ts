// cps image shares: 列出镜像共享给的账号

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class ImageShares extends CompshareBaseCommand {
  static aliases = ['img:shares']
  static description = '列出镜像共享给的账号'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> --region cn-sh2']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '地域'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageShares)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    params.CompShareImageId = args.image
    await invoke(this.compshareContext(), 'DescribeCompShareImageShareAccounts', params, {
      listKey: 'AccountSet',
      columns: [
        ['AccountId', 'ACCOUNT ID'],
        ['AccountName', 'ACCOUNT'],
      ],
    })
  }
}
