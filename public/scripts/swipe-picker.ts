import { branchChat } from './bookmarks.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from './constants.js';
import { t } from './i18n.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { power_user } from './power-user.js';
import { isMobile } from './RossAscends-mods.js';
import { getTokenCountAsync } from './tokenizers.js';
import { addLongPressEvent, clamp, copyText, timestampToMoment } from './utils.js';
// @ts-expect-error TS(2792) FIXME: Cannot find module '/script.js'. Did you mean to s... Remove this comment to see the full error message
import { chat, deleteSwipe, ensureSwipes, isMessageSwipeable, isSwipingAllowed, swipe, syncMesToSwipe } from '/script.js';

/**
 * Returns whether a swipe picker can be opened for the message.
 * Unlike message swiping, this supports historical AI messages for inspection and branching.
 * @param {number} messageId
 * @returns {boolean}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function canOpenSwipePickerForMessage(messageId) {
    const message = chat[messageId];

    if (!message) {
        return false;
    }

    if (ensureSwipes(message)) {
        syncMesToSwipe(messageId);
    }

    return Boolean(
        message?.swipes?.length > 1 &&
        !message?.is_user &&
        !(message?.extra?.isSmallSys) &&
        !(message?.extra?.swipeable === false),
    );
}

/**
 * Returns whether the picker can actively jump to a different swipe.
 * Historical AI messages can open the picker, but only the currently swipeable message may jump.
 * @param {number} messageId
 * @returns {boolean}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
export function canJumpToSwipeForMessage(messageId) {
    const message = chat[messageId];
    return canOpenSwipePickerForMessage(messageId) && isSwipingAllowed() && isMessageSwipeable(messageId, message);
}

/**
 * Opens a popup for viewing or jumping to a specific swipe on a message.
 * @param {number} messageId
 * @returns {Promise<void>}
 */
// @ts-expect-error TS(7006) FIXME: Parameter 'messageId' implicitly has an 'any' type... Remove this comment to see the full error message
async function openSwipePicker(messageId) {
    const message = chat[messageId];

    if (!canOpenSwipePickerForMessage(messageId)) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`This message has no alternate swipes yet.`, t`Jump to Swipe`);
        return;
    }

    const canJumpToSwipe = canJumpToSwipeForMessage(messageId);
    let selectedSwipeId = clamp(Number(message.swipe_id ?? 0), 0, message.swipes.length - 1);
    const swipeIdInputId = `swipe_picker_id_${messageId}`;
    const wrapper = document.createElement('div');
    wrapper.classList.add('flex-container', 'flexFlowColumn', 'flexNoGap', 'wide100p', 'flex1', 'overflowHidden');

    const header = document.createElement('div');
    header.classList.add('swipe_picker_header', 'flex-container', 'alignItemsCenter', 'justifySpaceBetween', 'gap10px');

    const description = document.createElement('h3');
    description.classList.add('margin0', 'justifyLeft');
    description.textContent = t`Swipe Selection`;
    header.appendChild(description);
    wrapper.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.classList.add('swipe_picker_div', 'flex1', 'marginTop10');
    wrapper.appendChild(listContainer);

    let popup!: Popup;
    let swipeIdInput!: HTMLInputElement;
    /** @type {number|null} */
    let branchActionSwipeId = null;

    /**
     *
     */
    function syncSwipeIdInput() {
        if (swipeIdInput) {
            swipeIdInput.value = String(selectedSwipeId + 1);
        }
    }

    /**
     *
     * @param nextSwipeId
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'nextSwipeId' implicitly has an 'any' ty... Remove this comment to see the full error message
    function setSelectedSwipe(nextSwipeId) {
        selectedSwipeId = clamp(Number(nextSwipeId), 0, message.swipes.length - 1);
        listContainer.querySelectorAll('.swipe_picker_block').forEach((element) => {
            const isSelected = Number(element.getAttribute('data-swipe-id')) === selectedSwipeId;
            if (isSelected) {
                element.setAttribute('highlight', 'true');
            } else {
                element.removeAttribute('highlight');
            }
        });
        syncSwipeIdInput();
    }

    /**
     *
     */
    function scrollToSelectedSwipe() {
        const swipeBlock = listContainer.querySelector(`.swipe_picker_block[data-swipe-id="${selectedSwipeId}"]`);
        if (swipeBlock instanceof HTMLElement) {
            const scrollParent = swipeBlock.closest('.swipe_picker_div');
            if (scrollParent instanceof HTMLElement) {
                const blockRect = swipeBlock.getBoundingClientRect();
                const parentRect = scrollParent.getBoundingClientRect();
                if (blockRect.top < parentRect.top) {
                    scrollParent.scrollTop -= (parentRect.top - blockRect.top) + 5;
                } else if (blockRect.bottom > parentRect.bottom) {
                    scrollParent.scrollTop += (blockRect.bottom - parentRect.bottom) + 5;
                }
            }
        }
    }

    /**
     *
     * @param swipeId
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'swipeId' implicitly has an 'any' type.
    function canDeleteSwipeFromPicker(swipeId) {
        if ((message?.swipes?.length ?? 0) <= 1) {
            return false;
        }

        const currentSwipeId = clamp(Number(message.swipe_id ?? 0), 0, message.swipes.length - 1);
        return canJumpToSwipe || swipeId !== currentSwipeId;
    }

    /**
     *
     */
    async function renderSwipeList() {
        // @ts-expect-error TS(7006) FIXME: Parameter 'swipe' implicitly has an 'any' type.
        const swipeBlocks = await Promise.all(message.swipes.map(async (swipe, index) => {
            const swipeText = String(swipe ?? '');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const template = $('#past_chat_template .select_chat_block_wrapper').clone();
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const block = $(template[0].querySelector('.select_chat_block'));
            block.removeClass('select_chat_block').addClass('swipe_picker_block');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(block[0].querySelector('.select_chat_actions')).removeClass('gap10px');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const branchButton = $(template[0].querySelector('.exportRawChatButton'));
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            const deleteButton = $(template[0].querySelector('.PastChat_cross'));
            const swipeInfo = Array.isArray(message.swipe_info) ? message.swipe_info[index] : null;
            const sendDate = swipeInfo?.send_date ? timestampToMoment(swipeInfo.send_date).format('lll') : '';
            const previewText = swipeText.replace(/\s+/g, ' ').trim();
            // @ts-expect-error TS(2345) FIXME: Argument of type '0' is not assignable to paramete... Remove this comment to see the full error message
            const tokenCount = swipeInfo?.extra?.token_count ?? (await getTokenCountAsync(swipeText, 0));
            const canDeleteSwipe = canDeleteSwipeFromPicker(index);
            const swipeDetails = [];

            if (previewText) {
                swipeDetails.push(`${previewText.length} ${t`chars`}`);
            }

            if (tokenCount) {
                swipeDetails.push(`${tokenCount}t`);
            }

            block.attr({
                file_name: `swipe-${index + 1}`,
                'data-swipe-id': index,
            });

            // @ts-expect-error TS(7006) FIXME: Parameter 'el' implicitly has an 'any' type.
            template[0].querySelectorAll('.renameChatButton, .exportChatButton').forEach(el => el.remove());
            branchButton
                .removeAttr('data-format')
                .attr({
                    title: t`Create Branch`,
                    'data-i18n': '[title]Create Branch',
                })
                .removeClass('exportRawChatButton fa-solid fa-file-export')
                .addClass('swipe_picker_branch mes_button fa-fw fa-regular fa-code-branch')
            branchButton[0]?.addEventListener('click', async (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedSwipe(index);
                branchActionSwipeId = index;
                await popup.completeCancelled();
            });
            deleteButton
                .removeAttr('file_name')
                .attr('aria-disabled', String(!canDeleteSwipe))
                .removeClass('fa-skull')
                .addClass('swipe_picker_delete fa-fw fa-trash-can')
                .toggleClass('hoverglow', canDeleteSwipe)
                .toggleClass('disabled', !canDeleteSwipe);

            for (const el of deleteButton) {
                if (canDeleteSwipe) {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(el).attr({
                        title: t`Delete Swipe`,
                        'data-i18n': '[title]Delete Swipe',
                    });
                } else {
                    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
                    $(el).removeAttr('title').removeAttr('data-i18n');
                }
            }

            for (const el of deleteButton) {
                el.addEventListener('click', async (event: Event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (!canDeleteSwipe) {
                        return;
                    }

                    const nextSelectedSwipeId = index < selectedSwipeId
                        ? selectedSwipeId - 1
                        : index > selectedSwipeId
                            ? selectedSwipeId
                            : Math.min(selectedSwipeId, message.swipes.length - 2);

                    if (power_user.confirm_message_delete) {
                        // @ts-expect-error TS(2345) FIXME: Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
                        const result = await callGenericPopup(t`Are you sure you want to delete swipe #${index + 1}?`, POPUP_TYPE.CONFIRM, null, {
                            okButton: t`Delete Swipe`,
                            cancelButton: t`Cancel`,
                        });

                        if (result !== POPUP_RESULT.AFFIRMATIVE) {
                            return;
                        }
                    }

                    const newSwipeId = await deleteSwipe(index, messageId);
                    if (!Number.isInteger(newSwipeId)) {
                        return;
                    }

                    selectedSwipeId = clamp(nextSelectedSwipeId, 0, message.swipes.length - 1);

                    if (swipeIdInput instanceof HTMLInputElement) {
                        swipeIdInput.max = String(message.swipes.length);
                    }

                    await renderSwipeList();
                });
            }

            // Add expand/collapse toggle
            const expandCheckboxId = `swipe_picker_expand_${messageId}_${index}`;
            const expandCheckbox = document.createElement('input');
            expandCheckbox.type = 'checkbox';
            expandCheckbox.id = expandCheckboxId;
            expandCheckbox.classList.add('swipe_picker_expand_toggle');
            block[0].prepend(expandCheckbox);

            const expandLabel = document.createElement('label');
            expandLabel.htmlFor = expandCheckboxId;
            expandLabel.classList.add('swipe_picker_expand_label', 'fa-solid', 'fa-fw', 'fa-chevron-down');
            expandLabel.title = t`Expand/Collapse`;
            expandLabel.setAttribute('data-i18n', '[title]Expand/Collapse');
            expandLabel.addEventListener('click', (event: Event) => event.stopPropagation());

            // Add copy button
            const copyButton = document.createElement('div');
            copyButton.classList.add('swipe_picker_copy', 'fa-solid', 'fa-fw', 'fa-copy');
            copyButton.title = t`Copy`;
            copyButton.setAttribute('data-i18n', '[title]Copy');
            copyButton.addEventListener('click', async (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                await copyText(swipeText);
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.info(t`Copied!`, '', { timeOut: 2000 });
            });

            // Insert new buttons before the branch button
            branchButton.before(expandLabel, copyButton);

            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(template[0].querySelector('.select_chat_block_filename')).text(`#${index + 1}${index === Number(message.swipe_id ?? 0) ? ` ${t`[Current]`}` : ''}`);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(template[0].querySelector('.chat_messages_date')).text(sendDate);
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(template[0].querySelector('.chat_file_size')).text(swipeDetails.length ? `(${swipeDetails[0]}${swipeDetails.length > 1 ? ',' : ')'}` : '');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(template[0].querySelector('.chat_messages_num')).text(swipeDetails.length > 1 ? `${swipeDetails.slice(1).join(', ')})` : '');
            // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
            $(template[0].querySelector('.select_chat_block_mes')).text(previewText ? swipeText : t`(empty swipe)`);

            block.on('click', () => setSelectedSwipe(index));
            block.on('dblclick', async () => {
                if (!canJumpToSwipe) {
                    return;
                }

                setSelectedSwipe(index);
                await popup.completeAffirmative();
            });

            return template[0];
        }));

        listContainer.replaceChildren(...swipeBlocks);
        setSelectedSwipe(selectedSwipeId);

        if (swipeBlocks.length === 0) {
            const empty = document.createElement('div');
            empty.classList.add('textAlignCenter', 'opacity50p', 'padding10');
            empty.textContent = t`No swipes available.`;
            listContainer.replaceChildren(empty);
        }
    }

    popup = new Popup(wrapper, POPUP_TYPE.CONFIRM, '', {
        okButton: canJumpToSwipe ? t`Go` : false,
        // @ts-expect-error TS(2322) FIXME: Type 'false' is not assignable to type 'null | und... Remove this comment to see the full error message
        cancelButton: false,
        // @ts-expect-error TS(2322) FIXME: Type '{ id: string; label: any; type: string; defa... Remove this comment to see the full error message
        customInputs: [{
            id: swipeIdInputId,
            label: t`Swipe ID`,
            type: 'text',
            defaultState: String(selectedSwipeId + 1),
            tooltip: `1-${message.swipes.length}`,
        }],
        large: true,
        wider: true,
        allowVerticalScrolling: true,
        // @ts-expect-error TS(2322) FIXME: Type '() => void' is not assignable to type 'null ... Remove this comment to see the full error message
        onOpen: function () {
            scrollToSelectedSwipe();
            if (swipeIdInput instanceof HTMLInputElement) {
                swipeIdInput.focus();
                swipeIdInput.select();
            }
        },
        // @ts-expect-error TS(2322) FIXME: Type '(popup: any) => boolean' is not assignable t... Remove this comment to see the full error message
        onClosing: function (popup) {
            if (popup.result !== POPUP_RESULT.AFFIRMATIVE) {
                return true;
            }

            const swipeIdInput = popup.dlg.querySelector(`#${swipeIdInputId}`);
            const targetSwipeNumber = Number.parseInt(String(swipeIdInput instanceof HTMLInputElement ? swipeIdInput.value : '').trim(), 10);

            if (!Number.isInteger(targetSwipeNumber) || targetSwipeNumber < 1 || targetSwipeNumber > message.swipes.length) {
                // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
                toastr.warning(t`Enter a swipe ID between 1 and ${message.swipes.length}.`, t`Jump to Swipe`);
                if (swipeIdInput instanceof HTMLInputElement) {
                    swipeIdInput.focus();
                    swipeIdInput.select();
                }
                return false;
            }

            setSelectedSwipe(targetSwipeNumber - 1);
            return true;
        },
    });

    popup.dlg.classList.add('swipe_picker_popup');
    popup.closeButton.style.display = 'block';
    popup.closeButton.classList.add('opacity50p', 'hoverglow', 'fontsize120p');
    popup.closeButton.style.position = 'static';
    popup.closeButton.style.top = 'auto';
    popup.closeButton.style.right = 'auto';
    popup.closeButton.style.width = 'auto';
    popup.closeButton.style.height = 'auto';
    popup.closeButton.style.padding = '0';
    popup.closeButton.style.filter = 'none';
    header.appendChild(popup.closeButton);

    swipeIdInput = popup.dlg.querySelector(`#${swipeIdInputId}`);
    const swipeIdLabel = popup.dlg.querySelector(`label[for="${swipeIdInputId}"]`);

    if (swipeIdLabel instanceof HTMLLabelElement) {
        swipeIdLabel.classList.add('flex-container', 'alignItemsCenter', 'justifyCenter', 'gap10px', 'margin0');
        popup.buttonControls.insertBefore(swipeIdLabel, canJumpToSwipe ? popup.okButton : popup.buttonControls.firstChild);
        popup.inputControls.style.display = 'none';
    }

    if (swipeIdInput instanceof HTMLInputElement) {
        swipeIdInput.type = 'number';
        swipeIdInput.min = '1';
        swipeIdInput.max = String(message.swipes.length);
        swipeIdInput.step = '1';
        swipeIdInput.inputMode = 'numeric';
        swipeIdInput.classList.add('flex1', 'width100px', 'textAlignCenter');
        swipeIdInput.setAttribute('autofocus', '');
        syncSwipeIdInput();

        swipeIdInput.addEventListener('input', function () {
            const nextSwipeId = Number.parseInt(this.value, 10);
            if (!Number.isInteger(nextSwipeId) || nextSwipeId < 1 || nextSwipeId > message.swipes.length) {
                return;
            }

            setSelectedSwipe(nextSwipeId - 1);
            scrollToSelectedSwipe();
        });

        swipeIdInput.addEventListener('blur', function () {
            syncSwipeIdInput();
        });
    }

    await renderSwipeList();

    const popupResult = await popup.show();

    if (branchActionSwipeId !== null) {
        await branchChat(messageId, { swipeId: branchActionSwipeId });
        return;
    }

    if (popupResult !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    if (!canJumpToSwipe) {
        return;
    }

    const targetSwipeId = clamp(selectedSwipeId, 0, message.swipes.length - 1);
    const currentSwipeId = clamp(Number(message.swipe_id ?? 0), 0, message.swipes.length - 1);

    if (targetSwipeId === currentSwipeId) {
        // @ts-expect-error TS(2304) FIXME: Cannot find name 'toastr'.
        toastr.info(t`Already showing swipe #${targetSwipeId + 1}.`, t`Jump to Swipe`);
        return;
    }

    const direction = targetSwipeId > currentSwipeId ? SWIPE_DIRECTION.RIGHT : SWIPE_DIRECTION.LEFT;
    await swipe(null, direction, { source: SWIPE_SOURCE.SWIPE_PICKER, forceMesId: messageId, forceSwipeId: targetSwipeId });
}

/**
 *
 */
export function initSwipePicker() {
    /**
     * Click handler for opening the swipe picker when clicking on the swipe counter.
     * @param {JQuery.Event | Event} e Event object
     */
    // @ts-expect-error TS(7006) FIXME: Parameter 'e' implicitly has an 'any' type.
    async function onSwipeCounterClick(e) {
        e.preventDefault();
        e.stopPropagation();

        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const mesId = Number(this.closest('.mes')?.getAttribute('mesid'));
        await openSwipePicker(mesId);
    }

    if (isMobile()) {
        addLongPressEvent('.swipes-counter.swipe-picker-enabled', onSwipeCounterClick);
    } else {
        // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
        $(document).on('click', '.swipes-counter.swipe-picker-enabled', onSwipeCounterClick);
    }
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('keydown', '.swipes-counter.swipe-picker-enabled', async function (e) {
        if (e.key !== ' ') {
            return;
        }

        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        onSwipeCounterClick.call(this, e);
    });
    // @ts-expect-error TS(2592) FIXME: Cannot find name '$'. Do you need to install type ... Remove this comment to see the full error message
    $(document).on('click', '.mes_swipe_picker', async function (e) {
        e.preventDefault();
        e.stopPropagation();

        // @ts-expect-error TS(2683) FIXME: 'this' implicitly has type 'any' because it does n... Remove this comment to see the full error message
        const mesId = Number(this.closest('.mes')?.getAttribute('mesid'));
        await openSwipePicker(mesId);
    });
}
