/**
 * SwipeService — manage message swipes (alternate responses).
 *
 * Each ChatMessage can hold multiple swipes (alternate generations).
 * This service provides a clean API for adding, switching, and
 * deleting swipes within a message.
 */

import { chatSession } from '../chats/ChatSession.js';
import {
    saveChatConditional,
    eventSource,
    event_types,
    refreshSwipeButtons,
} from '../../script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE } from '../constants.js';

export interface SwipeResult {
    success: boolean;
    messageIndex: number;
    newSwipeId: number;
    text: string;
}

/**
 * Service for swipe operations on messages.
 */
class SwipeService {
    // ── Read ──────────────────────────────────────────────────

    /**
     * Return the current swipe text for a message, or the raw message text.
     * @param message
     */
    getCurrentText(message: ChatMessage): string {
        if (Array.isArray(message.swipes) && message.swipes.length > 0) {
            const id = message.swipe_id ?? 0;
            return message.swipes[id] ?? message.mes ?? '';
        }
        return message.mes ?? '';
    }

    /**
     * Return all swipes for a message.
     * @param message
     */
    getAll(message: ChatMessage): string[] {
        return message.swipes ?? [];
    }

    /**
     * The number of swipes on a message.
     * @param message
     */
    count(message: ChatMessage): number {
        return message.swipes?.length ?? 0;
    }

    /**
     * Whether the message has more than one swipe.
     * @param message
     */
    hasMultiple(message: ChatMessage): boolean {
        return (message.swipes?.length ?? 0) > 1;
    }

    // ── Navigate ──────────────────────────────────────────────

    /**
     * Switch to the next swipe (forward).
     * Wraps to the first swipe at the end.
     * @param messageIndex
     */
    async next(messageIndex: number): Promise<SwipeResult> {
        const message = chatSession.getMessage(messageIndex);
        if (!message || !Array.isArray(message.swipes) || message.swipes.length === 0) {
            return { success: false, messageIndex, newSwipeId: 0, text: '' };
        }

        const current = message.swipe_id ?? 0;
        const next = (current + 1) % message.swipes.length;
        message.swipe_id = next;

        await this.finalize(message, messageIndex, SWIPE_DIRECTION.RIGHT);
        return { success: true, messageIndex, newSwipeId: next, text: message.swipes[next] ?? '' };
    }

    /**
     * Switch to the previous swipe (backward).
     * Wraps to the last swipe at the beginning.
     * @param messageIndex
     */
    async prev(messageIndex: number): Promise<SwipeResult> {
        const message = chatSession.getMessage(messageIndex);
        if (!message || !Array.isArray(message.swipes) || message.swipes.length === 0) {
            return { success: false, messageIndex, newSwipeId: 0, text: '' };
        }

        const current = message.swipe_id ?? 0;
        const prev = (current - 1 + message.swipes.length) % message.swipes.length;
        message.swipe_id = prev;

        await this.finalize(message, messageIndex, SWIPE_DIRECTION.LEFT);
        return { success: true, messageIndex, newSwipeId: prev, text: message.swipes[prev] ?? '' };
    }

    /**
     * Jump to a specific swipe id.
     * @param messageIndex
     * @param swipeId
     */
    async goTo(messageIndex: number, swipeId: number): Promise<SwipeResult> {
        const message = chatSession.getMessage(messageIndex);
        if (
            !message ||
            !Array.isArray(message.swipes) ||
            swipeId < 0 ||
            swipeId >= message.swipes.length
        ) {
            return { success: false, messageIndex, newSwipeId: 0, text: '' };
        }

        message.swipe_id = swipeId;
        await this.finalize(message, messageIndex, SWIPE_DIRECTION.RIGHT);
        return {
            success: true,
            messageIndex,
            newSwipeId: swipeId,
            text: message.swipes[swipeId] ?? '',
        };
    }

    // ── Mutate ────────────────────────────────────────────────

    /**
     * Append a new swipe to a message.
     * @param messageIndex
     * @param text
     */
    async append(messageIndex: number, text: string): Promise<SwipeResult> {
        const message = chatSession.getMessage(messageIndex);
        if (!message) {
            return { success: false, messageIndex, newSwipeId: 0, text: '' };
        }

        if (!Array.isArray(message.swipes)) {
            message.swipes = [];
        }

        const newId = message.swipes.length;
        message.swipes.push(text);
        message.swipe_id = newId;

        await this.finalize(message, messageIndex, SWIPE_DIRECTION.RIGHT);
        return { success: true, messageIndex, newSwipeId: newId, text };
    }

    /**
     * Delete a specific swipe from a message.
     * If the current swipe is deleted, switches to an adjacent one.
     * @param messageIndex
     * @param swipeId
     */
    async delete(messageIndex: number, swipeId: number): Promise<SwipeResult> {
        const message = chatSession.getMessage(messageIndex);
        if (
            !message ||
            !Array.isArray(message.swipes) ||
            swipeId < 0 ||
            swipeId >= message.swipes.length
        ) {
            return { success: false, messageIndex, newSwipeId: 0, text: '' };
        }

        message.swipes.splice(swipeId, 1);

        // Adjust swipe_id if needed
        if (message.swipe_id === swipeId) {
            message.swipe_id = Math.min(swipeId, message.swipes.length - 1);
        } else if (message.swipe_id! > swipeId) {
            message.swipe_id!--;
        }

        const newSwipeId = message.swipe_id ?? 0;
        const text = message.swipes[newSwipeId] ?? message.mes ?? '';

        await this.finalize(message, messageIndex, SWIPE_SOURCE.DELETE);
        return { success: true, messageIndex, newSwipeId, text };
    }

    // ── Helpers ───────────────────────────────────────────────

    private async finalize(
        message: ChatMessage,
        messageIndex: number,
        direction: string,
    ): Promise<void> {
        message.mes = message.swipes?.[message.swipe_id ?? 0] ?? message.mes;

        await eventSource.emit(event_types.IMAGE_SWIPED, {
            message,
            element: null,
            direction,
        });

        await saveChatConditional();
        // The caller is responsible for re-rendering if needed.
        // refreshSwipeButtons is kept for legacy compatibility.
        try {
            refreshSwipeButtons();
        } catch {
            // May not be available during initialization.
        }
    }
}

/** Singleton service instance. */
export const swipeService = new SwipeService();
