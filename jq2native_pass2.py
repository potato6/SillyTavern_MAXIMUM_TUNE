#!/usr/bin/env nix-shell
#! nix-shell -p python3 -i python
"""
Pass 2: Convert remaining jQuery method calls on now-native elements.
Run after pass 1 (jq2native.py) has converted selectors.

Usage:
  python jq2native_pass2.py [--write] file1.ts [file2.ts ...]
"""

import re
import sys

# These patterns match jQuery methods on native DOM elements (after selectors were converted)
RULES = [
    # .val() getter  →  .value
    (r'\.val\(\s*\)', '.value'),
    # .val(x) setter  →  .value = x
    (r'([\w.()]+)\.val\(([^)]+)\)', r'\1.value = \2'),
    # .text(str)  →  .textContent = str
    (r'([\w.()]+)\.text\(([^)]+)\)', r'\1.textContent = \2'),
    # .html(str)  →  .innerHTML = str
    (r'([\w.()]+)\.html\(([^)]+)\)', r'\1.innerHTML = \2'),
    # .trigger('event')  →  .dispatchEvent(new Event('event', {bubbles: true}))
    (r"\.trigger\(\s*'(\w+)'\s*\)", r".dispatchEvent(new Event('\1', { bubbles: true }))"),
    # .prop('disabled', bool)  →  .disabled = bool
    (r"\.prop\(\s*'disabled'\s*,\s*([^)]+)\s*\)", r'.disabled = \1'),
    # .prop('checked', bool)  →  .checked = bool
    (r"\.prop\(\s*'checked'\s*,\s*([^)]+)\s*\)", r'.checked = \1'),
    # .prop('checked') getter  →  .checked
    (r"\.prop\(\s*'checked'\s*\)", '.checked'),
    # .hide()  →  .style.display = 'none'
    (r'\.hide\(\s*\)', ".style.display = 'none'"),
    # .show()  →  .style.display = ''
    (r'\.show\(\s*\)', ".style.display = ''"),
    # .addClass('cls')  →  .classList.add('cls')
    (r"\.addClass\(\s*'([^']+)'\s*\)", r".classList.add('\1')"),
    # .removeClass('cls')  →  .classList.remove('cls')
    (r"\.removeClass\(\s*'([^']+)'\s*\)", r".classList.remove('\1')"),
    # .toggleClass('cls')  →  .classList.toggle('cls')
    (r"\.toggleClass\(\s*'([^']+)'\s*\)", r".classList.toggle('\1')"),
    # .attr('name', val)  →  .setAttribute('name', val)
    (r"\.attr\(\s*'(\w+)'\s*,\s*([^)]+)\s*\)", r".setAttribute('\1', \2)"),
    # .attr('name')  →  .getAttribute('name')
    (r"\.attr\(\s*'(\w+)'\s*\)", r".getAttribute('\1')"),
    # .removeAttr('name')  →  .removeAttribute('name')
    (r"\.removeAttr\(\s*'(\w+)'\s*\)", r".removeAttribute('\1')"),
    # .data('key')  →  .dataset.key
    (r"\.data\(\s*'(\w+)'\s*\)", r'.dataset.\1'),
    # .data('key', val)  →  .setAttribute('data-key', val)
    (r"\.data\(\s*'(\w+)'\s*,\s*([^)]+)\s*\)", r".setAttribute('data-\1', \2)"),
    # .empty()  →  .innerHTML = ''
    (r'\.empty\(\s*\)', ".innerHTML = ''"),
    # .remove()  →  .remove() (already native, just remove $)
    # .find(s)  →  .querySelectorAll(s)
    (r"\.find\(\s*'([^']+)'\s*\)", r".querySelectorAll('\1')"),
    # .first()  →  [0] or querySelector
    (r'\.first\(\s*\)', '[0]'),
    # .last()  →  slice
    (r'\.last\(\s*\)', '.slice(-1)[0]'),
    # .css(prop, val)  →  .style.prop = val
    (r"\.css\(\s*'([a-z-]+)'\s*,\s*([^)]+)\s*\)", r".style.\1 = \2"),
    # .css(prop) getter → getComputedStyle().prop
    (r"\.css\(\s*'([a-z-]+)'\s*\)", r".getComputedStyle?.(el).\1"),
]


def transform_line(line: str) -> tuple[str, bool]:
    for pattern, replacement in RULES:
        new_line, count = re.subn(pattern, replacement, line)
        if count:
            return new_line, True
    return line, False


def process_file(path: str, dry_run: bool = True) -> list[tuple[int, str, str]]:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    modified = []
    new_lines = []
    for i, line in enumerate(lines):
        stripped = line.rstrip('\n')
        new_line, changed = transform_line(stripped)
        if changed:
            modified.append((i + 1, stripped, new_line))
        new_lines.append(new_line + '\n')
    # Always write if modified
    if modified and not dry_run:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

    return modified


def main():
    args = [a for a in sys.argv[1:] if a != '--write']
    dry_run = '--write' not in sys.argv

    if not args:
        print("Usage: python3 jq2native_pass2.py [--write] file1.ts [file2.ts ...]")
        sys.exit(1)

    total_changes = 0
    for path in args:
        try:
            changes = process_file(path, dry_run)
            if changes:
                total_changes += len(changes)
                print(f"\n{'─' * 60}")
                print(f"{'DRY-RUN' if dry_run else 'MODIFIED'} — {path} ({len(changes)} changes)")
                for lineno, old, new in changes:
                    print(f"  L{lineno:>5}: {old}")
                    print(f"          → {new}")
            else:
                print(f"  No changes in {path}")
        except FileNotFoundError:
            print(f"  File not found: {path}")

    print(f"\n{'═' * 50}")
    print(f"Total: {total_changes} changes across {len(args)} files")
    if dry_run:
        print("DRY-RUN — re-run with --write to apply")


if __name__ == '__main__':
    main()
