import { DOMPurify, css } from '../../lib.js';
import { accountStorage } from '../util/AccountStorage.js';
import {
    converter,
    characters,
    this_chid,
    substituteParams,
} from '../../script.js';
import { getCurrentEntityId, isExternalMediaAllowed } from '../chats.js';
import { selected_group } from '../group-chats.js';
import { power_user } from '../power-user.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from '../popup.js';
import { t } from '../i18n.js';
import { loadTemplate, confirmDialog } from './shared.js';

/**
 * @typedef {import('./types.js').FileAttachment} FileAttachment
 */

// ── Style Preferences ─────────────────────────────────────────

/**
 * Class to manage style preferences for characters.
 */
export class StylesPreference {
    constructor(public avatarId: string | null) {}

    get key(): string {
        return `AllowGlobalStyles-${this.avatarId}`;
    }

    exists(): boolean {
        return this.avatarId
            ? accountStorage.getItem(this.key) !== null
            : true;
    }

    get(): boolean {
        return this.avatarId
            ? accountStorage.getItem(this.key) === 'true'
            : false;
    }

    set(allowed: boolean): void {
        if (this.avatarId) {
            accountStorage.setItem(this.key, String(allowed));
        }
    }
}

// ── Style Encoding / Decoding ─────────────────────────────────

/**
 * Encodes <style> tags as <custom-style> elements with URI-encoded content.
 */
export function encodeStyleTags(text: string): string {
    const styleRegex = /<style>(.+?)<\/style>/gims;
    return text.replaceAll(styleRegex, (_, match: string) => {
        return `<custom-style>${encodeURIComponent(match)}</custom-style>`;
    });
}

/**
 * Decodes <custom-style> elements back to <style> tags and sanitizes CSS.
 */
export function decodeStyleTags(
    text: string,
    { prefix }: { prefix?: string } = {},
): string {
    const styleDecodeRegex = /<custom-style>(.+?)<\/custom-style>/gms;
    const mediaAllowed = isExternalMediaAllowed();

    function sanitizeRule(rule: any): any {
        if (Array.isArray(rule.selectors)) {
            rule.selectors = rule.selectors
                .map((s: string) => sanitizeSelector(s))
                .filter(Boolean);
        }
        return rule;
    }

    function sanitizeSelector(selector: string): string {
        const pseudoClasses = ['hover', 'active', 'focus', 'visited', 'link', 'checked', 'disabled', 'enabled', 'empty', 'target'];
        const pseudoRegex = new RegExp(`:(${pseudoClasses.join('|')})`, 'gi');
        const sanitizedContent = selector.replace(pseudoRegex, ':custom-$1');

        const parts = sanitizedContent.split(/\s+/);
        const sanitizedParts = parts.map((part) => sanitizeSimpleSelector(part));
        return sanitizedParts.join(' ');
    }

    function sanitizeSimpleSelector(selector: string): string {
        let sanitized = selector.replace(/::before/gi, '').replace(/::after/gi, '').replace(/::selection/gi, '');
        sanitized = sanitized.replace(/\[.*?\]/g, '');
        if (sanitized.startsWith(prefix || '.mes_text ')) {
            sanitized = sanitized.substring((prefix || '.mes_text ').length);
        }
        return sanitized;
    }

    function sanitizeRuleSet(ruleSet: any): string {
        if (Array.isArray(ruleSet.rules)) {
            for (const rule of ruleSet.rules) {
                if (rule.type === 'rule') {
                    sanitizeRule(rule);
                }
                if (rule.type === 'media' && Array.isArray(rule.rules)) {
                    for (const mediaRule of rule.rules) {
                        if (mediaRule.type === 'rule') {
                            sanitizeRule(mediaRule);
                        }
                    }
                }
            }
        }
        return '';
    }

    return text.replace(styleDecodeRegex, (_, match: string) => {
        try {
            const styleCleaned = decodeURIComponent(match);
            // Try CSS parsing with @adobe/css-tools
            try {
                const ast = css.parse(styleCleaned, { silent: true });
                if (ast.stylesheet && Array.isArray(ast.stylesheet.rules)) {
                    for (const rule of ast.stylesheet.rules) {
                        sanitizeRuleSet(rule);
                    }
                    const styleText = css.stringify(ast);
                    return `<style>${styleText}</style>`;
                }
            } catch {
                // Fall through to simple sanitization
            }

            const sheet = styleCleaned
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!sheet) return '';
            return `<style>${sheet}</style>`;
        } catch {
            return '';
        }
    });
}

// ── Creator Notes Formatting ──────────────────────────────────

/**
 * Formats creator notes in the message text.
 * @param text Raw Markdown text
 * @param avatarId Avatar ID
 * @returns Formatted HTML text
 */
export function formatCreatorNotes(text: string, avatarId: string): string {
    const preference = new StylesPreference(avatarId);
    const sanitizeStyles = !preference.get();
    const decodeStyleParam = { prefix: sanitizeStyles ? '#creator_notes_spoiler ' : '' };
    const config = {
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
        MESSAGE_SANITIZE: true,
        ADD_TAGS: ['custom-style'],
    };

    let html = converter.render(substituteParams(text));
    html = encodeStyleTags(html);
    html = DOMPurify.sanitize(html, config);
    html = decodeStyleTags(html, decodeStyleParam);

    return html;
}

// ── DOMPurify Hooks ───────────────────────────────────────────

/**
 * Adds DOMPurify hooks for message sanitization.
 */
export function addDOMPurifyHooks(): void {
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if ('target' in node) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener');
        }
    });

    DOMPurify.addHook('uponSanitizeAttribute', (node, data, config) => {
        if (!config.MESSAGE_SANITIZE) {
            return;
        }

        const permittedNodeTypes = ['BUTTON', 'DIV'];
        if (config.MESSAGE_ALLOW_SYSTEM_UI && node.classList.contains('menu_button') && permittedNodeTypes.includes(node.nodeName)) {
            return;
        }

        switch (data.attrName) {
            case 'class': {
                if (data.attrValue) {
                    data.attrValue = data.attrValue.split(' ').map((v: string) => {
                        if (v.startsWith('fa-') || v.startsWith('note-') || v === 'monospace') {
                            return v;
                        }
                        return 'custom-' + v;
                    }).join(' ');
                }
                break;
            }
        }
    });

    DOMPurify.addHook('uponSanitizeElement', (node, _, config) => {
        if (!config.MESSAGE_SANITIZE) {
            return;
        }

        // Replace line breaks with <br> in unknown elements
        if (node instanceof HTMLUnknownElement) {
            node.innerHTML = node.innerHTML.trim();

            const candidates: Text[] = [];
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const textNode = walker.currentNode as Text;
                if (!textNode.data.includes('\n')) continue;
                if (textNode.parentElement && textNode.parentElement.closest('pre')) continue;
                candidates.push(textNode);
            }

            for (const textNode of candidates) {
                const parts = textNode.data.split('\n');
                const frag = document.createDocumentFragment();
                parts.forEach((part, idx) => {
                    if (part.length) {
                        frag.appendChild(document.createTextNode(part));
                    }
                    if (idx < parts.length - 1) {
                        frag.appendChild(document.createElement('br'));
                    }
                });
                textNode.replaceWith(frag);
            }
        }

        const isMediaAllowed = isExternalMediaAllowed();
        if (isMediaAllowed) {
            return;
        }

        if (!(node instanceof Element)) {
            return;
        }

        let mediaBlocked = false;

        switch (node.tagName) {
            case 'AUDIO':
            case 'VIDEO':
            case 'SOURCE':
            case 'TRACK':
            case 'EMBED':
            case 'OBJECT':
            case 'IMG': {
                const isExternalUrl = (url: string) => (url.indexOf('://') > 0 || url.indexOf('//') === 0) && !url.startsWith(window.location.origin);
                const src = node.getAttribute('src');
                const data = node.getAttribute('data');
                const srcset = node.getAttribute('srcset');

                if (srcset) {
                    const srcsetUrls = srcset.split(',');
                    for (const srcsetUrl of srcsetUrls) {
                        const [url] = srcsetUrl.trim().split(' ');
                        if (isExternalUrl(url)) {
                            console.warn('External media blocked', url);
                            node.remove();
                            mediaBlocked = true;
                            break;
                        }
                    }
                }

                if (src && isExternalUrl(src)) {
                    console.warn('External media blocked', src);
                    mediaBlocked = true;
                    node.remove();
                }

                if (data && isExternalUrl(data)) {
                    console.warn('External media blocked', data);
                    mediaBlocked = true;
                    node.remove();
                }

                if (mediaBlocked && (node instanceof HTMLMediaElement)) {
                    node.autoplay = false;
                    node.pause();
                }
            }
                break;
        }

        if (mediaBlocked) {
            const entityId = getCurrentEntityId();
            const warningShownKey = `mediaWarningShown:${entityId}`;

            if (accountStorage.getItem(warningShownKey) === null) {
                const warningToast = notyf.warning(
                    t`Use the 'Ext. Media' button to allow it. Click on this message to dismiss.`,
                    t`External media has been blocked`,
                    {
                        timeOut: 0,
                        preventDuplicates: true,
                        onclick: () => notyf.dismiss(warningToast),
                    },
                );
                accountStorage.setItem(warningShownKey, 'true');
            }
        }
    });
}

// ── Dialogs ───────────────────────────────────────────────────

/**
 * Opens the global styles preference dialog.
 */
export async function openGlobalStylesPreferenceDialog(): Promise<void> {
    if (selected_group) {
        toastr.warning('Global styles preference is not available in group chats.');
        return;
    }

    const entityId = getCurrentEntityId();
    if (!entityId) {
        toastr.warning('No character selected.');
        return;
    }

    const preference = new StylesPreference(entityId);
    const currentValue = preference.get();

    const template = await loadTemplate('preference', 'styles');
    if (!template) return;

    const allowedRadio = template.querySelector('#styles_allowed');
    const forbiddenRadio = template.querySelector('#styles_forbidden');

    if (allowedRadio instanceof HTMLInputElement) allowedRadio.checked = currentValue === true;
    if (forbiddenRadio instanceof HTMLInputElement) forbiddenRadio.checked = currentValue === false;

    const currentPreferenceRadio = template.querySelector('input[name="styles_preference"]:checked');
    if (!currentPreferenceRadio) {
        const defaultRadio = template.querySelector('#styles_default');
        if (defaultRadio instanceof HTMLInputElement) defaultRadio.checked = true;
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: true, large: true });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    const newValue = template.querySelector('input[name="styles_preference"]:checked');
    if (!(newValue instanceof HTMLInputElement)) return;

    switch (newValue.value) {
        case 'allowed':
            preference.set(true);
            break;
        case 'forbidden':
            preference.set(false);
            break;
        default:
            accountStorage.removeItem(preference.key);
            break;
    }
}

/**
 * Checks for creator notes styles and asks user if they want to allow them.
 */
export async function checkForCreatorNotesStyles(): Promise<void> {
    // Reset global styles button class
    setGlobalStylesButtonClass();

    const entityId = getCurrentEntityId();
    if (!entityId || selected_group) return;

    const notes = characters[this_chid]?.data?.creator_notes || '';
    const avatarId = characters[this_chid]?.avatar;
    const styleContents = getStyleContentsFromMarkdown(notes);
    if (styleContents.length === 0) return;

    const preference = new StylesPreference(avatarId);
    const hasPreference = preference.exists();
    if (hasPreference) return;

    const template = await loadTemplate('detected', 'styles', { count: styleContents.length });
    if (!template) return;

    const textarea = template.querySelector('textarea');
    if (textarea) {
        textarea.value = styleContents.join('\n\n');
    }

    const confirmResult = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
        wide: true,
        large: true,
        okButton: 'Allow',
        cancelButton: 'Block',
    });

    if (confirmResult === POPUP_RESULT.AFFIRMATIVE) {
        preference.set(true);
    } else {
        preference.set(false);
    }
}

/**
 * Sets the global styles button class based on current state.
 */
export function setGlobalStylesButtonClass(): void {
    const button = document.getElementById('creators_note_styles_button');
    if (!button) return;

    if (selected_group) {
        button.classList.add('neutral');
        button.title = 'Group chat detected: global styles from character notes will not be applied';
        return;
    }

    const entityId = getCurrentEntityId();
    if (!entityId) {
        button.classList.remove('neutral');
        button.title = 'No character selected: no active global styles preference';
        return;
    }

    const preference = new StylesPreference(entityId);
    if (preference.exists()) {
        button.classList.remove('neutral');
        button.title = preference.get()
            ? 'Global styles are enabled'
            : 'Global styles are disabled';
    } else {
        button.classList.add('neutral');
        button.title = 'No preference: global styles will be blocked by default';
    }
}

/**
 * Extracts style contents from markdown.
 * @param notes Character notes text
 * @returns Array of style contents
 */
export function getStyleContentsFromMarkdown(notes: string): string[] {
    const styleContents: string[] = [];
    const html = converter.render(notes);
    const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    const styleElements = parsedDocument.querySelectorAll('style');
    styleElements.forEach((style) => {
        if (style.textContent) {
            styleContents.push(style.textContent);
        }
    });
    return styleContents;
}

/**
 * Opens the external media overrides dialog.
 */
export async function openExternalMediaOverridesDialog(): Promise<void> {
    const entityId = getCurrentEntityId();
    if (!entityId) return;

    const template = await loadTemplate('overrides', 'media');
    if (!template) return;

    const forbiddenEl = template.querySelector('#forbid_media_override_forbidden');
    const allowedEl = template.querySelector('#forbid_media_override_allowed');

    if (forbiddenEl instanceof HTMLInputElement) {
        forbiddenEl.checked = power_user.external_media_forbidden_overrides.includes(entityId);
    }
    if (allowedEl instanceof HTMLInputElement) {
        allowedEl.checked = power_user.external_media_allowed_overrides.includes(entityId);
    }

    // Radio buttons in the popup can be used to set the state
    const overrideAllowed = template.querySelector('#override_allowed');
    const overrideForbidden = template.querySelector('#override_forbidden');
    const overrideGlobal = template.querySelector('#override_global');

    if (overrideAllowed instanceof HTMLInputElement) {
        overrideAllowed.checked = power_user.external_media_allowed_overrides.includes(entityId);
    }
    if (overrideForbidden instanceof HTMLInputElement) {
        overrideForbidden.checked = power_user.external_media_forbidden_overrides.includes(entityId);
    }
    if (overrideGlobal instanceof HTMLInputElement) {
        overrideGlobal.checked = !power_user.external_media_allowed_overrides.includes(entityId)
            && !power_user.external_media_forbidden_overrides.includes(entityId);
    }

    const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { wide: true, large: true });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    // Apply the changes
    if (overrideAllowed instanceof HTMLInputElement && overrideAllowed.checked) {
        power_user.external_media_allowed_overrides.push(entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v: string) => v !== entityId);
    } else if (overrideForbidden instanceof HTMLInputElement && overrideForbidden.checked) {
        power_user.external_media_forbidden_overrides.push(entityId);
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v: string) => v !== entityId);
    } else {
        power_user.external_media_allowed_overrides = power_user.external_media_allowed_overrides.filter((v: string) => v !== entityId);
        power_user.external_media_forbidden_overrides = power_user.external_media_forbidden_overrides.filter((v: string) => v !== entityId);
    }
}
