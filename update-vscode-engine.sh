#!/bin/bash
set -eo pipefail
if [ -z "$1" ]; then
	echo "Usage: $0 <version>"
	exit 1
fi
VERSION=$1
# The sed command differs between GNU and BSD (macOS)
if [[ "$(uname)" == "Darwin" ]]; then
	sed -i '' -E "s/(\"vscode\": \"\^)[^\"]+(\")/$VERSION/" package.json
else
	sed -i -E "s/(\"vscode\": \"\^)[^\"]+(\")/$VERSION/" package.json
fi
