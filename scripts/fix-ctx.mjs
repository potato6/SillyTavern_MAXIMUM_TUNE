import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/endpoints';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

for (const file of files) {
    const fp = path.join(dir, file);
    let code = fs.readFileSync(fp, 'utf8');
    const orig = code;

    // Pattern 1: const ctx = context as Record<string, unknown>;
    // followed by const body = ctx.body ... & const user = ctx.user ...
    code = code.replace(
        /(\s*)const ctx = context(?: as Record<string, unknown>)?;\n\1const body = ctx\.body as Record<string, unknown> \| undefined;\n\1const user = ctx\.user as (UserContext \| undefined);/g,
        '$1const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;\n$1const user = (context as Record<string, unknown>).user as $2;',
    );

    // Pattern 2: Same but body typed as just Record<string, unknown> (no | undefined)
    code = code.replace(
        /(\s*)const ctx = context(?: as Record<string, unknown>)?;\n\1const body = ctx\.body as Record<string, unknown>;\n\1const user = ctx\.user as (UserContext \| undefined);/g,
        '$1const body = (context as Record<string, unknown>).body as Record<string, unknown>;\n$1const user = (context as Record<string, unknown>).user as $2;',
    );

    // Pattern 3: const ctx = context as Record<string, unknown>;  (alone, no body/user)
    code = code.replace(
        /(\s*)const ctx = context(?: as Record<string, unknown>)?;\n/g,
        (match, indent) => {
            // Check if next lines reference ctx. — if so, skip this match (Pattern 1 already handled those)
            return match;
        },
    );

    // Pattern 4: const ctx = context as Record<string, unknown>;
    // followed by const user = ctx.user ... and const profile = ctx.profile ...
    code = code.replace(
        /(\s*)const ctx = context(?: as Record<string, unknown>)?;\n\1const user = ctx\.user as (UserContext \| undefined);\n\1const profile = ctx\.profile as (UserProfile \| undefined);/g,
        '$1const user = (context as Record<string, unknown>).user as $2;\n$1const profile = (context as Record<string, unknown>).profile as $3;',
    );

    // Pattern 5: const ctx = context as unknown as Record<string, unknown>;
    // followed by const body = ctx.body ...
    code = code.replace(
        /(\s*)const ctx = context as unknown as Record<string, unknown>;\n\1const body = ctx\.body as Record<string, unknown> \| undefined;\n\1const user = ctx\.user as (UserContext \| undefined);/g,
        '$1const body = (context as unknown as Record<string, unknown>).body as Record<string, unknown> | undefined;\n$1const user = (context as unknown as Record<string, unknown>).user as $2;',
    );

    // Pattern 6: const ctx = context; (no type assertion)
    // followed by const body = ctx.body ... and const user = ctx.user ...
    code = code.replace(
        /(\s*)const ctx = context;\n\1const body = ctx\.body as Record<string, unknown> \| undefined;\n\1const user = ctx\.user as (UserContext \| undefined);/g,
        '$1const body = (context as Record<string, unknown>).body as Record<string, unknown> | undefined;\n$1const user = (context as Record<string, unknown>).user as $2;',
    );

    // Pattern 7: const ctx = context as unknown as Record<string, unknown>;
    // followed by const body = ctx.body ... and const user = ctx.user ...
    // (slightly different)
    code = code.replace(
        /(\s*)const ctx = context as unknown as Record<string, unknown>;\n\1const user = ctx\.user as (UserContext \| undefined);\n\1const body = ctx\.body as Record<string, unknown> \| undefined;/g,
        '$1const user = (context as unknown as Record<string, unknown>).user as $2;\n$1const body = (context as unknown as Record<string, unknown>).body as Record<string, unknown> | undefined;',
    );

    // Pattern 8: const ctx = context as unknown as Record<string, unknown>;
    // followed by const user = ctx.user ...
    code = code.replace(
        /(\s*)const ctx = context as unknown as Record<string, unknown>;\n\1const user = ctx\.user as (UserContext \| undefined);/g,
        '$1const user = (context as unknown as Record<string, unknown>).user as $2;',
    );

    // Pattern 9: Remaining standalone const ctx = context lines that weren't caught
    // (ctx may be referenced elsewhere in the handler)
    // These are harder to fix automatically, so just convert them to direct access
    // where the ctx reference is used once or twice.

    if (code !== orig) {
        console.log(`Fixed: ${file}`);
        fs.writeFileSync(fp, code);
    }
}

console.log('Done');
