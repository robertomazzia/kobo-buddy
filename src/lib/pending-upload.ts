// Tiny in-memory store so the dashboard drop zone can hand a File over to
// the /optimizer route without serializing it through history state.
let pending: File | null = null;

export function setPendingEpub(file: File | null) {
  pending = file;
}

export function takePendingEpub(): File | null {
  const f = pending;
  pending = null;
  return f;
}
