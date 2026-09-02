// The Fetch spec requires `duplex: 'half'` for requests with a ReadableStream
// body, but the bundled TypeScript DOM lib omits it from `RequestInit` (it was
// rejected upstream as Blink-only). Augment it here so Chromium/Blink-based
// runtimes (VS Code webview, Electron renderer) can reconstruct stream-body
// requests without the "duplex member must be specified" error.
interface RequestInit {
  duplex?: 'half';
}
