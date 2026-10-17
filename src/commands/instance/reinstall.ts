// cps instance reinstall: 从镜像重装实例

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {invalidateSshCredential, lifecycle} from '../../lib/compshare/instance-helpers.js'
import {compact, encodePassword} from '../../lib/compshare/parsing.js'

export default class InstanceReinstall extends CompshareBaseCommand {
  static aliases = ['ins:reinstall']
  static description = '从镜像重装实例(系统盘数据将全部丢失)'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --image <IMAGE_ID>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    image: Flags.string({required: true, description: '替换用镜像 ID'}),
    password: Flags.string({description: '新密码', hidden: true}),
    coupon: Flags.string({description: '代金券 ID'}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
    wait: Flags.boolean({description: '等待操作到达稳定状态', allowNo: true}),
    timeout: Flags.integer({description: '最长等待秒数', default: 600}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceReinstall)
    await lifecycle(this.compshareContext(), 'ReinstallCompShareInstance', args.instance, '重装实例, 系统盘数据将全部丢失', {
      yes: flags.yes,
      extra: compact({
        CompShareImageId: flags.image,
        Password: flags.password ? encodePassword(flags.password) : undefined,
        CouponId: flags.coupon,
      }),
      wait: flags.wait,
      timeout: flags.timeout,
    })
    // 重装后连接信息会变化, 缓存立即失效
    invalidateSshCredential(this.compshareContext(), args.instance)
  }
}
