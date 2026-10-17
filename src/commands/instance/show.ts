// cps instance show: 查看实例详情

import {Args, Flags} from '@oclif/core'

import {CompshareBaseCommand, compshareGlobalFlags} from '../../lib/compshare/base.js'
import {locateInstance} from '../../lib/compshare/location.js'
import {defaultInstanceFields, focusedInstanceFields, INSTANCE_SECTION_KEYS, INSTANCE_COLLECTION_KEYS} from '../../lib/compshare/instance-helpers.js'

// show 子命令选项 → section 名
const SECTION_FLAGS: Array<[string, 'ip' | 'softwares' | 'spec' | 'disks' | 'billing' | 'image' | 'status']> = [
  ['ip', 'ip'],
  ['softwares', 'softwares'],
  ['spec', 'spec'],
  ['disks', 'disks'],
  ['billing', 'billing'],
  ['image', 'image'],
  ['status', 'status'],
]

export default class InstanceShow extends CompshareBaseCommand {
  static description = '查看实例完整详情'
  static examples = ['<%= config.bin %> <%= command.id %> <INSTANCE_ID>']

  static args = {
    instance: Args.string({required: true, description: '实例 ID'}),
  }

  static flags = {
    ...compshareGlobalFlags,
    ip: Flags.boolean({description: '只显示实例 IP 信息', default: false}),
    softwares: Flags.boolean({description: '只显示暴露的软件与访问地址', default: false}),
    spec: Flags.boolean({description: '只显示计算规格', default: false}),
    disks: Flags.boolean({description: '只显示磁盘与卷信息', default: false}),
    billing: Flags.boolean({description: '只显示计费信息', default: false}),
    image: Flags.boolean({description: '只显示镜像信息', default: false}),
    status: Flags.boolean({description: '只显示状态与生命周期时间', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InstanceShow)
    const context = this.compshareContext()
    const [region, zone, host] = await locateInstance(context, args.instance)
    const selectedSections = SECTION_FLAGS.filter(([flagName]) => Boolean(flags[flagName as keyof typeof flags])).map(
      ([, section]) => section,
    )

    let responseHost: Record<string, unknown>
    let fields: Array<[string, unknown]>
    if (selectedSections.length > 0) {
      // section 过滤模式: 响应只保留所选 section 的字段
      const keys = new Set<string>()
      for (const section of selectedSections) {
        for (const key of INSTANCE_SECTION_KEYS[section]) {
          keys.add(key)
        }
      }
      responseHost = {
        UHostId: host.UHostId ?? args.instance,
        Name: host.Name,
        Region: host.Region ?? region,
        Zone: host.Zone ?? zone,
      }
      for (const key of keys) {
        responseHost[key] = key in host ? host[key] : (INSTANCE_COLLECTION_KEYS.has(key) ? [] : null)
      }
      fields = focusedInstanceFields(host, selectedSections)
    } else {
      responseHost = {...host, UHostId: host.UHostId ?? args.instance, Region: host.Region ?? region, Zone: host.Zone ?? zone}
      fields = defaultInstanceFields(host, region, zone)
    }
    context.renderer.details('实例详情', fields, {UHostSet: [responseHost]})
  }
}
