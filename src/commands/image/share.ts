// cps image share: 共享镜像给指定账号

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'

export default class ImageShare extends CompshareBaseCommand {
  static description = '共享镜像给指定账号'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> <ACCOUNT_ID>... --region cn-sh2']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
    accounts: Args.integer({required: true, multiple: true, description: '账号 ID, 可多个'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '地域'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageShare)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    params.CompShareImageId = args.image
    params.AddAccounts = args.accounts
    await invoke(this.compshareContext(), 'ModifyCompShareImageShareAccount', params, {
      success: `已共享镜像 ${args.image}`,
    })
  }
}
