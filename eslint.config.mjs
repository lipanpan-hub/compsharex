import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {
    // 关闭对本 CLI 项目审查无实际收益的纯风格/主观偏好规则
    rules: {
      // 代码风格排版/注释格式：不影响正确性
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/padding-line-between-statements': 'off',
      '@stylistic/spaced-comment': 'off',
      // 命令入口分支多、构造函数注入依赖多，阈值主观
      'complexity': 'off',
      'max-params': 'off',
      // @remarks 是标准 TSDoc 标签，jsdoc 插件按 JSDoc 规则误报
      'jsdoc/check-tag-names': 'off',
      // CLI 环境已支持 fetch，属误报
      'n/no-unsupported-features/node-builtins': 'off',
      // 串行调用云 API 是合理的，避免并发限流
      'no-await-in-loop': 'off',
      'object-shorthand': 'off',
      // 成员/导入/对象键/接口排序：纯主观，无功能意义
      'perfectionist/sort-classes': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-union-types': 'off',
      'prefer-destructuring': 'off',
      // unicorn 系列写法偏好：三元/at/replaceAll/for-of/索引判断/转义大小写等
      'unicorn/consistent-existence-index-check': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/escape-case': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-for-loop': 'off',
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-string-replace-all': 'off',
      'unicorn/prefer-ternary': 'off',
    },
  },
]
