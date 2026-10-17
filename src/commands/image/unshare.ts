// cps image unshare: 取消镜像对指定账号的共享

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {confirm} from '../../lib/compshare/confirm.js'

export default class ImageUnshare extends CompshareBaseCommand {
  static aliases = ['img:unshare']
  static description = '取消镜像对指定账号的共享'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> <ACCOUNT_ID>... --region cn-sh2 --yes']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
    accounts: Args.integer({required: true, multiple: true, description: '账号 ID, 可多个'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    region: Flags.string({required: true, description: '地域'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageUnshare)
    const context = this.compshareContext()
    await confirm(context, `确认移除镜像 ${args.image} 的 ${args.accounts.length} 个共享账号?`, flags.yes)
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    params.CompShareImageId = args.image
    params.RemoveAccounts = args.accounts
    await invoke(context, 'ModifyCompShareImageShareAccount', params, {
      success: `已取消共享镜像 ${args.image}`,
    })
  }
}
