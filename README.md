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
@lppx/compsharex/0.0.0 win32-x64 node-v24.14.1
$ cps --help [COMMAND]
USAGE
  $ cps COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`cps hello PERSON`](#cps-hello-person)
* [`cps hello world`](#cps-hello-world)
* [`cps help [COMMAND]`](#cps-help-command)
* [`cps plugins`](#cps-plugins)
* [`cps plugins add PLUGIN`](#cps-plugins-add-plugin)
* [`cps plugins:inspect PLUGIN...`](#cps-pluginsinspect-plugin)
* [`cps plugins install PLUGIN`](#cps-plugins-install-plugin)
* [`cps plugins link PATH`](#cps-plugins-link-path)
* [`cps plugins remove [PLUGIN]`](#cps-plugins-remove-plugin)
* [`cps plugins reset`](#cps-plugins-reset)
* [`cps plugins uninstall [PLUGIN]`](#cps-plugins-uninstall-plugin)
* [`cps plugins unlink [PLUGIN]`](#cps-plugins-unlink-plugin)
* [`cps plugins update`](#cps-plugins-update)

## `cps hello PERSON`

Say hello

```
USAGE
  $ cps hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ cps hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/lipanpan-hub/compsharex/blob/v0.0.0/src/commands/hello/index.ts)_

## `cps hello world`

Say hello world

```
USAGE
  $ cps hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ cps hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/lipanpan-hub/compsharex/blob/v0.0.0/src/commands/hello/world.ts)_

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

## `cps plugins`

List installed plugins.

```
USAGE
  $ cps plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ cps plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/index.ts)_

## `cps plugins add PLUGIN`

Installs a plugin into cps.

```
USAGE
  $ cps plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into cps.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the CPS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the CPS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ cps plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ cps plugins add myplugin

  Install a plugin from a github url.

    $ cps plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ cps plugins add someuser/someplugin
```

## `cps plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ cps plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ cps plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/inspect.ts)_

## `cps plugins install PLUGIN`

Installs a plugin into cps.

```
USAGE
  $ cps plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into cps.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the CPS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the CPS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ cps plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ cps plugins install myplugin

  Install a plugin from a github url.

    $ cps plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ cps plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/install.ts)_

## `cps plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ cps plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ cps plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/link.ts)_

## `cps plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ cps plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ cps plugins unlink
  $ cps plugins remove

EXAMPLES
  $ cps plugins remove myplugin
```

## `cps plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ cps plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/reset.ts)_

## `cps plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ cps plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ cps plugins unlink
  $ cps plugins remove

EXAMPLES
  $ cps plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/uninstall.ts)_

## `cps plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ cps plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ cps plugins unlink
  $ cps plugins remove

EXAMPLES
  $ cps plugins unlink myplugin
```

## `cps plugins update`

Update installed plugins.

```
USAGE
  $ cps plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/update.ts)_
<!-- commandsstop -->
