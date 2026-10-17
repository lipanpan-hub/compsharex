// cps image publish: 发布镜像到社区

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {confirm} from '../../lib/compshare/confirm.js'
import {compact, readBase64, readText, splitCsv} from '../../lib/compshare/parsing.js'

export default class ImagePublish extends CompshareBaseCommand {
  static aliases = ['img:publish']
  static description = '发布镜像到社区'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> --version v1 --region cn-sh2 --zone cn-sh2-03']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    version: Flags.string({required: true, description: '社区版本名称'}),
    group: Flags.string({description: '已有社区版本组 ID'}),
    name: Flags.string({description: '社区镜像名称'}),
    'version-description': Flags.string({description: '版本描述'}),
    price: Flags.integer({default: 0, min: 0, description: '每小时镜像价格, 0 表示免费'}),
    cover: Flags.string({description: '封面图片文件路径(以 Base64 编码上传)'}),
    tag: Flags.string({multiple: true, description: '镜像标签, 可重复'}),
    description: Flags.string({description: '社区镜像描述'}),
    readme: Flags.string({description: 'UTF-8 README 文件路径'}),
    gpu: Flags.string({multiple: true, description: '支持的 GPU 类型, 可重复'}),
    autostart: Flags.boolean({allowNo: true, description: '是否支持自动启动'}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({required: true, description: '可用区'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImagePublish)
    const context = this.compshareContext()
    await confirm(context, `确认将镜像 ${args.image} 发布为社区版本 ${flags.version}?`, flags.yes)
    const params: Record<string, unknown> = CompshareContext.request({
      zone: true,
      regionValue: flags.region,
      zoneValue: flags.zone,
    })
    Object.assign(
      params,
      compact({
        CompShareImageId: args.image,
        GroupId: flags.group,
        CommunityImageName: flags.name,
        VersionName: flags.version,
        VersionDesc: flags['version-description'],
        Price: flags.price,
        Cover: readBase64(flags.cover),
        Tags: splitCsv(flags.tag ?? []).length > 0 ? splitCsv(flags.tag ?? []) : null,
        Description: flags.description,
        Readme: readText(flags.readme),
        SupportedGpuTypes: splitCsv(flags.gpu ?? []).length > 0 ? splitCsv(flags.gpu ?? []) : null,
        AutoStart: flags.autostart,
      }),
    )
    await invoke(context, 'PublishCompShareImage', params, {
      success: `已发布镜像 ${args.image}`,
    })
  }
}
