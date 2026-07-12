/**
 * Creates an AbortController and wires it to the Express request socket.
 *
 * Every chat-completion provider that does direct fetch() needs exactly this
 * boilerplate.  Extracting it saves 33 duplicated lines across 11 providers.
 *
 * Usage:
 *   const { signal } = createSocketAbortController(req);
 *   const response = await fetch(url, { signal, ... });
 */
export function createSocketAbortController(
    socket: import('net').Socket | import('node:net').Socket | undefined,
): AbortController {
    const controller = new AbortController();
    if (socket) {
        socket.removeAllListeners('close');
        socket.on('close', () => controller.abort());
    }
    return controller;
}
