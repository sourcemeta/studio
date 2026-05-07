#!/bin/sh

set -o errexit
set -o nounset

usage() {
    echo "Usage: $0 <major|minor|patch>" 1>&2
    exit 1
}

if [ "$#" -ne 1 ]
then
    usage
fi

BUMP_TYPE="$1"

case "$BUMP_TYPE" in
    major|minor|patch)
        ;;
    *)
        usage
        ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

cd vscode
NEW_VERSION="$(npm version "$BUMP_TYPE" --no-git-tag-version)"
cd -

git add vscode/package.json vscode/package-lock.json
git commit --signoff --message "$NEW_VERSION"
git tag --annotate "$NEW_VERSION" --message "$NEW_VERSION"
git log --max-count=1 --patch
