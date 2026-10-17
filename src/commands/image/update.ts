// cps image update: 更新镜像元数据

import {Args, Flags} from '@oclif/core'

import {invoke} from '../../lib/compshare/api.js'
import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {CompshareContext} from '../../lib/compshare/context.js'
import {UsageError} from '../../lib/compshare/errors.js'
import {compact, readBase64, readText, splitCsv} from '../../lib/compshare/parsing.js'

export default class ImageUpdate extends CompshareBaseCommand {
  static aliases = ['img:update']
  static description = '更新镜像元数据'

  static examples = ['<%= config.bin %> <%= command.id %> <IMAGE_ID> --region cn-sh2 --name new-name']

  static args = {
    image: Args.string({required: true, description: '镜像 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    group: Flags.string({description: '社区版本组 ID'}),
    name: Flags.string({description: '新镜像名称'}),
    description: Flags.string({description: '新镜像描述'}),
    visibility: Flags.integer({min: 0, max: 1, description: '可见性: 0 私有, 1 公开'}),
    price: Flags.integer({min: 0, description: '每小时镜像价格'}),
    cover: Flags.string({description: '封面图片文件路径(以 Base64 编码上传)'}),
    readme: Flags.string({description: 'UTF-8 README 文件路径'}),
    tag: Flags.string({multiple: true, description: '镜像标签, 可重复'}),
    version: Flags.string({description: '版本名称'}),
    'version-description': Flags.string({description: '版本描述'}),
    gpu: Flags.string({multiple: true, description: '支持的 GPU 类型, 可重复'}),
    autostart: Flags.boolean({allowNo: true, description: '是否支持自动启动'}),
    region: Flags.string({required: true, description: '地域'}),
    zone: Flags.string({description: '可用区'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ImageUpdate)
    const context = this.compshareContext()
    const values = compact({
      GroupId: flags.group,
      Name: flags.name,
      Description: flags.description,
      Visibility: flags.visibility,
      Price: flags.price,
      Cover: readBase64(flags.cover),
      Readme: readText(flags.readme),
      Tags: splitCsv(flags.tag ?? []).length > 0 ? splitCsv(flags.tag ?? []) : null,
      VersionName: flags.version,
      VersionDesc: flags['version-description'],
      SupportedGpuTypes: splitCsv(flags.gpu ?? []).length > 0 ? splitCsv(flags.gpu ?? []) : null,
      AutoStart: flags.autostart,
    })
    if (Object.keys(values).length === 0) {
      throw new UsageError('至少指定一个要更新的字段。')
    }
    const params: Record<string, unknown> = CompshareContext.request({regionValue: flags.region})
    if (flags.zone !== undefined) {
      params.Zone = flags.zone
    }
    Object.assign(params, {CompShareImageId: args.image, ...values})
    await invoke(context, 'UpdateCompShareImage', params, {
      success: `已更新镜像 ${args.image}`,
    })
  }
}
