/**
 * BranchService — manage chat branching (forking the conversation).
 *
 * Branching lets the user fork the conversation from a specific
 * message, keeping the history up to that point and discarding
 * (or preserving as a branch) everything after it.
 *
 * In the current architecture branches are ephemeral — they exist
 * as "the point at which the user edited/regenerated" rather than
 * as first-class persisted objects.  This service lays the
 * groundwork for a future where branches can be named, listed,
 * and switched between.
 */

import { chatSession } from '../chats/ChatSession.js';
import { messageService } from './MessageService.js';

export interface BranchPoint {
    /** The message index where the branch was created. */
    index: number;
    /** A label for the branch (auto-generated or user-supplied). */
    label: string;
    /** Timestamp when the branch was created. */
    createdAt: number;
    /** Snapshot of the messages at the branch point (for later restoration). */
    snapshot: ChatMessage[];
}

/**
 * Result of a branch operation.
 */
export interface BranchResult {
    success: boolean;
    branchPoint: BranchPoint;
    truncatedCount: number;
}

/**
 * Service for conversation branching.
 *
 * Currently the branching model is simple: "fork at index N,
 * discarding everything after it."  Future iterations can
 * persist branch metadata alongside the chat.
 */
class BranchService {
    private branches = new Map<string, BranchPoint[]>();

    // ── Fork ──────────────────────────────────────────────────

    /**
     * Fork the conversation at a given message index.
     *
     * Everything *after* `forkIndex` is removed.  The fork point
     * is recorded so it can potentially be revisited.
     * @param forkIndex  Index of the last message to keep.
     * @param label      Optional human-readable label.
     */
    async fork(forkIndex: number, label?: string): Promise<BranchResult> {
        const chatId = chatSession.currentChatId;
        if (!chatId) {
            return {
                success: false,
                branchPoint: this.makePoint(forkIndex, label ?? 'fork'),
                truncatedCount: 0,
            };
        }

        const msgs = chatSession.messages;
        const totalBefore = msgs.length;

        // Truncate everything after the fork point
        await messageService.delete(forkIndex + 1, { untilEnd: true });

        const branchPoint = this.makePoint(forkIndex, label ?? `Branch at message ${forkIndex}`);
        this.record(chatId, branchPoint);

        return {
            success: true,
            branchPoint,
            truncatedCount: totalBefore - (forkIndex + 1),
        };
    }

    /**
     * Fork and immediately append a new message.
     *
     * Convenience for the common "edit and continue" pattern.
     * @param forkIndex
     * @param newMessage
     */
    async forkAndAppend(forkIndex: number, newMessage: ChatMessage): Promise<BranchResult> {
        const result = await this.fork(forkIndex);
        if (result.success) {
            await messageService.add(newMessage);
        }
        return result;
    }

    // ── Query ─────────────────────────────────────────────────

    /**
     * Return all recorded branch points for the current chat.
     * @param chatId
     */
    getBranches(chatId?: string): BranchPoint[] {
        const id = chatId ?? chatSession.currentChatId;
        return id ? (this.branches.get(id) ?? []) : [];
    }

    /**
     * Whether the current chat has any branch points.
     * @param chatId
     */
    hasBranches(chatId?: string): boolean {
        return this.getBranches(chatId).length > 0;
    }

    /**
     * Clear recorded branches for a chat.
     * @param chatId
     */
    clearBranches(chatId?: string): void {
        const id = chatId ?? chatSession.currentChatId;
        if (id) this.branches.delete(id);
    }

    // ── Internals ─────────────────────────────────────────────

    private makePoint(index: number, label: string): BranchPoint {
        return {
            index,
            label,
            createdAt: Date.now(),
            snapshot: [...chatSession.messages],
        };
    }

    private record(chatId: string, point: BranchPoint): void {
        const existing = this.branches.get(chatId) ?? [];
        existing.push(point);
        this.branches.set(chatId, existing);
    }
}

/** Singleton service instance. */
export const branchService = new BranchService();
