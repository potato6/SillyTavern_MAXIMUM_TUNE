import Sandbox from '@nyariv/sandboxjs';
import { power_user } from './power-user.js';

const clearedSymbol = Symbol('cancel');
const supportedLanguages = new Set(['javascript', 'stscript', 'html']);

/**
 * Scans chat messages for code blocks and adds run/render buttons.
 */
export function addExecuteButtonToCodeBlocks() {
    if (!power_user.enable_code_execution) {
        return;
    }
    const blocks = document.querySelectorAll('#chat .mes_text pre code');
    for (const block of blocks) {
        if (block.classList.contains('code-runner')) {
            continue;
        }
        const match = block.className.match(/language-(\w+)/);
        if (!match || !supportedLanguages.has(match[1] ?? '')) {
            continue;
        }
        const lang = match[1] ?? '';
        addButton(block as HTMLElement, lang);
        block.classList.add('code-runner');
    }
    // Auto-run when toggle is enabled
    if (power_user.auto_run_code) {
        const blocks = document.querySelectorAll('#chat .mes_text pre code.code-runner');
        for (const block of blocks) {
            const btn = block.parentElement?.nextElementSibling;
            if (btn && btn.classList.contains('code-runner-button')) {
                (btn as HTMLElement).click();
            }
        }
    }
}

/**
 * Removes all code-runner buttons and output containers.
 */
export function removeExecuteButtons() {
    document.querySelectorAll('.code-runner-button').forEach(el => el.remove());
    document.querySelectorAll('.code-output').forEach(el => el.remove());
    document.querySelectorAll('#chat .mes_text pre code.code-runner').forEach(el => el.classList.remove('code-runner'));
}

/**
 *
 * @param block
 * @param lang
 */
function addButton(block: HTMLElement, lang: string) {
    if (lang === 'html') {
        // HTML blocks: button toggles preview, no auto-render
        const btn = document.createElement('i');
        btn.title = 'Show preview';
        btn.className = 'code-runner-button fa-solid fa-play';
        btn.addEventListener('click', () => {
            const existing = block.parentElement!.querySelector('.code-output');
            if (existing) {
                existing.remove();
                btn.className = 'code-runner-button fa-solid fa-play';
                btn.title = 'Show preview';
            } else {
                renderHTML(block, true);
                btn.className = 'code-runner-button fa-solid fa-pause';
                btn.title = 'Hide preview';
            }
        });
        // Insert after the <pre> so the button stays visible if a regex hides the <pre>/<code>
        block.parentElement!.after(btn);
        return;
    }

    const btn = document.createElement('i');
    btn.title = 'Run code';
    btn.className = 'code-runner-button fa-solid fa-play';
    btn.addEventListener('click', () => {
        if (lang === 'javascript') runJS(block);
        else if (lang === 'stscript') runST(block);
    });
    // Insert after the <pre> so the button stays visible if a regex hides the <pre>/<code>
    block.parentElement!.after(btn);
}

// ── Output helpers ────────────────────────────────────────────────────────

/**
 *
 * @param block
 */
function getOutput(block: HTMLElement) {
    const pre = block.parentElement!;
    // Walk siblings after <pre> to find existing output (button may be between them)
    let el: HTMLElement | null = pre.nextElementSibling as HTMLElement | null;
    while (el && !el.classList.contains('code-output')) el = el.nextElementSibling as HTMLElement | null;
    if (!el) {
        el = document.createElement('blockquote');
        el.className = 'code-output';
        pre.after(el);
    }
    el.innerHTML = '';

    const clear = document.createElement('i');
    clear.className = 'code-output-clear fa-solid fa-xmark fa-fw';
    clear.title = 'Clear';
    clear.onclick = () => el!.remove();

    const loader = document.createElement('i');
    loader.className = 'code-output-hourglass fa-solid fa-hourglass fa-2x';
    loader.style.display = 'none';

    el.append(clear, loader);

    const cleared = new Promise<symbol>(resolve => {
        clear.addEventListener('click', () => resolve(clearedSymbol), { once: true });
    });

    return { el, loader, cleared };
}

/**
 *
 * @param el
 */
function show(el: HTMLElement) { el.style.display = 'block'; }
/**
 *
 * @param el
 */
function hide(el: HTMLElement) { el.style.display = 'none'; }

// ── JS execution ──────────────────────────────────────────────────────────

class SandboxConsole {
    out: HTMLElement;
    constructor(out: HTMLElement) { this.out = out; }
    _write(args: unknown[]) {
        const d = document.createElement('div');
        d.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        this.out.appendChild(d);
    }
    log(...a: unknown[]) { this._write(a); }
    info(...a: unknown[]) { this._write(a); }
    warn(...a: unknown[]) { this._write(a); }
    error(...a: unknown[]) { this._write(a); }
    debug(...a: unknown[]) { this._write(a); }
    table(...a: unknown[]) { this._write(a); }
    trace(...a: unknown[]) { this._write(a); }
    alert(...a: unknown[]) { this._write(a); }
    result(v: unknown, ms: number) {
        const d = document.createElement('div');
        const s = document.createElement('small');
        s.textContent = `Finished in ${(ms / 1000).toFixed(2)}s. Result: ${JSON.stringify(v)}`;
        d.appendChild(s);
        this.out.appendChild(d);
    }
}

/**
 *
 * @param block
 */
async function runJS(block: HTMLElement) {
    try {
        const { el, loader, cleared } = getOutput(block);
        show(loader);
        const cc = new SandboxConsole(el);
        const code = block.textContent.trim();

        const protos = Sandbox.SAFE_PROTOTYPES;
        protos.set(SandboxConsole, new Set());

        const sandbox = new Sandbox({
            globals: {
                ...Sandbox.SAFE_GLOBALS,
                console: cc,
                alert: cc.alert.bind(cc),
                setTimeout, clearTimeout, setInterval, clearInterval,
            },
            prototypeWhitelist: protos,
        });

        const t0 = performance.now();
        const result = await Promise.race([sandbox.compileAsync(code)({}).run(), cleared]);
        hide(loader);
        if (result === clearedSymbol) return;
        cc.result(result, performance.now() - t0);
    } catch (e) {
        console.error('Code runner error:', e);
        notyf.error('Error running code', e instanceof Error ? e.message : String(e));
    }
}

// ── STScript execution ────────────────────────────────────────────────────

/**
 *
 * @param block
 */
async function runST(block: HTMLElement) {
    const { executeSlashCommands } = SillyTavern.getContext() as unknown as { executeSlashCommands: (code: string, handleParserErrors?: boolean, scope?: unknown, handleExecutionErrors?: boolean, parserFlags?: unknown, abortController?: AbortController, onProgress?: () => void) => Promise<string> };
    try {
        const { el, loader, cleared } = getOutput(block);
        show(loader);
        const code = block.textContent.trim();
        const ac = new AbortController();
        const t0 = performance.now();
        const result = await Promise.race([
            executeSlashCommands(code, true, null, false, null, ac, () => {}),
            cleared,
        ]);
        hide(loader);
        if (result === clearedSymbol) { ac.abort(); return; }
        const cc = new SandboxConsole(el);
        cc.result((result as unknown as Record<string, unknown>)?.pipe, performance.now() - t0);
    } catch (e) {
        console.error('STScript error:', e);
        notyf.error('Error running STScript', e instanceof Error ? e.message : String(e));
    }
}

// ── HTML rendering ────────────────────────────────────────────────────────

/**
 *
 * @param block
 * @param fullSize
 */
function renderHTML(block: HTMLElement, fullSize = false) {
    // Only one HTML preview at a time — remove all existing code-outputs
    document.querySelectorAll('#chat .code-output').forEach(el => el.remove());

    const html = block.textContent.trim();
    const container = document.createElement('div');
    container.className = 'code-output';

    const clear = document.createElement('i');
    clear.className = 'code-output-clear fa-solid fa-xmark fa-fw';
    clear.title = 'Close preview';
    clear.onclick = () => container.remove();

    const expand = document.createElement('i');
    expand.className = 'code-output-expand fa-solid fa-expand fa-fw';
    expand.title = 'Toggle size';
    expand.onclick = () => {
        iframe.style.height = iframe.style.height === '500px' ? '200px' : '500px';
    };

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.cssText = `width:100%;height:${fullSize ? '500' : '200'}px;border:1px solid var(--border_color);border-radius:4px;margin-top:4px;background:#fff`;
    iframe.srcdoc = html;

    container.append(clear, expand, iframe);
    // Place after the <pre> so it stays visible even if a regex hides the code block
    block.parentElement!.after(container);
}
