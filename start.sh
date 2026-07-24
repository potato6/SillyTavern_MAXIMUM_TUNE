#!/usr/bin/env bash

#set current directory as working directory
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

if ! command -v bun &> /dev/null; then
    echo -e "\033[0;31mbun could not be found in PATH. If the startup fails, please install Bun from https://bun.sh/\033[0m"
fi

echo "Installing Dependencies..."
export NODE_ENV=production
bun install &&
    bun run build.ts

echo "Entering SillyTavern..."

./dist/server/SillyTavern "$@"


