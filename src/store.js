/**
 * store.js — the phrase list's shape and every mutation, without any I/O.
 *
 * The file on disk is `{ version: 1, phrases: [{ id, text, createdAt }] }`. All
 * validation lives here so the HTTP layer and the disk sanitizer cannot drift:
 * an empty phrase, an oversized one, or a duplicate is refused with one
 * message, never silently dropped.
 */

/** Upper bounds: a phrase bar is for one-liners, not documents. */
export const MAX_PHRASES = 100;
export const MAX_TEXT_LENGTH = 300;

/**
 * Trim a submitted phrase. Newlines survive (a canned reply may be two lines);
 * CRLF is normalized so the same phrase typed on Windows is not a duplicate on
 * macOS.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanText(raw) {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/**
 * Drop anything the file should never contain: wrong types, empty bodies,
 * oversized bodies, duplicates and over-cap rows. A sanitized file is rewritten
 * only on the next mutation, so reading never rewrites the user's file.
 * @param {unknown} raw
 * @returns {{ version: 1, phrases: { id: string, text: string, createdAt: string }[] }}
 */
export function normalizeState(raw) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rows = Array.isArray(/** @type {any} */ (source).phrases)
    ? /** @type {any} */ (source).phrases
    : [];
  /** @type {{ id: string, text: string, createdAt: string }[]} */
  const phrases = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const text = cleanText(row.text);
    if (text === "" || text.length > MAX_TEXT_LENGTH) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    phrases.push({
      id: typeof row.id === "string" && row.id !== "" ? row.id : makeId(),
      text,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    });
    if (phrases.length >= MAX_PHRASES) break;
  }
  return { version: 1, phrases };
}

/** A short, sortable-enough identity; uniqueness only has to survive one file. */
export function makeId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `p_${Date.now().toString(36)}_${random}`;
}

/**
 * Apply one mutation.
 *
 * @param {{ version: 1, phrases: { id: string, text: string, createdAt: string }[] }} state
 * @param {Record<string, any>} action
 * @param {{ id?: string, now?: string }} [clock]
 * @returns {{ state: { version: 1, phrases: { id: string, text: string, createdAt: string }[] }, error?: string }}
 */
export function applyAction(state, action, clock = {}) {
  const current = normalizeState(state);
  if (action === null || typeof action !== "object") {
    return { state: current, error: "invalid_request" };
  }
  const kind = typeof action.action === "string" ? action.action : "";
  const id = typeof action.id === "string" ? action.id : "";
  const now = typeof clock.now === "string" ? clock.now : new Date().toISOString();

  if (kind === "add") {
    const text = cleanText(action.text);
    if (text === "") return { state: current, error: "empty" };
    if (text.length > MAX_TEXT_LENGTH) return { state: current, error: "too_long" };
    if (current.phrases.some((row) => row.text === text)) {
      return { state: current, error: "duplicate" };
    }
    if (current.phrases.length >= MAX_PHRASES) {
      return { state: current, error: "too_many" };
    }
    return {
      state: {
        version: 1,
        phrases: [...current.phrases, { id: typeof clock.id === "string" ? clock.id : makeId(), text, createdAt: now }],
      },
    };
  }

  if (kind === "update") {
    const text = cleanText(action.text);
    if (id === "") return { state: current, error: "invalid_request" };
    if (text === "") return { state: current, error: "empty" };
    if (text.length > MAX_TEXT_LENGTH) return { state: current, error: "too_long" };
    if (current.phrases.some((row) => row.id !== id && row.text === text)) {
      return { state: current, error: "duplicate" };
    }
    if (!current.phrases.some((row) => row.id === id)) {
      return { state: current, error: "not_found" };
    }
    return {
      state: {
        version: 1,
        phrases: current.phrases.map((row) => (row.id === id ? { ...row, text } : row)),
      },
    };
  }

  if (kind === "delete") {
    if (id === "") return { state: current, error: "invalid_request" };
    if (!current.phrases.some((row) => row.id === id)) {
      return { state: current, error: "not_found" };
    }
    return {
      state: { version: 1, phrases: current.phrases.filter((row) => row.id !== id) },
    };
  }

  return { state: current, error: "unknown_action" };
}
