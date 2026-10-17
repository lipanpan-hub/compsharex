// cps instance template create: 创建本地实例模板

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../../lib/compshare/base.js'
import {InstanceTemplateStore, templatePath} from '../../../lib/compshare/instance-template-store.js'
import {compact, diskGib, memoryMib, splitCsv} from '../../../lib/compshare/parsing.js'

export default class InstanceTemplateCreate extends CompshareBaseCommand {
  static aliases = ['ins:template:create', 'ins:template:new']
  static description = '创建本地实例模板'
  static examples = ['<%= config.bin %> <%= command.id %> my-template --gpu 4090 --count 1 --cpu 16 --memory 64GiB']

  static args = {
    name: Args.string({required: true, description: '模板名称'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    description: Flags.string({description: '模板描述'}),
    gpu: Flags.string({description: 'GPU 型号, 例如 4090'}),
    count: Flags.integer({description: 'GPU 数量'}),
    cpu: Flags.integer({description: 'CPU 核数'}),
    memory: Flags.string({description: '内存, 例如 64GiB'}),
    image: Flags.string({description: '镜像 ID'}),
    imageSource: Flags.string({description: '镜像来源: platform、custom、community 或 shared'}),
    region: Flags.string({description: '地域'}),
    zone: Flags.string({description: '可用区'}),
    disk: Flags.string({description: '系统盘大小'}),
    diskType: Flags.string({description: '系统盘类型'}),
    dataDisk: Flags.string({description: '数据盘, 格式 SIZE[:TYPE]; 可重复', multiple: true}),
    charge: Flags.string({description: '计费类型'}),
    quantity: Flags.integer({description: '预付费模式的计费时长'}),
    instanceName: Flags.string({description: '实例名称'}),
    platform: Flags.string({description: '最低 CPU 平台'}),
    remark: Flags.string({description: '实例备注'}),
    firewall: Flags.string({description: '安全组 ID'}),
    maxCount: Flags.integer({description: '实例数量'}),
    us3: Flags.boolean({description: '创建容器时挂载 US3', allowNo: true}),
    force: Flags.boolean({description: '覆盖已存在的模板', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceTemplateCreate)
    // 创建时即校验容量格式, 避免坏配置保存成功后使用时才失败
    if (flags.memory !== undefined) {
      memoryMib(flags.memory)
    }
    if (flags.disk !== undefined) {
      diskGib(flags.disk)
    }
    for (const specification of flags.dataDisk ?? []) {
      diskGib(specification.split(':', 2)[0])
    }
    const context = this.compshareContext()
    const parameters = compact({
      gpu: flags.gpu,
      count: flags.count,
      cpu: flags.cpu,
      memory: flags.memory,
      image: flags.image,
      image_source: flags.imageSource,
      region: flags.region,
      zone: flags.zone,
      disk: flags.disk,
      disk_type: flags.diskType,
      data_disk: flags.dataDisk ? splitCsv(flags.dataDisk) : undefined,
      charge: flags.charge,
      quantity: flags.quantity,
      name: flags.instanceName,
      platform: flags.platform,
      remark: flags.remark,
      firewall: flags.firewall,
      max_count: flags.maxCount,
      us3: flags.us3,
    })
    const store = new InstanceTemplateStore(templatePath(context.configDirectory))
    const template = store.save(args.name, parameters, {description: flags.description, overwrite: flags.force})
    context.renderer.success(`已保存实例模板 ${args.name}`, {...template})
  }
}
