/* global SillyTavern */
import Sandbox from '@nyariv/sandboxjs';
import { power_user } from '../../power-user.js';

const {
    eventSource,
    event_types,
    executeSlashCommands,
} = SillyTavern.getContext();

const events = [
    event_types.CHARACTER_MESSAGE_RENDERED,
    event_types.USER_MESSAGE_RENDERED,
    event_types.CHAT_CHANGED,
    event_types.MESSAGE_SWIPED,
];

if ('MESSAGE_UPDATED' in event_types) {
    events.push(event_types.MESSAGE_UPDATED);
} else if ('MESSAGE_EDITED' in event_types) {
    events.push(event_types.MESSAGE_EDITED);
}

const clearedSymbol = Symbol('cancel');
const supportedLanguages = [
    'language-javascript',
    'language-stscript',
    'language-html',
];

// Listen to chat events
for (const event of events) {
    eventSource.on(event, addExecuteButtonToCodeBlocks);
}

/**
 * Adds run/render buttons to all matching code blocks in chat messages.
 */
function addExecuteButtonToCodeBlocks() {
    if (!power_user.enable_code_execution) {
        return;
    }
    const blocks = Array.from(document.querySelectorAll('#chat .mes_text pre code'));
    for (const block of blocks) {
        if (block.classList.contains('code-runner')) {
            continue;
        }
        const langClass = supportedLanguages.find((lang) => block.classList.contains(lang));
        if (langClass) {
            const language = block.className.match(/language-(\w+)/)?.[1];
            if (!language) continue;
            addExecuteButton(block, language);
            block.classList.add('code-runner');
        }
    }
}

/**
 * Adds a run/render button to the code block.
 * @param {HTMLElement} block Code block element.
 * @param {string} language Language of the code block.
 */
function addExecuteButton(block, language) {
    const button = document.createElement('i');
    button.title = language === 'html' ? 'Render HTML' : 'Run code';
    button.classList.add('code-runner-button', 'fa-solid', 'fa-play');
    button.addEventListener('click', () => {
        if (language === 'javascript') {
            runJavaScriptCode(block);
        }
        if (language === 'stscript') {
            runSTScriptCode(block);
        }
        if (language === 'html') {
            renderHTMLCode(block);
        }
    });
    block.appendChild(button);
}

/**
 * Gets or creates the output container for the code block.
 * @param {HTMLElement} block
 * @returns {{outputElement: HTMLElement, clearClicked: Promise<Symbol>}}
 */
function getOutputElement(block) {
    let outputElement = block.parentElement.querySelector('.code-output');
    if (!outputElement) {
        outputElement = document.createElement('blockquote');
        outputElement.classList.add('code-output');
        block.parentElement.appendChild(outputElement);
    }
    outputElement.innerHTML = '';
    const loader = document.createElement('i');
    loader.classList.add('code-output-hourglass', 'fa-solid', 'fa-hourglass', 'fa-2x');
    loader.style.display = 'none';
    const clearButton = document.createElement('i');
    clearButton.classList.add('code-output-clear', 'fa-solid', 'fa-xmark', 'fa-fw');
    clearButton.title = 'Clear output';
    clearButton.onclick = () => {
        outputElement.remove();
    };
    outputElement.appendChild(clearButton);
    outputElement.appendChild(loader);
    const clearClicked = new Promise((resolve) => {
        clearButton.addEventListener('click', () => resolve(clearedSymbol), { once: true });
    });
    return { outputElement, clearClicked };
}

function showLoader(outputElement) {
    const loader = outputElement.querySelector('.code-output-hourglass');
    if (loader) loader.style.display = 'block';
}

function hideLoader(outputElement) {
    const loader = outputElement.querySelector('.code-output-hourglass');
    if (loader) loader.style.display = 'none';
}

/**
 * Captures console.* calls and displays them in the output element.
 */
class CustomConsole {
    constructor(outputElement) {
        this.#setupShims();
        this.outputElement = outputElement;
    }
    #setupShims() {
        for (const key of Object.keys(console)) {
            if (typeof console[key] === 'function' && !this[key]) {
                this[key] = () => {};
            }
        }
    }
    #addToOutput(args) {
        const div = document.createElement('div');
        const text = args.reduce((acc, arg) => {
            switch (typeof arg) {
                case 'object': return acc + JSON.stringify(arg) + ' ';
                default: return acc + String(arg) + ' ';
            }
        }, '');
        div.textContent = text;
        this.outputElement.appendChild(div);
    }
    info(...args) { this.#addToOutput(args); }
    log(...args) { this.#addToOutput(args); }
    error(...args) { this.#addToOutput(args); }
    warn(...args) { this.#addToOutput(args); }
    debug(...args) { this.#addToOutput(args); }
    table(...args) { this.#addToOutput(args); }
    trace(...args) { this.#addToOutput(args); }
    alert(...args) { this.#addToOutput(args); }
    addResult(result, time) {
        const div = document.createElement('div');
        const small = document.createElement('small');
        small.textContent = `Finished in ${(time / 1000).toFixed(2)}s. Result: ${JSON.stringify(result)}`;
        div.appendChild(small);
        this.outputElement.appendChild(div);
    }
}

async function runJavaScriptCode(block) {
    try {
        const { outputElement, clearClicked } = getOutputElement(block);
        showLoader(outputElement);
        const customConsole = new CustomConsole(outputElement);
        const code = block.textContent;
        const prototypeWhitelist = Sandbox.SAFE_PROTOTYPES;
        prototypeWhitelist.set(CustomConsole, new Set());
        const globals = {
            ...Sandbox.SAFE_GLOBALS,
            alert: customConsole.alert.bind(customConsole),
            console: customConsole,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
        };
        const sandbox = new Sandbox({ globals, prototypeWhitelist });
        const scope = {};
        const execAsync = sandbox.compileAsync(code);
        const start = Date.now();
        const result = await Promise.race([execAsync(scope).run(), clearClicked]);
        hideLoader(outputElement);
        if (result === clearedSymbol) return;
        customConsole.addResult(result, Date.now() - start);
    } catch (error) {
        console.error('Error running code', error);
        notyf.error('Error running code', error.message);
    }
}

async function runSTScriptCode(block) {
    try {
        const { outputElement, clearClicked } = getOutputElement(block);
        const code = block.textContent;
        const abortController = new AbortController();
        const customConsole = new CustomConsole(outputElement);
        showLoader(outputElement);
        const start = Date.now();
        const executePromise = executeSlashCommands(code, true, null, false, null, abortController, () => {});
        const result = await Promise.race([executePromise, clearClicked]);
        hideLoader(outputElement);
        if (result === clearedSymbol) {
            abortController.abort();
            return;
        }
        customConsole.addResult(result?.pipe, Date.now() - start);
    } catch (error) {
        console.error('Error running code', error);
        notyf.error('Error running code', error.message);
    }
}

/**
 * Renders HTML code in a sandboxed iframe below the code block.
 * @param {HTMLElement} block
 */
function renderHTMLCode(block) {
    // Remove any existing output for this block
    const existing = block.parentElement.querySelector('.code-output');
    if (existing) existing.remove();

    const html = block.textContent;
    const container = document.createElement('div');
    container.classList.add('code-output');

    const clearButton = document.createElement('i');
    clearButton.classList.add('code-output-clear', 'fa-solid', 'fa-xmark', 'fa-fw');
    clearButton.title = 'Close preview';
    clearButton.onclick = () => container.remove();

    const expandButton = document.createElement('i');
    expandButton.classList.add('code-output-expand', 'fa-solid', 'fa-expand', 'fa-fw');
    expandButton.title = 'Toggle size';
    expandButton.onclick = () => {
        iframe.style.height = iframe.style.height === '500px' ? '200px' : '500px';
    };

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.width = '100%';
    iframe.style.height = '200px';
    iframe.style.border = '1px solid var(--border_color)';
    iframe.style.borderRadius = '4px';
    iframe.style.marginTop = '4px';
    iframe.style.background = '#fff';

    // Write HTML into iframe
    iframe.srcdoc = html;

    container.appendChild(clearButton);
    container.appendChild(expandButton);
    container.appendChild(iframe);
    block.parentElement.appendChild(container);
}
