import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/endpoints';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

let fixed = 0;
for (const file of files) {
    const fp = path.join(dir, file);
    let code = fs.readFileSync(fp, 'utf8');
    const orig = code;

    // First pass: Remove the "const ctx = context" line entirely
    // and replace ALL subsequent ctx. references in the same handler
    // with (context as Record<string, unknown>).
    // We do this by matching the ctx assignment and then tracking
    // ctx. usage until the next handler boundary.

    // Find all handler boundaries by looking for .post(', .get(', etc.
    const handlerStarts = [
        ...code.matchAll(/(\s*)\.(post|get|put|delete|patch|use)\(\s*'(?:\/[^']*)?'/g),
    ];

    // Replace all `const ctx = context ... ;` (any variant) with nothing
    // Then replace all subsequent `ctx.` with `(context as Record<string, unknown>).`
    // We do this per handler by checking if a handler has `const ctx = context`

    const lines = code.split('\n');
    const newLines = [...lines];
    let inHandlerWithCtxAlias = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect handler start
        if (/\.(post|get|put|delete|patch|use)\(\s*'/.test(trimmed)) {
            inHandlerWithCtxAlias = false;
        }

        // Detect and remove const ctx = context line
        if (/const ctx = context/.test(trimmed) && !trimmed.includes('//')) {
            inHandlerWithCtxAlias = true;
            newLines[i] = ''; // Remove this line
            continue;
        }

        // Replace ctx. references in this handler
        if (inHandlerWithCtxAlias && /ctx\.\w+/.test(line)) {
            // Only replace ctx.property patterns (not ctx as a standalone word)
            newLines[i] = line.replace(/ctx\.(\w+)/g, '(context as Record<string, unknown>).$1');
        }
    }

    code = newLines.join('\n');

    if (code !== orig) {
        console.log(`Fixed: ${file}`);
        fixed++;
        fs.writeFileSync(fp, code);
    }
}

console.log(`Fixed ${fixed} files`);
