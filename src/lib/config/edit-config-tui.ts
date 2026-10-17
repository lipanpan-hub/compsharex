import {readFileSync, writeFileSync} from 'node:fs'
import {parse as parseYaml} from 'yaml'
import {
  type Component,
  Editor,
  type EditorTheme,
  Key,
  type KeybindingDefinitions,
  KeybindingsManager,
  matchesKey,
  ProcessTerminal,
  setKeybindings,
  Text,
  truncateToWidth,
  TuiMainScreen,
  TUI_KEYBINDINGS,
  visibleWidth,
} from '@earendil-works/pi-tui'

// #region ANSI 上色: 充当各组件所需的主题函数
const cyan = (s: string): string => `\u001B[36m${s}\u001B[0m`
const gray = (s: string): string => `\u001B[90m${s}\u001B[0m`
const green = (s: string): string => `\u001B[32m${s}\u001B[0m`
const red = (s: string): string => `\u001B[31m${s}\u001B[0m`
// #endregion

// #region 状态栏: 实现 Component 接口的自定义单行提示组件
class StatusBar implements Component {
  private message = ''
  private style: (s: string) => string = (s) => s

  set(message: string, style: (s: string) => string): void {
    this.message = message
    this.style = style
  }

  invalidate(): void {
    // 无缓存, 无需处理
  }

  render(width: number): string[] {
    const content = truncateToWidth(this.message, width)
    const padded = content + ' '.repeat(Math.max(0, width - visibleWidth(content)))
    return [this.style(padded)]
  }
}
// #endregion

/**
 * 在终端启动 TUI 编辑器编辑指定 YAML 配置文件
 * 回车换行, Ctrl+S 校验并保存, Ctrl+C 退出
 * @param configPath - 待编辑的配置文件绝对路径(需已存在)
 */
export function editConfigTui(configPath: string): Promise<void> {
  return new Promise((resolve) => {
    // #region 重绑快捷键: 回车改为换行(默认回车是提交, shift+enter 换行很多终端识别不了)
    setKeybindings(
      new KeybindingsManager(TUI_KEYBINDINGS as unknown as KeybindingDefinitions, {
        'tui.input.newLine': 'enter',
      }),
    )
    // #endregion

    // #region 装配 TUI 与 Editor
    const initial = readFileSync(configPath, 'utf8')
    const terminal = new ProcessTerminal()
    const tui = new TuiMainScreen(terminal)

    const theme: EditorTheme = {
      borderColor: gray,
      selectList: {
        description: gray,
        noMatch: gray,
        scrollInfo: gray,
        selectedPrefix: cyan,
        selectedText: cyan,
      },
    }

    const editor = new Editor(tui, theme)
    editor.disableSubmit = true // 用 Ctrl+S 保存, 禁用回车提交语义
    editor.setText(initial)

    const status = new StatusBar()
    status.set(`已加载 ${configPath}`, gray)
    // #endregion

    // #region 保存: 取回文本 -> yaml 校验语法 -> 通过才写盘
    const save = (): void => {
      const text = editor.getText()
      try {
        parseYaml(text) // 仅校验语法
        writeFileSync(configPath, text, 'utf8')
        status.set(`✓ 已保存 (${new Date().toLocaleTimeString()})`, green)
      } catch (error) {
        status.set(`✗ YAML 语法错误, 未保存: ${(error as Error).message}`, red)
      }

      tui.requestRender()
    }
    // #endregion

    // #region 顶层拦截快捷键: Ctrl+C 退出, Ctrl+S 保存
    tui.addInputListener((data: string) => {
      if (matchesKey(data, Key.ctrl('c'))) {
        tui.stop()
        resolve()
        return {consume: true}
      }

      if (matchesKey(data, Key.ctrl('s'))) {
        save()
        return {consume: true}
      }

      return undefined // 其余按键交给聚焦的 Editor
    })
    // #endregion

    // #region 布局与启动
    tui.addChild(new Text(cyan('YAML 配置编辑器'), 0, 0))
    tui.addChild(new Text(gray('回车换行  Ctrl+S 保存  Ctrl+C 退出'), 0, 0))
    // tui.addChild(new Spacer(1))
    tui.addChild(editor)
    // tui.addChild(new Spacer(1))
    tui.addChild(status)
    tui.setFocus(editor)
    tui.start()
    // #endregion
  })
}
