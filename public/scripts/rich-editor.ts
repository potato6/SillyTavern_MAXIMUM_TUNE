/**
 * ToastUI markdown / WYSIWYG editor — native GFM markdown support.
 *
 * Two entry points:
 *   openRichEditor(el)       – content IS HTML, opens in WYSIWYG mode
 *   openMarkdownEditor(el)   – content is markdown, opens in WYSIWYG mode
 *
 * Both use WYSIWYG by default. The useMarkdown flag only controls whether
 * getMarkdown() or getHTML() is called on close (input/output format).
 *
 * ToastUI handles the markdown ↔ HTML round-trip natively, so we don't
 * need converter / turndown at all.
 */

import { callGenericPopup, POPUP_TYPE } from './popup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load CSS by URL and resolve when loaded (skip if already present).
 * @param url
 */
function loadCSS(url: string): Promise<void> {
    if (document.querySelector(`link[href="${url}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load CSS ${url}`));
        document.head.appendChild(link);
    });
}

/**
 *
 * @param el
 * @param contentEditable
 */
function getRawValue(el: HTMLElement, contentEditable: boolean): string {
    return String(contentEditable ? el.innerText : (el as HTMLInputElement).value);
}

/**
 *
 * @param el
 * @param contentEditable
 * @param value
 */
function setRawValue(el: HTMLElement, contentEditable: boolean, value: string): void {
    if (contentEditable) {
        el.innerText = value;
    } else {
        (el as HTMLInputElement).value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

interface EditorOptions {
    contentEditable?: boolean;
}

/** Minimal interface for ToastUI editor methods we use. */
interface ToastEditorHandle {
    getMarkdown(): string;
    getHTML(): string;
    destroy(): void;
    focus(): void;
    getCurrentModeEditor(): {
        getSelectedText?(): string;
        replaceSelection(s: string): void;
        view?: unknown;
    };
}

// ---------------------------------------------------------------------------
// Core popup
// ---------------------------------------------------------------------------

/**
 *
 * @param broEl
 * @param useMarkdown
 * @param _options
 */
async function openToastPopup(
    broEl: HTMLElement,
    useMarkdown: boolean,
    _options: EditorOptions = {},
): Promise<void> {
    const contentEditable = _options.contentEditable ?? broEl.hasAttribute('contenteditable');

    const raw = getRawValue(broEl, contentEditable);

    // Create the container – ToastUI needs a plain div (not textarea)
    const container = document.createElement('div');
    container.id = 'toast-editor';
    container.style.cssText = 'width:100%; height:100%; min-height:400px;';

    let editorHandle: ToastEditorHandle | null = null;

    await callGenericPopup(container, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,

        onOpen: async () => {
            // 1. Load ToastUI base CSS (theme comes from SillyTavern CSS vars instead of separate dark CSS)
            await loadCSS('/lib/toastui/toastui-editor.css');

            // 2. Dynamically import ToastUI Editor
            // @ts-expect-error ToastUI Editor types not available
            const Editor = (await import('@toast-ui/editor')).default;

            // 3. Init editor
            const editor = new Editor({
                el: container,
                height: '100%',
                initialEditType: 'wysiwyg',
                previewStyle: 'vertical',
                initialValue: raw,
                theme: 'dark',
                usageStatistics: false,
                toolbarItems: [
                    ['heading', 'bold', 'italic', 'strike'],
                    ['hr', 'quote'],
                    ['ul', 'ol', 'task'],
                    ['table', 'link'],
                    ['code', 'codeblock'],
                    ['scrollSync'],
                ],
                customHTMLRenderer: {
                    text(node: { literal?: string }) {
                        const text = node?.literal;
                        if (typeof text !== 'string') return [{ type: 'text', content: '' }];
                        if (
                            !text.includes('"') &&
                            !text.includes('\u201C') &&
                            !text.includes('\u201D')
                        ) {
                            return [{ type: 'text', content: text }];
                        }
                        try {
                            // Single alternation: match either "straight" or \u201Ccurly\u201D,
                            // wrap both in the same styled span — no double-wrapping possible.
                            const result = text.replace(
                                /"([^"]*)"|(\u201C[^\u201D]*\u201D)/g,
                                (_m: string, straight: string, curly: string) =>
                                    straight
                                        ? `<span class="quote-text">\u201C${straight}\u201D</span>`
                                        : `<span class="quote-text">${curly}</span>`,
                            );
                            return [{ type: 'html', content: result }];
                        } catch {
                            return [{ type: 'text', content: text }];
                        }
                    },
                },
            });

            // 4. Inject theme styles — using SillyTavern CSS variables instead of a separate dark CSS file
            const themeStyle = document.createElement('style');
            themeStyle.textContent = `
                /* ── Content area (editor body) ── */
                .ProseMirror,
                .toastui-editor-contents {
                    background: var(--SmartThemeBlurTintColor, #1a1a2e);
                    color: var(--SmartThemeBodyColor, #e0e0e0);
                    text-align: left;
                }
                /* Override hardcoded light-theme colors on content children
                   that have higher specificity than the parent rule above */
                .toastui-editor-contents p,
                .toastui-editor-contents h1,
                .toastui-editor-contents h2,
                .toastui-editor-contents h3,
                .toastui-editor-contents h4,
                .toastui-editor-contents h5,
                .toastui-editor-contents h6,
                .toastui-editor-contents blockquote p,
                .toastui-editor-contents li,
                .toastui-editor-contents dd,
                .toastui-editor-contents dt {
                    color: var(--SmartThemeBodyColor, #e0e0e0);
                }
                .toastui-editor-contents blockquote {
                    border-left-color: var(--SmartThemeQuoteColor, #e18a24);
                    color: var(--SmartThemeEmColor, #919191);
                }
                .toastui-editor-contents a {
                    color: var(--SmartThemeLinkColor, #6fb3d2);
                }
                .toastui-editor-contents code,
                .toastui-editor-contents pre {
                    background: var(--black50a, rgba(0,0,0,0.5));
                }
                .toastui-editor-contents strong { color: var(--SmartThemeBodyColor, #e0e0e0); }
                /* Quotation marks inherit the "Quote Text" theme color */
                .toastui-editor-contents .quote-text {
                    color: var(--SmartThemeQuoteColor, #e18a24);
                }

                /* ── UI Chrome — inherited from SillyTavern theme variables ── */
                .toastui-editor-dark.toastui-editor-defaultUI {
                    border-color: var(--SmartThemeBorderColor, #494c56);
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-defaultUI button {
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-md-container,
                .toastui-editor-dark .toastui-editor-ww-container {
                    background-color: var(--SmartThemeBlurTintColor, #121212);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar {
                    background-color: var(--SmartThemeBlurTintColor, #232428);
                    border-bottom-color: var(--SmartThemeBorderColor, #303238);
                }
                .toastui-editor-dark .toastui-editor-toolbar-icons {
                    background-position-y: -49px;
                    border-color: transparent;
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-toolbar-icons:not(:disabled):hover {
                    background-color: var(--SmartThemeShadowColor, #36383f);
                    border-color: var(--SmartThemeBorderColor, #36383f);
                }
                .toastui-editor-dark .toastui-editor-toolbar-divider {
                    background-color: var(--SmartThemeBorderColor, #303238);
                }
                .toastui-editor-dark .toastui-editor-tooltip {
                    background-color: var(--SmartThemeBlurTintColor, #535662);
                }
                .toastui-editor-dark .toastui-editor-tooltip .arrow {
                    background-color: var(--SmartThemeBlurTintColor, #535662);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar .scroll-sync::before {
                    color: var(--SmartThemeEmColor, #8f939f);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar .scroll-sync.active::before {
                    color: var(--SmartThemeQuoteColor, #67ccff);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar .switch {
                    background-color: var(--SmartThemeBorderColor, #2b4455);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar .switch::before {
                    background-color: var(--SmartThemeBodyColor, #8f939f);
                }
                .toastui-editor-dark .toastui-editor-defaultUI-toolbar input:checked + .switch::before {
                    background-color: var(--SmartThemeQuoteColor, #67ccff);
                }
                .toastui-editor-dark .toastui-editor-main .toastui-editor-md-splitter {
                    background-color: var(--SmartThemeBorderColor, #303238);
                }
                .toastui-editor-dark .toastui-editor-mode-switch {
                    border-top-color: var(--SmartThemeBorderColor, #393b42);
                    background-color: var(--SmartThemeBlurTintColor, #121212);
                }
                .toastui-editor-dark .toastui-editor-mode-switch .tab-item {
                    border-color: var(--SmartThemeBorderColor, #393b42);
                    background-color: transparent;
                    color: var(--SmartThemeEmColor, #757a86);
                }
                .toastui-editor-dark .toastui-editor-mode-switch .tab-item.active {
                    border-top-color: var(--SmartThemeBlurTintColor, #121212);
                    background-color: var(--SmartThemeBlurTintColor, #121212);
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-popup,
                .toastui-editor-dark .toastui-editor-context-menu {
                    background-color: var(--SmartThemeBlurTintColor, #121212);
                    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08);
                    border-color: var(--SmartThemeBorderColor, #494c56);
                }
                .toastui-editor-dark .toastui-editor-popup-add-heading ul li:hover {
                    background-color: var(--SmartThemeShadowColor, #36383f);
                }
                .toastui-editor-dark .toastui-editor-popup-body label {
                    color: var(--SmartThemeEmColor, #9a9da3);
                }
                .toastui-editor-dark .toastui-editor-popup-body input[type='text'] {
                    background-color: transparent;
                    color: var(--SmartThemeBodyColor, #eee);
                    border-color: var(--SmartThemeBorderColor, #303238);
                }
                .toastui-editor-dark .toastui-editor-popup-body input[type='text']:focus {
                    outline-color: var(--SmartThemeQuoteColor, #67ccff);
                }
                .toastui-editor-dark .toastui-editor-md-tab-container {
                    background-color: var(--SmartThemeBlurTintColor, #232428);
                    border-bottom-color: var(--SmartThemeBorderColor, #303238);
                }
                .toastui-editor-dark .toastui-editor-md-tab-container .tab-item {
                    border-color: var(--SmartThemeBorderColor, #393b42);
                    background-color: transparent;
                    color: var(--SmartThemeEmColor, #757a86);
                }
                .toastui-editor-dark .toastui-editor-md-tab-container .tab-item.active {
                    border-bottom-color: var(--SmartThemeBlurTintColor, #121212);
                    background-color: var(--SmartThemeBlurTintColor, #121212);
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-context-menu .menu-group {
                    border-bottom-color: var(--SmartThemeBorderColor, #303238);
                    color: var(--SmartThemeBodyColor, #eee);
                }
                .toastui-editor-dark .toastui-editor-context-menu .menu-item span::before {
                    background-position-y: -126px;
                }
                .toastui-editor-dark .toastui-editor-context-menu li:not(.disabled):hover {
                    background-color: var(--SmartThemeShadowColor, #36383f);
                }
                .toastui-editor-dark .toastui-editor-context-menu li.disabled {
                    color: var(--SmartThemeEmColor, #969aa5);
                }
                .toastui-editor-dark .toastui-editor-dropdown-toolbar {
                    border-color: var(--SmartThemeBorderColor, #494c56);
                    background-color: var(--SmartThemeBlurTintColor, #232428);
                }
            `;
            container.appendChild(themeStyle);

            const LQ = '\u201C',
                RQ = '\u201D';
            const doInlineQuote = () => {
                editor.focus();
                const cm = editor.getCurrentModeEditor();
                const sel = cm.getSelectedText?.() || '';
                if (!sel) return;

                // Toggle: unwrap if already quoted
                if (
                    (sel.startsWith('"') || sel.startsWith(LQ)) &&
                    (sel.endsWith('"') || sel.endsWith(RQ)) &&
                    sel.length >= 2
                ) {
                    cm.replaceSelection(sel.slice(1, -1));
                    return;
                }

                // WYSIWYG mode: insert styled HTML via contenteditable API
                if (cm.view) {
                    const html = `<span style="color:var(--SmartThemeQuoteColor,#e18a24)">${LQ}${sel}${RQ}</span>`;
                    document.execCommand('insertHTML', false, html);
                } else {
                    // Markdown mode: plain text
                    cm.replaceSelection(LQ + sel + RQ);
                }
            };

            // Add the quote button to the toolbar (leftmost position)
            const addQuoteBtn = (toolbarEl: HTMLElement) => {
                if (toolbarEl.querySelector('[title="Inline quote"]')) return;
                if (!toolbarEl.querySelector('.toastui-editor-toolbar-group')) return;
                const group = document.createElement('div');
                group.className = 'toastui-editor-toolbar-group';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'toastui-editor-toolbar-icons';
                btn.title = 'Inline quote';
                btn.innerHTML = '\u201C';
                btn.style.cssText =
                    'font-size:19px; font-weight:bold; color:var(--SmartThemeQuoteColor,#e18a24); line-height:1; padding:0 6px;';
                btn.addEventListener('click', doInlineQuote);
                group.appendChild(btn);
                toolbarEl.prepend(group);
            };
            const pollInterval = setInterval(() => {
                const toolbar = container.querySelector('.toastui-editor-defaultUI-toolbar');
                if (toolbar && toolbar.querySelector('.toastui-editor-toolbar-group')) {
                    addQuoteBtn(toolbar as HTMLElement);
                    clearInterval(pollInterval);
                }
            }, 50);
            setTimeout(() => clearInterval(pollInterval), 5000);

            // Store reference for onClose
            editorHandle = editor as unknown as ToastEditorHandle;
        },

        onClose: async () => {
            const editor = editorHandle;
            if (!editor) return;

            try {
                const result = useMarkdown ? editor.getMarkdown() : editor.getHTML();
                setRawValue(broEl, contentEditable, result);
            } finally {
                editor.destroy();
                editorHandle = null;
            }
        },
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 *
 * @param broEl
 * @param options
 */
export async function openRichEditor(
    broEl: HTMLElement,
    options: EditorOptions = {},
): Promise<void> {
    return openToastPopup(broEl, false, options);
}

/**
 *
 * @param broEl
 * @param options
 */
export async function openMarkdownEditor(
    broEl: HTMLElement,
    options: EditorOptions = {},
): Promise<void> {
    return openToastPopup(broEl, true, options);
}
