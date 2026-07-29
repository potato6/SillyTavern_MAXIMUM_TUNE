import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/endpoints';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

let fixed = 0;
for (const file of files) {
    const fp = path.join(dir, file);
    let code = fs.readFileSync(fp, 'utf8');
    const orig = code;

    // Replace const ctx = context as ...; maintaining in-line the subsequent ctx.* refs
    // This handles ALL variations in one pass
    code = code.replace(
        /(\s*)const ctx = context(?: as Record<string, unknown>)?;\s*\n/gm,
        (match, indent) => {
            // Only remove the line — ctx.* references will be replaced below
            return '';
        },
    );

    // Replace ctx.body with (context as Record<string, unknown>).body
    // and ctx.user with (context as Record<string, unknown>).user
    // and ctx.file with (context as Record<string, unknown>).file
    // and ctx.profile with (context as Record<string, unknown>).profile
    // and ctx._exportResult with (context as Record<string, unknown>)._exportResult
    // and any other ctx.property
    code = code.replace(/ctx\.(\w+)/g, '(context as Record<string, unknown>).$1');

    if (code !== orig) {
        console.log(`Fixed: ${file}`);
        fixed++;
        fs.writeFileSync(fp, code);
    }
}

console.log(`Fixed ${fixed} files`);
