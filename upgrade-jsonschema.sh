#!/bin/sh

set -o errexit
set -o nounset

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

cd vscode
VERSION="$(npm view @sourcemeta/jsonschema version)"
cd -

if [ -z "$VERSION" ]
then
    echo "Failed to determine latest version of @sourcemeta/jsonschema" >&2
    exit 1
fi

BRANCH_VERSION="$(echo "$VERSION" | tr '.' '-')"
BRANCH="upgrade-jsonschema-$BRANCH_VERSION"

if git show-ref --verify --quiet "refs/heads/$BRANCH"
then
    git branch --delete --force "$BRANCH"
fi

git switch --create "$BRANCH"

cd vscode
npm install "@sourcemeta/jsonschema@$VERSION"
cd -

git add vscode/package.json vscode/package-lock.json
git commit --signoff --message "Upgrade JSON Schema to v$VERSION"
git push-track
gh pr create --fill
