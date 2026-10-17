@lppx/compsharex
=================

A multi-command developer CLI tool


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@lppx/compsharex.svg)](https://npmjs.org/package/@lppx/compsharex)
[![Downloads/week](https://img.shields.io/npm/dw/@lppx/compsharex.svg)](https://npmjs.org/package/@lppx/compsharex)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @lppx/compsharex
$ cps COMMAND
running command...
$ cps (--version)
@lppx/compsharex/0.0.0 linux-x64 node-v22.23.3
$ cps --help [COMMAND]
USAGE
  $ cps COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`cps autocomplete [SHELL]`](#cps-autocomplete-shell)
* [`cps help [COMMAND]`](#cps-help-command)
* [`cps version`](#cps-version)

## `cps autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ cps autocomplete [SHELL] [-r]

ARGUMENTS
  [SHELL]  (zsh|bash|powershell) Shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  Display autocomplete installation instructions.

EXAMPLES
  $ cps autocomplete

  $ cps autocomplete bash

  $ cps autocomplete zsh

  $ cps autocomplete powershell

  $ cps autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v4.0.4/src/commands/autocomplete/index.ts)_

## `cps help [COMMAND]`

Display help for cps.

```
USAGE
  $ cps help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for cps.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.3.0/src/commands/help.ts)_

## `cps version`

```
USAGE
  $ cps version [--json] [--verbose]

FLAGS
  --verbose  Show additional information about the CLI.

GLOBAL FLAGS
  --json  Format output as json.

FLAG DESCRIPTIONS
  --verbose  Show additional information about the CLI.

    Additionally shows the architecture, node version, operating system, and versions of plugins that the CLI is using.
```

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/3.0.5/src/commands/version.ts)_
<!-- commandsstop -->
