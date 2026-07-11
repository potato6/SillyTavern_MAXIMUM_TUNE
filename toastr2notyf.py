#!/usr/bin/env python3
"""
toastr → notyf migration script.

Bulk-renames toastr API calls to notyf equivalents.
Skips dist/ and node_modules. Flags complex cases for manual review.

Usage:
    python3 toastr2notyf.py              # dry run (shows what would change)
    python3 toastr2notyf.py --apply      # apply changes
    python3 toastr2notyf.py --report     # print flagged lines needing manual review
"""

import re
import os
import sys
import glob

DRY_RUN = '--apply' not in sys.argv
REPORT_ONLY = '--report' in sys.argv

# Directories to scan
SCAN_DIRS = ['public/scripts']
SKIP_PATTERNS = ['node_modules', 'dist', '.min.js']

# Files to process
EXTENSIONS = ('.ts', '.js')

# toastr method → notyf method (simple renames)
METHOD_MAP = {
    'toastr.error': 'notyf.error',
    'toastr.success': 'notyf.success',
    'toastr.warning': 'notyf.warning',
    'toastr.info': 'notyf.info',
    'toastr.clear': None,  # handled separately
}

# Lines containing these strings need manual review
MANUAL_REVIEW_MARKERS = [
    'toastr.subscribe',
    'toastr.getContainer',
    'toastr.options',
    'fixToastrForDialogs',
    'fixToastr',
    'toastr.remove',
]

# Pattern: toastr.method(arg, 'Title') — has a second string arg
RE_HAS_TITLE = re.compile(r"toastr\.\w+\([^,]+,\s*['\"]")

# Pattern: toastr.method(arg, ..., {options}) — has a 3rd arg with {
RE_HAS_OPTIONS = re.compile(r"toastr\.\w+\([^)]*\{")

# Pattern: toastr.clear(toast) — with a variable reference
RE_CLEAR_WITH_REF = re.compile(r'toastr\.clear\((\w+)\)')

# Pattern: const toast = toastr.method(…) — captures return value
RE_CAPTURE_TOAST = re.compile(r'(const|let|var)\s+(\w+)\s*=\s*toastr\.')


def find_files():
    """Find all .ts/.js files to process."""
    files = []
    for scan_dir in SCAN_DIRS:
        for ext in EXTENSIONS:
            for filepath in glob.glob(os.path.join(scan_dir, '**', f'*{ext}'), recursive=True):
                # Skip non-source files
                if any(skip in filepath for skip in SKIP_PATTERNS):
                    continue
                if '.d.ts' in filepath:
                    continue
                files.append(filepath)
    return sorted(files)


def process_line(line, filepath, lineno):
    """Process a single line. Returns (new_line, flags)."""
    flags = []
    new_line = line

    # Check for manual review markers
    for marker in MANUAL_REVIEW_MARKERS:
        if marker in line:
            flags.append(f'MANUAL: contains "{marker}"')
            return line, flags  # Don't transform, just flag

    # Check for title arg
    if RE_HAS_TITLE.search(line):
        flags.append('HAS_TITLE: 2nd string arg (title) — notyf has no title param')

    # Check for options object
    if RE_HAS_OPTIONS.search(line):
        flags.append('HAS_OPTIONS: 3rd arg {object} — map timeOut→duration manually')

    # Handle toastr.clear(toastRef) → notyf.dismiss(toastRef)
    if 'toastr.clear(' in line:
        if RE_CLEAR_WITH_REF.search(line):
            new_line = new_line.replace('toastr.clear(', 'notyf.dismiss(')
        else:
            # toastr.clear() with no args or complex arg
            new_line = new_line.replace('toastr.clear()', 'notyf.dismissAll()')
            if 'toastr.clear(' in new_line and 'notyf.dismiss(' not in new_line:
                flags.append('CLEAR_COMPLEX: toastr.clear with complex arg')

    # Handle toastr.subscribe / toastr.getContainer — skip, manual only
    if 'toastr.subscribe' in line or 'toastr.getContainer' in line:
        return line, flags

    # Handle toastr.options — skip, manual only
    if 'toastr.options' in line:
        return line, flags

    # Simple method renames: toastr.X( → notyf.X(
    for old, new in METHOD_MAP.items():
        if new and old + '(' in new_line:
            new_line = new_line.replace(old + '(', new + '(')

    # Also handle tagged template: toastr.error(t`...`) → notyf.error(t`...`)
    # Already handled by the above since it replaces the method name prefix

    return new_line, flags


def main():
    files = find_files()
    total_changes = 0
    total_flagged = 0
    all_flags = []

    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except Exception as e:
            print(f"SKIP {filepath}: {e}")
            continue

        new_lines = []
        file_changed = False

        for i, line in enumerate(lines, 1):
            if 'toastr' not in line:
                new_lines.append(line)
                continue

            new_line, flags = process_line(line, filepath, i)

            if flags:
                total_flagged += len(flags)
                for flag in flags:
                    all_flags.append(f"{filepath}:{i}: {flag}")
                    print(f"  ⚠ {filepath}:{i}: {flag}")
                    print(f"    {line.rstrip()}")

            if new_line != line:
                total_changes += 1
                file_changed = True

                if DRY_RUN and not REPORT_ONLY:
                    print(f"  ✏ {filepath}:{i}")
                    print(f"    - {line.rstrip()}")
                    print(f"    + {new_line.rstrip()}")

            new_lines.append(new_line)

        if file_changed and not DRY_RUN and not REPORT_ONLY:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
            print(f"✅ Wrote {filepath}")

    print(f"\n{'='*60}")
    print(f"SUMMARY:")
    print(f"  Files scanned:   {len(files)}")
    print(f"  Lines changed:   {total_changes}")
    print(f"  Lines flagged:   {total_flagged}")
    if DRY_RUN and not REPORT_ONLY:
        print(f"\n  DRY RUN — no files modified. Run with --apply to apply.")
    if all_flags and not REPORT_ONLY:
        print(f"\n  Review flagged lines above before proceeding.")


if __name__ == '__main__':
    main()
