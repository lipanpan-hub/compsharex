// cps instance password: 重置实例密码

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {invalidateSshCredential, lifecycle} from '../../lib/compshare/instance-helpers.js'
import {encodePassword} from '../../lib/compshare/parsing.js'
import {timedPassword} from '../../lib/prompts.js'

// 提示输入新密码并要求二次确认; 密码为必填项且无默认值, 超时未输入则直接退出
async function promptSecret(): Promise<string> {
  for (;;) {
    const secret = await timedPassword({message: '新密码', mask: '*'})
    const repeated = await timedPassword({message: '再次输入新密码', mask: '*'})
    if (secret === repeated) {
      return secret
    }
    process.stderr.write('两次输入不一致, 请重新输入。\n')
  }
}

export default class InstancePassword extends CompshareBaseCommand {
  static aliases = ['ins:password']
  static description = '重置实例密码'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID> --password <SECRET>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    // 密码可通过选项传入以支持自动化; 不带值运行时交互输入
    password: Flags.string({description: '新密码', hidden: true}),
    yes: Flags.boolean({char: 'y', description: '跳过确认', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstancePassword)
    const secret = flags.password ?? (await promptSecret())
    await lifecycle(this.compshareContext(), 'ResetCompShareInstancePassword', args.instance, '重置实例密码', {
      yes: flags.yes,
      extra: {Password: encodePassword(secret)},
    })
    // 密码已变更, 缓存的连接凭据立即失效
    invalidateSshCredential(this.compshareContext(), args.instance)
  }
}
