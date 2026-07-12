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
        const lang = match[1];
        addButton(block, lang);
        block.classList.add('code-runner');
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

function addButton(block, lang) {
    if (lang === 'html') {
        // HTML blocks: button toggles preview, no auto-render
        const btn = document.createElement('i');
        btn.title = 'Show preview';
        btn.className = 'code-runner-button fa-solid fa-play';
        btn.addEventListener('click', () => {
            const existing = block.parentElement.querySelector('.code-output');
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
        block.appendChild(btn);
        return;
    }

    const btn = document.createElement('i');
    btn.title = 'Run code';
    btn.className = 'code-runner-button fa-solid fa-play';
    btn.addEventListener('click', () => {
        if (lang === 'javascript') runJS(block);
        else if (lang === 'stscript') runST(block);
    });
    block.appendChild(btn);
}

// ── Output helpers ────────────────────────────────────────────────────────

function getOutput(block) {
    let el = block.parentElement.querySelector('.code-output');
    if (!el) {
        el = document.createElement('blockquote');
        el.className = 'code-output';
        block.parentElement.appendChild(el);
    }
    el.innerHTML = '';

    const clear = document.createElement('i');
    clear.className = 'code-output-clear fa-solid fa-xmark fa-fw';
    clear.title = 'Clear';
    clear.onclick = () => el.remove();

    const loader = document.createElement('i');
    loader.className = 'code-output-hourglass fa-solid fa-hourglass fa-2x';
    loader.style.display = 'none';

    el.append(clear, loader);

    const cleared = new Promise(resolve => {
        clear.addEventListener('click', () => resolve(clearedSymbol), { once: true });
    });

    return { el, loader, cleared };
}

function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none'; }

// ── JS execution ──────────────────────────────────────────────────────────

class SandboxConsole {
    constructor(out) { this.out = out; }
    _write(args) {
        const d = document.createElement('div');
        d.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        this.out.appendChild(d);
    }
    log(...a) { this._write(a); }
    info(...a) { this._write(a); }
    warn(...a) { this._write(a); }
    error(...a) { this._write(a); }
    debug(...a) { this._write(a); }
    table(...a) { this._write(a); }
    trace(...a) { this._write(a); }
    alert(...a) { this._write(a); }
    result(v, ms) {
        const d = document.createElement('div');
        const s = document.createElement('small');
        s.textContent = `Finished in ${(ms / 1000).toFixed(2)}s. Result: ${JSON.stringify(v)}`;
        d.appendChild(s);
        this.out.appendChild(d);
    }
}

async function runJS(block) {
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
        notyf.error('Error running code', e.message);
    }
}

// ── STScript execution ────────────────────────────────────────────────────

async function runST(block) {
    const { executeSlashCommands } = SillyTavern.getContext();
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
        cc.result(result?.pipe, performance.now() - t0);
    } catch (e) {
        console.error('STScript error:', e);
        notyf.error('Error running STScript', e.message);
    }
}

// ── HTML rendering ────────────────────────────────────────────────────────

function renderHTML(block, fullSize = false) {
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
    block.parentElement.appendChild(container);
}
