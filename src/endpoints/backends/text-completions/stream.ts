/**
 * Stream handling for text-completion backends.
 *
 * Most providers use standard SSE and are handled by forwardFetchResponse in
 * the shared proxy layer.  Providers with non-standard stream formats (e.g.
 * Ollama's NDJSON) expose a custom handler via the `stream` method on the
 * BackendProvider interface.
 */

export { parseOllamaStream } from './providers/ollama.js';
