import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'node:fs/promises';

const endpointDir = 'src/endpoints';

async function main() {
    const files = fs.readdirSync(endpointDir).filter((f) => f.endsWith('.ts'));

    for (const file of files) {
        const filePath = path.join(endpointDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        let changed = false;

        // Pattern: const ctx = context as Record<string, unknown>;
        // Followed by: const body = ctx.body as ...;
        // Followed by: const user = ctx.user as ...;
        // etc.
        // Replace with: access context directly

        // Match lines that start with whitespace + "const ctx = context"
        const ctxLines = [
            ...content.matchAll(/^(\s*)const ctx = context( as Record<string, unknown>)?;\s*$/gm),
        ];

        for (const match of ctxLines.reverse()) {
            const lineStart = match.index;
            const lineEnd = lineStart + match[0].length;
            const indent = match[1];

            // Get the next lines to see what follows
            const rest = content.slice(lineEnd);
            const nextLines = rest.split('\n').slice(0, 5).join('\n');

            // Find all ctx.property assignments in the next few lines
            const assignments = [
                ...nextLines.matchAll(
                    new RegExp(
                        `^${indent}const (\\w+) = ctx\\.(\\w+) as Record<string, unknown> \\| undefined;\\s*$`,
                        'gm',
                    ),
                ),
            ];

            if (assignments.length === 0) {
                // Just remove the ctx line
                content = content.slice(0, lineStart) + content.slice(lineEnd + 1);
                changed = true;
                continue;
            }

            // Replace ctx line + subsequent assignment lines with direct context access
            let newLines = '';
            const linesToRemove = [0]; // track which subsequent lines to remove (0 = the ctx line itself)
            let lastRemovedEnd = lineEnd;

            for (const [i, assign] of assignments.entries()) {
                const assignStart = lineEnd + assign.index;
                const assignEnd = assignStart + assign[0].length;
                const varName = assign[1];
                const propName = assign[2];

                // Replace the assignment line with direct access
                const replacement = `${indent}const ${varName} = (context as Record<string, unknown>).${propName} as Record<string, unknown> | undefined;\n`;

                if (i === 0) {
                    // First assignment: remove ctx line, include first assignment's replacement
                    content =
                        content.slice(0, lineStart) + replacement + content.slice(assignEnd + 1);
                } else {
                    // Subsequent assignments: replace
                    content =
                        content.slice(0, assignStart) + replacement + content.slice(assignEnd + 1);
                }
                changed = true;

                // Adjust subsequent match positions
                for (const laterMatch of assignments.slice(i + 1)) {
                    if (laterMatch.index > assign.index) {
                        laterMatch.index += replacement.length - assign[0].length;
                    }
                }
            }
        }

        if (changed) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed: ${file}`);
        }
    }
}

main().catch(console.error);
