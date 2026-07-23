const isFirefox = () => /firefox/i.test(navigator.userAgent);

function addSafariPatch() {
    // navigator.vendor is deprecated but universally supported in Safari
    // and is the cleanest Safari-inclusive check that still works today.
    if (navigator.vendor === 'Apple Computer, Inc.') {
        document.body.classList.add('safari');
    }
}

function applyBrowserFixes() {
    addSafariPatch();
}

export { isFirefox, applyBrowserFixes };
