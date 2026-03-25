# yamlfmt

Format yaml files with [yamlfmt](https://github.com/google/yamlfmt) for VS Code.

[![VS Code Version](https://img.shields.io/visual-studio-marketplace/v/bluebrown.yamlfmt?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=bluebrown.yamlfmt)
[![License: MIT](https://img.shields.io/github/license/thegeeklab/vscode-extension-yamlfmt?logo=github&logoColor=white)](https://github.com/thegeeklab/vscode-extension-yamlfmt/blob/main/LICENSE)

A VS Code extension that formats yaml files using the external binary [yamlfmt](https://github.com/google/yamlfmt).

## Usage

> **Note** The binary must exist in the system path or be configured via `yamlfmt.path`. See the [official install
> instructions](https://github.com/google/yamlfmt#installation).

### Configuration

The binary is invoked with the [workspace folder](https://code.visualstudio.com/docs/editor/workspaces), containing the document to
format, as `cwd`. So the [official documentation](https://github.com/google/yamlfmt/blob/main/docs/config-file.md), regarding `yamlfmt`
configuration, applies.

If the file is not opened from a workspace, the extension will fallback to the
files parent directory as `cwd`. If that is not sufficient to pick up the right
config file, you can create a .yamlfmt at one of the common locations. i.e.
`~/config/yamlfmt/` or export `XDG_CONFIG_HOME`. Alternatively point to the
right at via the `-conf` flag, in your `settings.json`.

You can pass [extra flags](https://github.com/google/yamlfmt/blob/main/docs/command-usage.md#operation-flags) from the `settings.json`:

```json
{
  "yamlfmt.path": "yamlfmt",
  "yamlfmt.args": []
}
```

> **Note** The flag `-in` is always appended to the args, since the current
> document is passed via stdin to yamlfmt.

## Contributors

Special thanks to all [contributors](https://github.com/thegeeklab/vscode-extension-yamlfmt/graphs/contributors). If you would like to contribute, please see the [instructions](https://github.com/thegeeklab/vscode-extension-yamlfmt/blob/main/CONTRIBUTING.md).

This project is a fork of [bluebrown/vscode-extension-yamlfmt](https://github.com/bluebrown/vscode-extension-yamlfmt) from Nico Braun. Thanks for your work.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/thegeeklab/vscode-extension-yamlfmt/blob/main/LICENSE) file for details.
