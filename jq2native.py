#!/usr/bin/env nix-shell
#! nix-shell -p python3 -i python
"""
Mass replace jQuery patterns with native DOM equivalents.
Run without --write for dry-run preview, with --write to apply.

Usage:
  python jq2native.py [--write] file1.ts [file2.ts ...]
"""

import re
import sys

RULES = [
    # ── $(this) patterns ──
    (r'\$\(this\)\.val\(\s*\)', 'this.value'),
    (r'\$\(this\)\.val\(([^)]+)\)', r'this.value = \1'),
    (r"\$\(this\)\.prop\(\s*'checked'\s*\)", 'this.checked'),
    (r"\$\(this\)\.prop\(\s*'checked'\s*,\s*([^)]+)\s*\)", r'this.checked = \1'),
    (r"\$\(this\)\.data\(\s*'(\w+)'\s*\)", r'this.dataset.\1'),
    (r"\$\(this\)\.attr\(\s*'(\w+)'\s*\)", r"this.getAttribute('\1')"),
    (r"\$\(this\)\.attr\(\s*'(\w+)'\s*,\s*([^)]+)\s*\)", r"this.setAttribute('\1', \2)"),
    (r"\$\(this\)\.parent\(\s*\)", 'this.parentElement'),
    (r"\$\(this\)\.parent\.", 'this.parentElement.'),
    (r"\$\(this\)\.closest\(\s*'([^']+)'\s*\)", r"this.closest('\1')"),
    (r"\$\(this\)\.css\(\s*'([^']+)'\s*,\s*([^)]+)\s*\)", r"this.style.\1 = \2"),
    (r"\$\(this\)\.remove\(\)", 'this.remove()'),
    (r"\$\(this\)\.empty\(\)", 'this.innerHTML = \'\''),

    # ── $('#id') patterns ──
    (r"\$\(#([\w-]+)\)\.val\(\s*\)(\s*[;,\)])", r"document.getElementById('\1').value\2"),
    (r"\$\(#([\w-]+)\)\.val\(([^)]+)\)(\s*[;,\)])", r"document.getElementById('\1').value = \2\3"),
    (r"\$\(#([\w-]+)\)\.prop\(\s*'checked'\s*,\s*([^)]+)\s*\)", r"document.getElementById('\1').checked = \2"),
    (r"\$\(#([\w-]+)\)\.prop\(\s*'checked'\s*\)", r"document.getElementById('\1').checked"),
    (r"\$\(#([\w-]+)\)\.text\(([^)]+)\)", r"document.getElementById('\1').textContent = \2"),
    (r"\$\(#([\w-]+)\)\.html\(([^)]+)\)", r"document.getElementById('\1').innerHTML = \2"),
    (r"\$\(#([\w-]+)\)\.empty\(\s*\)", r"const el = document.getElementById('\1'); if (el) el.innerHTML = ''"),
    (r"\$\(#([\w-]+)\)\.remove\(\s*\)", r"document.getElementById('\1')?.remove()"),
    (r"\$\(#([\w-]+)\)\.show\(\s*\)", r"const el = document.getElementById('\1'); if (el) el.style.display = ''"),
    (r"\$\(#([\w-]+)\)\.hide\(\s*\)", r"const el = document.getElementById('\1'); if (el) el.style.display = 'none'"),
    (r"\$\(#([\w-]+)\)\.addClass\(\s*'([^']+)'\s*\)", r"document.getElementById('\1')?.classList.add('\2')"),
    (r"\$\(#([\w-]+)\)\.removeClass\(\s*'([^']+)'\s*\)", r"document.getElementById('\1')?.classList.remove('\2')"),
    (r"\$\(#([\w-]+)\)\.toggleClass\(\s*'([^']+)'\s*(,\s*[^)]+)?\s*\)", r"document.getElementById('\1')?.classList.toggle('\2'\3)"),
    (r"\$\(#([\w-]+)\)\.css\(\s*'([^']+)'\s*,\s*([^)]+)\s*\)", r"document.getElementById('\1')?.style.\2 = \3"),
    (r"\$\(#([\w-]+)\)\.attr\(\s*'([^']+)'\s*,\s*([^)]+)\s*\)", r"document.getElementById('\1')?.setAttribute('\2', \3)"),
    (r"\$\(#([\w-]+)\)\.attr\(\s*'([^']+)'\s*\)", r"document.getElementById('\1')?.getAttribute('\2')"),
    (r"\$\(#([\w-]+)\)\.removeAttr\(\s*'([^']+)'\s*\)", r"document.getElementById('\1')?.removeAttribute('\2')"),
    (r"\$\(#([\w-]+)\)\.trigger\(\s*'(\w+)'\s*\)", r"document.getElementById('\1')?.dispatchEvent(new Event('\2', { bubbles: true }))"),
    (r"\$\(#([\w-]+)\)\.find\(\s*'([^']+)'\s*\)", r"document.getElementById('\1')?.querySelectorAll('\2')"),

    # ── $(document).on → delegation ──
    (r"\$\(document\)\.on\(\s*'(\w+)'\s*,\s*'([^']+)'\s*,\s*(function|async function)\s*\(([^)]*)\)\s*\{",
     r"document.addEventListener('\1', \3 (\4) { const target = event.target.closest('\2'); if (!target) return;"),

    # ── $(selector) patterns ──
    (r"\$\(\s*'#([\w-]+)'\s*\)", r"document.getElementById('\1')"),
    (r"\$\(\s*'\.([\w-]+)'\s*\)", r"document.querySelector('.\1')"),
    (r"\$\(\s*'\.([\w-]+)\s+([^']+)'\s*\)", r"document.querySelector('.\1 \2')"),
    (r"\$\(\s*'([\w-]+)'\s*\)", r"document.querySelector('\1')"),

    # ── .val().trigger('change') chain ──
    (r"\.val\(([^)]*)\)\s*\.trigger\('change'\)", r".value = \1\n    el.dispatchEvent(new Event('change', { bubbles: true }))"),

    # ── $(selector).length → querySelectorAll().length ──
    (r"\$\(([^)]+)\)\.length", r"document.querySelectorAll(\1).length"),

    # ── $(element) wrapping (variable) → just the variable ──
    (r"\$\((\w+)\)", r"\1"),
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
        if '$(' in stripped:
            new_line, changed = transform_line(stripped)
            if changed:
                modified.append((i + 1, stripped, new_line))
            new_lines.append(new_line + '\n')
        else:
            new_lines.append(line)

    if modified and not dry_run:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

    return modified


def main():
    args = [a for a in sys.argv[1:] if a != '--write']
    dry_run = '--write' not in sys.argv

    if not args:
        print("Usage: python jq2native.py [--write] file1.ts [file2.ts ...]")
        sys.exit(1)

    total_changes = 0
    for path in args:
        try:
            changes = process_file(path, dry_run)
            if changes:
                total_changes += len(changes)
                print(f"\n{'─' * 60}")
                print(f"{'DRY-RUN' if dry_run else 'MODIFIED'} — {path} ({len(changes)} changes)")
                for lineno, old, new in changes[:5]:
                    print(f"  L{lineno:>5}: {old}")
                    print(f"          → {new}")
                if len(changes) > 5:
                    print(f"  ... and {len(changes) - 5} more changes")
                    for lineno, old, new in changes[5:]:
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
        print("After applying: bun run typecheck && bun run build.ts")


if __name__ == '__main__':
    main()
