// cps minimax image upload: 上传并注册引用图片

import {Args, Flags} from '@oclif/core'
import {extname} from 'node:path'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {UsageError} from '../../../lib/compshare/errors.js'
import {MiniMaxClient} from '../../../lib/compshare/minimax-api.js'
import {IMAGE_MIME, uploadAsset} from '../../../lib/compshare/minimax-helpers.js'

export default class MinimaxImageUpload extends CompshareBaseCommand {
  static aliases = ['mm:image:upload']
  static description = '上传并注册引用图片'

  static examples = ['<%= config.bin %> <%= command.id %> ref.png --width 1024 --height 768']

  static args = {
    file: Args.string({required: true, description: '图片文件路径 (JPG/PNG/WebP)'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    width: Flags.integer({required: true, min: 1, description: '图片实际宽度, 单位像素'}),
    height: Flags.integer({required: true, min: 1, description: '图片实际高度, 单位像素'}),
    yes: Flags.boolean({char: 'y', default: false, description: '跳过确认'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MinimaxImageUpload)
    const context = this.compshareContext()
    const client = new MiniMaxClient(context.renderer, this.config.version)
    const contentType = IMAGE_MIME[extname(args.file).toLowerCase()]
    if (!contentType) {
      throw new UsageError('图片文件必须是 JPG、PNG 或 WebP 格式。')
    }
    await uploadAsset(
      context,
      client,
      'image',
      args.file,
      contentType,
      30 * 1024 * 1024,
      {width: flags.width, height: flags.height},
      flags.yes,
    )
  }
}
