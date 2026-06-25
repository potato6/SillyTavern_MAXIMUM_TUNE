#!/usr/bin/env bash

if ! command -v bun &> /dev/null; then
    echo -e "\033[0;31mbun could not be found in PATH. If the startup fails, please install Bun from https://bun.sh/\033[0m"
fi

echo "Installing Dependencies..."
bun install &&
    bun run build.ts

echo "Entering SillyTavern..."
bun server.js --watch --hot
