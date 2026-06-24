#!/usr/bin/env bash

if ! command -v bun &> /dev/null; then
    echo -e "\033[0;31mbun could not be found in PATH. If the startup fails, please install Bun from https://bun.sh/\033[0m"
fi

echo "Installing Dependencies..."
bun install &&
    bunx esbuild 'public/**/*.ts' --outdir=public/dist --outbase=public --external:http --external:https --external:url --external:fs --external:JSZip --sourcemap --bundle --splitting --format=esm

echo "Entering SillyTavern..."
bun server.js --watch --hot
