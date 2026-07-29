/**
 * jQuery compatibility shims for cash-dom.
 *
 * cash-dom (https://github.com/fabiospampinato/cash) is a lightweight jQuery
 * replacement that delegates to native DOM APIs. It does not support jQuery-only
 * pseudo-selectors (:selected, :visible, :hidden), effects (fx), or several
 * utility methods that external themes and some internal code rely on.
 *
 * This file patches $.fn and window.jQuery to fill those gaps.
 * Load after cash.min.js, before any code that uses jQuery features.
 */
(function () {
    'use strict';

    if (typeof $ === 'undefined') return;

    // ── 1. Global alias ──────────────────────────────────────────────────────
    window.jQuery = $;

    // ── 2. Animation stubs ───────────────────────────────────────────────────
    // cash-dom doesn't include jQuery's effects module; provide no-op stubs
    // and CSS-transition-based approximations so external code doesn't crash.

    $.fn.sortable = $.fn.sortable || function () { return this; };

    $.fn.fadeIn = $.fn.fadeIn || function (opts) {
        this.each(function () { this.style.display = ''; });
        if (opts && typeof opts.complete === 'function') opts.complete();
        return this;
    };

    $.fn.fadeOut = $.fn.fadeOut || function (opts) {
        this.each(function () { this.style.display = 'none'; });
        if (opts && typeof opts.complete === 'function') opts.complete();
        return this;
    };

    $.fn.transition = $.fn.transition || function (opts) {
        var duration = (opts && opts.duration) || 0;
        var easing = (opts && opts.easing) || 'ease';
        var props = Object.assign({}, opts);
        delete props.duration;
        delete props.easing;
        delete props.complete;
        var complete = opts && opts.complete;
        this.each(function () {
            var el = this;
            if (duration > 0) {
                el.style.transition = 'all ' + duration + 'ms ' + easing;
            }
            for (var key in props) {
                if (Object.hasOwn(props, key)) el.style[key] = props[key];
            }
            if (duration > 0) {
                var handler = function () {
                    el.style.transition = '';
                    el.removeEventListener('transitionend', handler);
                    if (typeof complete === 'function') complete.call(el);
                };
                el.addEventListener('transitionend', handler);
            } else if (typeof complete === 'function') {
                complete.call(el);
            }
        });
        return this;
    };

    $.fn.stop = $.fn.stop || function () { return this; };

    // ── 3. Slide effects (CSS transition based) ──────────────────────────────

    $.fn.slideUp = $.fn.slideUp || function (duration, complete) {
        if (typeof duration === 'function') { complete = duration; duration = 400; }
        duration = duration || 400;
        var that = this;
        this.each(function () {
            var el = this;
            var h = el.offsetHeight;
            if (h === 0) { el.style.display = 'none'; return; }
            el.style.transition = 'height ' + (duration / 1000) + 's ease, padding ' + (duration / 1000) + 's ease, margin ' + (duration / 1000) + 's ease';
            el.style.overflow = 'hidden';
            el.style.height = h + 'px';
            el.style.paddingTop = getComputedStyle(el).paddingTop;
            el.style.paddingBottom = getComputedStyle(el).paddingBottom;
            el.style.marginTop = getComputedStyle(el).marginTop;
            el.style.marginBottom = getComputedStyle(el).marginBottom;
            requestAnimationFrame(function () {
                el.style.height = '0';
                el.style.paddingTop = '0';
                el.style.paddingBottom = '0';
                el.style.marginTop = '0';
                el.style.marginBottom = '0';
            });
            var handler = function () {
                el.style.display = 'none';
                el.style.height = '';
                el.style.paddingTop = '';
                el.style.paddingBottom = '';
                el.style.marginTop = '';
                el.style.marginBottom = '';
                el.style.overflow = '';
                el.style.transition = '';
                el.removeEventListener('transitionend', handler);
                if (typeof complete === 'function') complete.call(el);
            };
            el.addEventListener('transitionend', handler);
            if (duration === 0) handler();
        });
        return that;
    };

    $.fn.slideDown = $.fn.slideDown || function (duration, complete) {
        if (typeof duration === 'function') { complete = duration; duration = 400; }
        duration = duration || 400;
        var that = this;
        this.each(function () {
            var el = this;
            el.style.removeProperty('display');
            if (getComputedStyle(el).display === 'none') el.style.display = 'block';
            el.style.overflow = 'hidden';
            el.style.height = '0';
            el.style.paddingTop = '0';
            el.style.paddingBottom = '0';
            el.style.marginTop = '0';
            el.style.marginBottom = '0';
            var targetH = el.scrollHeight;
            var targetPT = getComputedStyle(el).paddingTop;
            var targetPB = getComputedStyle(el).paddingBottom;
            var targetMT = getComputedStyle(el).marginTop;
            var targetMB = getComputedStyle(el).marginBottom;
            el.style.transition = 'height ' + (duration / 1000) + 's ease, padding ' + (duration / 1000) + 's ease, margin ' + (duration / 1000) + 's ease';
            requestAnimationFrame(function () {
                el.style.height = targetH + 'px';
                el.style.paddingTop = targetPT;
                el.style.paddingBottom = targetPB;
                el.style.marginTop = targetMT;
                el.style.marginBottom = targetMB;
            });
            var handler = function () {
                el.style.height = '';
                el.style.paddingTop = '';
                el.style.paddingBottom = '';
                el.style.marginTop = '';
                el.style.marginBottom = '';
                el.style.overflow = '';
                el.style.transition = '';
                el.removeEventListener('transitionend', handler);
                if (typeof complete === 'function') complete.call(el);
            };
            el.addEventListener('transitionend', handler);
            if (duration === 0) handler();
        });
        return that;
    };

    $.fn.slideToggle = $.fn.slideToggle || function (duration, complete) {
        if (typeof duration === 'function') { complete = duration; duration = 400; }
        var that = this;
        this.each(function () {
            var el = this;
            if (el.style.display === 'none' || getComputedStyle(el).display === 'none') {
                $(el).slideDown(duration, complete);
            } else {
                $(el).slideUp(duration, complete);
            }
        });
        return that;
    };

    // ── 4. Class manipulation (bypass cash-dom getSplitValues) ───────────────
    // NOTE: Guard against non-Element nodes (Text nodes from parseHTML childNodes).

    var _addClass = $.fn.addClass;
    $.fn.addClass = function (classes) {
        if (typeof classes !== 'string') return _addClass.apply(this, arguments);
        var list = classes.match(/\S+/g) || [classes];
        this.each(function () {
            if (this.nodeType === 1) this.classList.add.apply(this.classList, list);
        });
        return this;
    };

    var _removeClass = $.fn.removeClass;
    $.fn.removeClass = function (classes) {
        if (!arguments.length) return this.attr('class', '');
        if (typeof classes !== 'string') return _removeClass.apply(this, arguments);
        var list = classes.match(/\S+/g) || [classes];
        this.each(function () {
            if (this.nodeType === 1) this.classList.remove.apply(this.classList, list);
        });
        return this;
    };

    var _toggleClass = $.fn.toggleClass;
    $.fn.toggleClass = function (cls) {
        if (typeof cls === 'string' && cls.includes(' ')) {
            var classes = cls.split(' ');
            for (var i = 0; i < this.length; i++) {
                if (this[i].nodeType !== 1) continue;
                for (var j = 0; j < classes.length; j++) {
                    this[i].classList.toggle(classes[j]);
                }
            }
            return this;
        }
        return _toggleClass.apply(this, arguments);
    };

    // ── 5. Selector pseudo-class polyfills ───────────────────────────────────

    // .is() — handle :visible/:hidden which rely on computed style
    var _is = $.fn.is;
    $.fn.is = function (selector) {
        if (typeof selector === 'string') {
            if (selector === ':visible') return this[0]?.offsetParent !== null;
            if (selector === ':hidden') return this[0]?.offsetParent === null;
            if (selector.includes(':visible') || selector.includes(':hidden')) {
                var parts = selector.split(/\s*,\s*/);
                for (var p = 0; p < parts.length; p++) {
                    var part = parts[p].trim();
                    if (part.endsWith(':visible') || part.endsWith(':hidden')) {
                        var checkVisible = part.endsWith(':visible');
                        if (
                            checkVisible
                                ? this[0]?.offsetParent !== null
                                : this[0]?.offsetParent === null
                        ) {
                            return true;
                        }
                    }
                }
                return false;
            }
        }
        return _is.apply(this, arguments);
    };

    // .find() — convert jQuery pseudo-selectors to native CSS equivalents
    // cash-dom's find delegates to querySelectorAll which doesn't know :selected, :checkbox, etc.
    var _find = $.fn.find;
    var JQUERY_PSEUDO_MAP = [
        [/:selected\b/g, 'option:checked'],
        [/:(checkbox|radio|file|image|submit|reset|password|text)\b/g, '[type="$1"]'],
        [/:button\b/g, 'button, [type="button"]'],
        [/:input\b/g, 'input, select, textarea, button'],
        [/:header\b/g, 'h1, h2, h3, h4, h5, h6'],
        [/:parent\b/g, ':not(:empty)'],
    ];
    $.fn.find = function (selector) {
        if (typeof selector === 'string') {
            for (var i = 0; i < JQUERY_PSEUDO_MAP.length; i++) {
                selector = selector.replace(JQUERY_PSEUDO_MAP[i][0], JQUERY_PSEUDO_MAP[i][1]);
            }
        }
        return _find.call(this, selector);
    };

    // ── 6. Event handling ───────────────────────────────────────────────────

    $.fn.bind = $.fn.bind || function () { return this; };

    // .on() — support delegated event via selector argument (cash-dom 8.x doesn't handle it)
    var _on = $.fn.on;
    $.fn.on = function (event, selector, data, handler, opts) {
        if (typeof selector === 'string' && typeof data === 'function') {
            handler = data;
            data = undefined;
            var boundEl = this[0];
            var _handler = handler;
            handler = function (e) {
                for (var el = e.target; el && el !== boundEl; el = el.parentElement) {
                    if (el.matches && el.matches(selector)) {
                        return _handler.call(el, e);
                    }
                }
            };
            return _on.call(this, event, handler, data, undefined, opts);
        }
        return _on.apply(this, arguments);
    };

    $.fn.hover = $.fn.hover || function (fnIn, fnOut) {
        return this.on('mouseenter', fnIn).on('mouseleave', fnOut || fnIn);
    };

    // Event shorthand methods some libs (e.g. toastr) expect
    var _events = [
        'click', 'change', 'submit', 'focus', 'blur',
        'keydown', 'keyup', 'keypress',
        'mouseenter', 'mouseleave', 'dblclick',
        'focusin', 'focusout',
    ];
    for (var _i = 0; _i < _events.length; _i++) {
        (function (ev) {
            if (!$.fn[ev]) {
                $.fn[ev] = function (handler) {
                    return handler ? this.on(ev, handler) : this.trigger(ev);
                };
            }
        })(_events[_i]);
    }

    // ── 7. Misc utilities ───────────────────────────────────────────────────

    $.fn.scrollTop = function (v) {
        return v === void 0
            ? this[0]?.scrollTop
            : (this.each(function () { this.scrollTop = v; }), this);
    };

    // Simple pagination shim (used by some extensions)
    $.fn.pagination = function (options) {
        if (typeof options === 'object' && options.dataSource) {
            var dataSource = options.dataSource;
            var pageSize = options.pageSize || 50;
            var pageNum = options.pageNumber || 1;
            var start = (pageNum - 1) * pageSize;
            var end = Math.min(start + pageSize, dataSource.length);
            var pageData = dataSource.slice(start, end);
            var totalPages = Math.ceil(dataSource.length / pageSize) || 1;
            if (typeof options.callback === 'function') {
                options.callback(pageData, {
                    pageNumber: pageNum,
                    totalPages: totalPages,
                    totalNumber: dataSource.length,
                    startIndex: start,
                    endIndex: end - 1,
                    showPageNumbers: false,
                });
            }
        }
        return this;
    };

    // .append() — handle plain text strings (toastr passes error messages as plain text)
    var _append = $.fn.append;
    $.fn.append = function () {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            // Plain text sentence -> text node (CSS selectors never start with uppercase)
            if (typeof a === 'string' && /^[A-Z]/.test(a)) {
                args.push(document.createTextNode(a));
            } else {
                args.push(a);
            }
        }
        return _append.apply(this, args);
    };

    // ── 8. jQuery.fx polyfill (external themes reference jQuery.fx.off) ──────
    if (!$.fx) {
        var _fxOff = false;
        $.fx = {
            get off() { return _fxOff; },
            set off(v) { _fxOff = !!v; },
        };
    }

    // ── 9. Resilient $() wrapper ─────────────────────────────────────────────
    // Catch querySelectorAll errors for invalid selectors and fall back gracefully.
    (function () {
        var c = $;
        window.$ = function (s) {
            if (typeof s !== 'string') return c(s);
            try {
                return c(s);
            } catch (e) {
                try {
                    return c(s.replace(/\[(\w+)=([^\]]*)]/g, '[$1="$2"]'));
                } catch (e2) {
                    return c(document.createTextNode(s));
                }
            }
        };
        // Preserve cash reference
        window.cash = window.$;
    })();

})();
