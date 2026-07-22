/**
 * Shared module between login and main app.
 * Be careful what you import!
 */

const A11Y_RULES = [
    {
        role: 'button',
        selector: '.menu_button,.right_menu_button,.mes_button,.drawer-icon,.inline-drawer-icon,.swipe_left,.swipe_right,.character_select,.tags .tag,.jg-menu .jg-button,.bg_example .mobile-only-menu-toggle,.paginationjs-pages li a,#show_more_messages'
    },
    {
        role: 'list',
        selector: '.options-content,.list-group,#rm_print_characters_block,#rm_group_members,#rm_group_add_members,.tag_view_list_tags,.secretKeyManagerList,.recentChatList,.dataMaidCategoryContent,#userList,.bg_list'
    },
    {
        role: 'listitem',
        selector: '.options-content .list-group-item,.list-group .list-group-item,#rm_print_characters_block .entity_block,#rm_group_members .group_member,#rm_group_add_members .group_member,.tag_view_list_tags .tag_view_item,.secretKeyManagerList .secretKeyManagerItem,.recentChatList .recentChat,.dataMaidCategoryContent .dataMaidItem,#userList .userSelect,.bg_list .bg_example'
    },
    {
        role: 'toolbar',
        selector: '.jg-menu'
    },
    {
        role: 'tablist',
        selector: '#bg_tabs .bg_tabs_list'
    },
    {
        role: 'tab',
        selector: '#bg_tabs .bg_tabs_list .bg_tab_button'
    },
    {
        role: 'status',
        selector: '#toast-container .toast'
    }
];

/**
 * Apply accessibility rules to an element and its descendants.
 * @param {Element} element Element to process.
 */
function applyA11yRules(element: Element) {
    for (const rule of A11Y_RULES) {
        // Apply if the parent element directly matches
        if (element.matches(rule.selector)) {
            element.setAttribute('role', rule.role);
        }

        // Apply to all matching descendants
        const children = element.querySelectorAll(rule.selector);
        for (const child of children) {
            child.setAttribute('role', rule.role);
        }
    }
}

/**
 * Initializes the accessibility module and sets up the MutationObserver.
 */
export function initAccessibility() {
    // Apply for existing elements on load
    applyA11yRules(document.body);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                // nodeType 1 is Node.ELEMENT_NODE. Considerably faster than `instanceof Element`
                if (node.nodeType === 1) {
                    applyA11yRules(node as Element);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
