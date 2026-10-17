// cps team member rename: 修改成员备注名

import {Args} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {relation} from '../../../lib/compshare/team-helpers.js'

export default class MemberRename extends CompshareBaseCommand {
  static description = '修改团队成员备注名'

  static examples = ['<%= config.bin %> <%= command.id %> <TEAM_ID> <USER_ID> <REMARK>']

  static args = {
    team: Args.integer({required: true, description: '团队 ID'}),
    user: Args.integer({required: true, description: '用户公司 ID'}),
    remark: Args.string({required: true, description: '成员备注'}),
  }

  static flags = {...compshareGlobalFlags}

  async run(): Promise<void> {
    const {args} = await this.parse(MemberRename)
    const context = this.compshareContext()
    // 备注修改属低风险操作, 直接跳过确认
    await relation(context, args.team, 'UpdateRemarkName', {user: args.user, remark: args.remark, yes: true})
  }
}
