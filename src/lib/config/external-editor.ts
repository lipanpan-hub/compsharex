import {execFileSync, spawn} from 'node:child_process'

// #region 编辑器候选定义
interface EditorCandidate {
  args?: string[] // 启动附加参数, GUI 编辑器需阻塞参数以等待关闭
  command: string // 可执行文件名
  name: string // 展示名称
}

// GUI 编辑器需带阻塞参数, 否则会立即返回导致无法等待用户编辑完成
const EDITOR_CANDIDATES: EditorCandidate[] = [
  {args: ['--wait'], command: 'zed', name: 'Zed'},
  {args: ['--wait'], command: 'code', name: 'VS Code'},
  {args: ['--wait'], command: 'cursor', name: 'Cursor'},
  {args: ['-w'], command: 'subl', name: 'Sublime Text'},
  {command: 'nvim', name: 'Neovim'},
  {command: 'vim', name: 'Vim'},
  {command: 'nano', name: 'Nano'},
  {command: 'vi', name: 'Vi'},
  {command: 'notepad', name: 'Notepad'},
]
// #endregion

export class ExternalEditor {
  detectAvailable(): EditorCandidate[] {
    // 逐个检测可执行文件是否在 PATH 中, 仅返回真实可用的编辑器
    return EDITOR_CANDIDATES.filter((candidate) => this.isCommandAvailable(candidate.command))
  }

  open(candidate: EditorCandidate, filePath: string): Promise<void> {
    // 继承 stdio 让终端编辑器接管当前 TTY, GUI 编辑器则通过阻塞参数等待关闭
    return new Promise((resolve, reject) => {
      const child = spawn(candidate.command, [...(candidate.args ?? []), filePath], {stdio: 'inherit'})
      child.on('error', reject)
      child.on('close', () => resolve())
    })
  }

  private isCommandAvailable(command: string): boolean {
    // Windows 用 where, 其余平台用 which 探测命令是否存在
    const finder = process.platform === 'win32' ? 'where' : 'which'
    try {
      execFileSync(finder, [command], {stdio: 'ignore'})
      return true
    } catch {
      return false
    }
  }
}
