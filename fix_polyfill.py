#!/usr/bin/env nix-shell
#! nix-shell -p python3 -i python
"""Replace the broken micro-$ polyfill in index.html with a clean version."""
import re

with open('public/index.html', 'r') as f:
    html = f.read()

# Find the old polyfill and replace it
old_polyfill = re.search(r'<script>\n// micro-\$ polyfill[\s\S]*?window\.jQuery=\$;</script>', html)
if not old_polyfill:
    print("ERROR: Could not find polyfill")
    exit(1)

new_polyfill = """<script>
// micro-$ polyfill
var $=function(s){if(typeof s==='function'){document.addEventListener('DOMContentLoaded',s);return}
var D={on:function(){return D},val:function(){return''},prop:function(){return D},css:function(){return D},
text:function(){return''},html:function(){return''},show:function(){return D},hide:function(){return D},
toggle:function(){return D},empty:function(){return D},remove:function(){},addClass:function(){return D},
removeClass:function(){return D},toggleClass:function(){return D},hasClass:function(){return!1},
attr:function(){return D},removeAttr:function(){return D},data:function(){return D},
find:function(){return[]},closest:function(){return null},first:function(){return D},
last:function(){return D},eq:function(){return D},parent:function(){return null},
scrollTop:function(){return 0},length:0};
if(typeof s!=='string'){s.on=function(e,h){s.addEventListener(e,h);return s};s.trigger=function(e){s.dispatchEvent(new Event(e,{bubbles:true}));return s};return s}
var el=document.querySelector(s);if(!el)return D;
el.on=function(e,h){el.addEventListener(e,h);return el};
el.trigger=function(e){el.dispatchEvent(new Event(e,{bubbles:true}));return el};
el.val=function(v){return v===void 0?el.value:(el.value=v,el)};
el.prop=function(k,v){return v===void 0?el[k]:(el[k]=v,el)};
el.text=function(v){return v===void 0?el.textContent:(el.textContent=v,el)};
el.html=function(v){return v===void 0?el.innerHTML:(el.innerHTML=v,el)};
el.css=function(k,v){if(typeof k==='object'){Object.assign(el.style,k);return el}return v===void 0?getComputedStyle(el)[k]:(el.style[k]=v,el)};
el.show=function(){el.style.display='';return el};
el.hide=function(){el.style.display='none';return el};
el.toggle=function(v){el.style.display=v?'':'none';return el};
el.empty=function(){el.innerHTML='';return el};
el.addClass=function(c){el.classList.add(c);return el};
el.removeClass=function(c){el.classList.remove(c);return el};
el.toggleClass=function(c,f){el.classList.toggle(c,f);return el};
el.hasClass=function(c){return el.classList.contains(c)};
el.attr=function(k,v){return v===void 0?el.getAttribute(k):(el.setAttribute(k,v),el)};
el.removeAttr=function(k){el.removeAttribute(k);return el};
el.data=function(k,v){return v===void 0?el.dataset[k]:(el.dataset[k]=v,el)};
el.find=function(s){return el.querySelectorAll(s)};
el.siblings=function(){return[...el.parentElement.children].filter(function(c){return c!==el})};
el.scrollTop=function(v){return v===void 0?el.scrollTop:(el.scrollTop=v,el)};
el.length=1;return el};window.jQuery=$;</script>"""

html = html.replace(old_polyfill.group(0), new_polyfill)

with open('public/index.html', 'w') as f:
    f.write(html)

print("Polyfill replaced successfully")
