/**
 * Browser half of dsh-phrase.
 *
 * Three surfaces over one list:
 * - the right-Sidebar "Phrases" tab, which adds, edits and deletes;
 * - one "Phrases" chip in the composer tool row (`conversation.input.left`,
 *   right after the permission control) that opens a dropdown and inserts a
 *   line in one click. That row is drawn by the same `InputBar` on the New
 *   Session page and in a live Session; `conversation.composer.dock` is not.
 *
 * The list lives on the Host (`<DSH_HOME>/dsh-phrase.json`); this module reads
 * and mutates it through `/api/dsh-phrase`, so the data survives restarts and
 * does not depend on a browser origin. Every visible string goes through the
 * client locale service (`zh` and `en` are both registered below).
 */

window.__ModuleLoader__.load({
  id: "dsh-phrase",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;
    /** Latest client context, for the chip and the locale binding. */
    const ctxRef = { current: null };

    /** Host theme tokens, each with a neutral fallback so a rename degrades. */
    const T = {
      text: "var(--dsw-alias-label-primary, currentColor)",
      text2: "var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 70%, transparent))",
      text3: "var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 52%, transparent))",
      caption: "var(--dsw-alias-label-caption, color-mix(in srgb, currentColor 45%, transparent))",
      base: "var(--dsw-alias-bg-base, transparent)",
      layer1: "var(--dsw-alias-bg-layer-1, color-mix(in srgb, currentColor 4%, transparent))",
      card: "var(--dsw-alias-card-fill, color-mix(in srgb, currentColor 3%, transparent))",
      border1: "var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 10%, transparent))",
      accent: "var(--dsw-alias-brand-primary, color-mix(in srgb, currentColor 70%, transparent))",
      warn: "var(--dsw-alias-state-warn-primary, color-mix(in srgb, currentColor 55%, transparent))",
      danger: "var(--dsw-alias-state-error-primary, color-mix(in srgb, currentColor 80%, transparent))",
    };

    const NS = "dsh-phrase";
    const TAB_KIND = "dsh-phrase";
    const TAB_ID = "dsh-phrase/panel";
    /** Fixed DOM id so the chip can point `aria-controls` at its dropdown. */
    const MENU_ID = "dsh-phrase-menu";
    const HUE = "#0891b2";

    /** UI copy. Both baseline locales are required by the locale service. */
    const DICTS = {
      zh: {
        tabTitle: "口头禅",
        guideTitle: "口头禅",
        guideDescription: "常说的话，点击插入输入框",
        title: "口头禅",
        refresh: "刷新",
        addPlaceholder: "新增一句常说的话，比如：先给结论，再动手。",
        addAria: "新增口头禅",
        save: "保存",
        cancel: "取消",
        insert: "插入",
        edit: "编辑",
        delete: "删除",
        confirmDelete: "确认删除",
        hint: "点句子插入输入框；最多 100 条，每条 300 字",
        loading: "读取中…",
        empty: "还没有保存的口头禅。上面输入一句，保存后点它就能插入。",
        clickToInsert: "点击插入到输入框",
        menuTitle: "口头禅",
        menuHint: "点一句插入输入框",
        menuManage: "管理",
        menuManageTitle: "打开右侧栏口头禅面板，可增删改",
        menuEmpty: "还没有保存的口头禅。点「管理」去添加。",
        menuCount: "条",
        menuInsertFailed: "插入失败，点一下输入框再试",
        inserted: "已插入到输入框",
        appended: "已追加到输入框",
        insertUnavailable: "在会话里打开这个面板才能插入",
        insertFailed: "插入失败，请把光标放到输入框后重试",
        errEmpty: "内容不能为空",
        errTooLong: "内容不能超过 300 个字符",
        errDuplicate: "这句已经存过了",
        errTooMany: "最多保存 100 条",
        errNotFound: "找不到这条口头禅",
        errBadRequest: "请求格式不正确",
        errStoreCorrupt: "存储文件不是合法 JSON，未加载",
        errRead: "读取失败",
        errSave: "保存失败",
        errNoEndpoint: "没有可用的接口",
      },
      en: {
        tabTitle: "Phrases",
        guideTitle: "Phrases",
        guideDescription: "The lines you say often — click to insert",
        title: "Phrases",
        refresh: "Refresh",
        addPlaceholder: 'Add a line you say often, e.g. "Conclusion first, then act."',
        addAria: "New phrase",
        save: "Save",
        cancel: "Cancel",
        insert: "Insert",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Delete",
        hint: "Click a line to insert it; up to 100 lines, 300 characters each",
        loading: "Loading…",
        empty: "No phrases yet. Add one above, then click it to insert.",
        clickToInsert: "Click to insert into the composer",
        menuTitle: "Phrases",
        menuHint: "Click a line to insert it",
        menuManage: "Manage",
        menuManageTitle: "Open the Phrases panel to add, edit or delete",
        menuEmpty: "No phrases yet. Use Manage to add one.",
        menuCount: "saved",
        menuInsertFailed: "Insert failed — click into the composer and retry",
        inserted: "Inserted into the composer",
        appended: "Appended to the composer",
        insertUnavailable: "Open this panel in a session to insert",
        insertFailed: "Insert failed — click into the composer and retry",
        errEmpty: "The phrase is empty",
        errTooLong: "A phrase is limited to 300 characters",
        errDuplicate: "That phrase is already saved",
        errTooMany: "The list holds at most 100 phrases",
        errNotFound: "That phrase no longer exists",
        errBadRequest: "The request was malformed",
        errStoreCorrupt: "The store file is not valid JSON; it was not loaded",
        errRead: "Could not read the phrases",
        errSave: "Could not save the phrase",
        errNoEndpoint: "No usable endpoint answered",
      },
    };

    /** Set by `apply`; returns the key itself until the locale service binds. */
    let translate = (key) => key;
    const localeListeners = new Set();

    /** Re-render this component when the GUI language changes. */
    function useT() {
      const [, setRevision] = useState(0);
      useEffect(() => {
        const listener = () => setRevision((value) => value + 1);
        localeListeners.add(listener);
        return () => {
          localeListeners.delete(listener);
        };
      }, []);
      return translate;
    }

    /* ------------------------------ phrase menu ------------------------------- */

    /*
     * A chip runs in `session` scope while `shell.overlay` runs in `root` scope,
     * so the chip and its dropdown cannot be one component. The
     * chip owns the data and the insertion callbacks (only a Session has
     * `useInput`/`inputActions`) and publishes them here; the overlay entry is
     * a dumb presenter anchored to the chip's last measured rect.
     */
    const phraseMenu = {
      open: false,
      rect: null,
      status: "loading",
      phrases: [],
      error: null,
      notice: null,
      insert: null,
      manage: null,
      refresh: null,
      focusOnOpen: false,
    };
    const phraseMenuListeners = new Set();

    function publishPhraseMenu(patch) {
      Object.assign(phraseMenu, patch);
      for (const listener of phraseMenuListeners) listener();
    }

    /** Re-render the caller whenever the shared menu state changes. */
    function usePhraseMenu() {
      const [, setRevision] = useState(0);
      useEffect(() => {
        const listener = () => setRevision((value) => value + 1);
        phraseMenuListeners.add(listener);
        return () => {
          phraseMenuListeners.delete(listener);
        };
      }, []);
      return phraseMenu;
    }

    /* --------------------------------- data ---------------------------------- */

    function routeUrls(path) {
      const bases = [];
      try { bases.push(document.baseURI); } catch { /* no document base */ }
      try { if (location.origin && location.origin !== "null") bases.push(`${location.origin}/`); } catch { /* no origin */ }
      try { bases.push(location.href); } catch { /* no location */ }
      const candidates = [];
      for (const base of bases) {
        try {
          candidates.push(new URL(path, base).toString());
        } catch {
          // An unusable base contributes no candidate.
        }
      }
      try {
        candidates.push(new URL(`/${path}`, location.origin).toString());
      } catch {
        // `file:` and similar origins have no usable origin.
      }
      return [...new Set(candidates)];
    }

    /** A refusal from the Host, normalized to a code the panel can translate. */
    function failure(body, status, fallback) {
      const code = body && typeof body.error === "string" ? body.error : fallback;
      const detail = body && typeof body.path === "string" ? body.path : "";
      return { ok: false, error: { code, status, detail } };
    }

    async function readPhrases() {
      const tried = [];
      for (const url of routeUrls("api/dsh-phrase")) {
        tried.push(url);
        try {
          const response = await fetch(url, { headers: { accept: "application/json" } });
          const text = await response.text();
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            continue;
          }
          if (!response.ok) return failure(body, response.status, "read_failed");
          return { ok: true, body };
        } catch {
          // Try the next candidate.
        }
      }
      return { ok: false, error: { code: "no_endpoint", status: 0, detail: tried.join(", ") } };
    }

    async function writePhrase(action) {
      const candidates = routeUrls("api/dsh-phrase");
      const url = candidates.find((candidate) => candidate.startsWith(`${location.origin}/`)) ?? candidates[0];
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            // Custom header + JSON body: both make a cross-origin page need a
            // preflight this server never answers.
            "x-dsh-phrase-write": "1",
          },
          body: JSON.stringify(action),
        });
        const text = await response.text();
        let body = null;
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
        if (!response.ok) return failure(body, response.status, "save_failed");
        return { ok: true, body };
      } catch (error) {
        return {
          ok: false,
          error: { code: "save_failed", status: 0, detail: error instanceof Error ? error.message : String(error) },
        };
      }
    }

    function errorText(t, error) {
      const keys = {
        empty: "errEmpty",
        too_long: "errTooLong",
        duplicate: "errDuplicate",
        too_many: "errTooMany",
        not_found: "errNotFound",
        store_corrupt: "errStoreCorrupt",
        read_failed: "errRead",
        save_failed: "errSave",
        no_endpoint: "errNoEndpoint",
      };
      const key = keys[error && error.code] ?? "errBadRequest";
      let text = t(key);
      if (error && typeof error.status === "number" && error.status > 0) text += ` (HTTP ${error.status})`;
      if (error && error.detail) text += `: ${error.detail}`;
      return text;
    }

    function usePhrases() {
      const [state, setState] = useState({ status: "loading", phrases: [], error: null });
      const [nonce, setNonce] = useState(0);
      const refresh = useCallback(() => setNonce((value) => value + 1), []);
      useEffect(() => {
        let alive = true;
        readPhrases().then((result) => {
          if (!alive) return;
          if (!result.ok) {
            setState({ status: "error", phrases: [], error: result.error });
            return;
          }
          const phrases = Array.isArray(result.body?.phrases) ? result.body.phrases : [];
          setState({ status: "ready", phrases, error: null });
        });
        return () => {
          alive = false;
        };
      }, [nonce]);
      return {
        ...state,
        refresh,
        setPhrases: (phrases) => setState({ status: "ready", phrases, error: null }),
      };
    }

    /* -------------------------------- rendering ------------------------------- */

    function button(label, title, onClick, options = {}) {
      const { disabled = false, tone = "default" } = options;
      const color = tone === "danger" ? T.danger : tone === "accent" ? T.accent : T.text2;
      return h(
        "button",
        {
          type: "button",
          title,
          disabled,
          onClick: (event) => {
            event?.stopPropagation?.();
            onClick();
          },
          style: {
            height: 24,
            padding: "0 9px",
            borderRadius: 7,
            border: `1px solid ${tone === "danger" ? `color-mix(in srgb, ${T.danger} 45%, transparent)` : T.border1}`,
            background: tone === "accent" ? `color-mix(in srgb, ${T.accent} 12%, transparent)` : "transparent",
            color,
            fontWeight: 600,
            fontSize: 11,
            lineHeight: 1,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            flex: "0 0 auto",
          },
        },
        label,
      );
    }

    function PhraseGlyph({ size = 22, className } = {}) {
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", className, "aria-hidden": true, style: { display: "block" } },
        h("path", {
          d: "M5 6.5h14M5 11h9M5 15.5h11",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.8,
          strokeLinecap: "round",
        }),
        h("rect", { x: 3, y: 3, width: 18, height: 18, rx: 4, fill: "none", stroke: "currentColor", strokeWidth: 1.6 }),
      );
    }

    function PhraseRow(props) {
      const {
        t,
        phrase,
        editing,
        confirming,
        busy,
        onInsert,
        onStartEdit,
        onEditText,
        onSaveEdit,
        onCancel,
        onStartDelete,
        onConfirmDelete,
      } = props;
      const editingThis = editing !== null && editing.id === phrase.id;
      const confirmingThis = confirming === phrase.id;

      if (editingThis) {
        return h(
          "div",
          {
            key: phrase.id,
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 9px",
              borderRadius: 8,
              background: T.card,
              border: `1px solid color-mix(in srgb, ${T.accent} 40%, ${T.border1})`,
            },
          },
          h("textarea", {
            value: editing.text,
            rows: 2,
            onChange: (event) => onEditText(event.target.value),
            style: {
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              minHeight: 48,
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${T.border1}`,
              background: T.base,
              color: T.text,
              fontWeight: 400,
              fontSize: 12,
              lineHeight: 1.5,
              fontFamily: "inherit",
            },
          }),
          h(
            "div",
            { style: { display: "flex", gap: 6 } },
            button(t("save"), t("save"), onSaveEdit, { disabled: busy, tone: "accent" }),
            button(t("cancel"), t("cancel"), onCancel),
          ),
        );
      }

      return h(
        "div",
        {
          key: phrase.id,
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 9px",
            borderRadius: 8,
            background: T.card,
            border: `1px solid ${T.border1}`,
            borderLeft: `2px solid color-mix(in srgb, ${HUE} 55%, transparent)`,
          },
        },
        h(
          "div",
          {
            title: t("clickToInsert"),
            onClick: () => onInsert(phrase.text),
            style: {
              flex: "1 1 auto",
              minWidth: 0,
              fontWeight: 400,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: T.text2,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              cursor: "pointer",
            },
          },
          phrase.text,
        ),
        confirmingThis
          ? h(
              "div",
              { style: { display: "flex", gap: 4, flex: "0 0 auto" } },
              button(t("confirmDelete"), t("confirmDelete"), onConfirmDelete, { disabled: busy, tone: "danger" }),
              button(t("cancel"), t("cancel"), onCancel),
            )
          : h(
              "div",
              { style: { display: "flex", gap: 4, flex: "0 0 auto" } },
              button(t("insert"), t("clickToInsert"), () => onInsert(phrase.text), { tone: "accent" }),
              button(t("edit"), t("edit"), () => onStartEdit(phrase)),
              button(t("delete"), t("delete"), () => onStartDelete(phrase.id)),
            ),
      );
    }

    function PhrasesPanel(props = {}) {
      const t = useT();
      const { status, phrases, error, refresh, setPhrases } = usePhrases();
      const [addText, setAddText] = useState("");
      const [editing, setEditing] = useState(null);
      const [confirming, setConfirming] = useState("");
      const [notice, setNotice] = useState(null);
      const [busy, setBusy] = useState(false);
      // The host's selector hook over the composer draft. Called unconditionally:
      // the panel only mounts inside a Session, where the hook is present, but a
      // conditional hook call would still be a rules-of-hooks violation.
      const useDraft = typeof props.useInput === "function" ? props.useInput : () => "";
      const draft = useDraft((state) => (state && typeof state.draft === "string" ? state.draft : ""));

      const insert = useCallback(
        (text) => {
          const actions = props.inputActions;
          if (actions === undefined) {
            setNotice({ key: "insertUnavailable" });
            return;
          }
          try {
            const span = actions.captureInsertion();
            if (actions.insertText(text, span)) {
              setNotice({ key: "inserted" });
              return;
            }
          } catch {
            // Fall through to the whole-draft fallback.
          }
          try {
            actions.setDraft(`${draft}${draft === "" ? "" : "\n"}${text}`);
            setNotice({ key: "appended" });
          } catch {
            setNotice({ key: "insertFailed" });
          }
        },
        [props.inputActions, draft],
      );

      const save = useCallback(
        async (action) => {
          if (busy) return false;
          setBusy(true);
          setNotice(null);
          const result = await writePhrase(action);
          setBusy(false);
          if (!result.ok) {
            setNotice({ error: result.error });
            return false;
          }
          const next = Array.isArray(result.body?.phrases) ? result.body.phrases : [];
          setPhrases(next);
          return true;
        },
        [busy, setPhrases],
      );

      const add = useCallback(async () => {
        const text = addText.trim();
        if (text === "") return;
        const ok = await save({ action: "add", text });
        if (ok) setAddText("");
      }, [addText, save]);

      const saveEdit = useCallback(async () => {
        if (editing === null) return;
        const ok = await save({ action: "update", id: editing.id, text: editing.text });
        if (ok) setEditing(null);
      }, [editing, save]);

      const confirmDelete = useCallback(async () => {
        const id = confirming;
        if (id === "") return;
        const ok = await save({ action: "delete", id });
        if (ok) setConfirming("");
      }, [confirming, save]);

      const noticeText =
        notice === null
          ? ""
          : notice.error
            ? errorText(t, notice.error)
            : t(notice.key);

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: T.text } },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 14px 10px",
              borderBottom: `1px solid ${T.border1}`,
              flex: "0 0 auto",
              flexWrap: "wrap",
            },
          },
          h("span", { style: { fontWeight: 650, fontSize: 14, lineHeight: 1.2, letterSpacing: "-0.01em" } }, t("title")),
          h(
            "span",
            {
              style: {
                fontWeight: 600,
                fontSize: 10.5,
                lineHeight: 1,
                color: HUE,
                background: `color-mix(in srgb, ${HUE} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${HUE} 32%, transparent)`,
                borderRadius: 999,
                padding: "1px 6px",
              },
            },
            String(phrases.length),
          ),
          h("span", { style: { flex: "1 1 auto" } }),
          button(t("refresh"), t("refresh"), refresh),
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 14px",
              borderBottom: `1px solid ${T.border1}`,
              flex: "0 0 auto",
              background: T.layer1,
            },
          },
          h("textarea", {
            value: addText,
            rows: 2,
            placeholder: t("addPlaceholder"),
            "aria-label": t("addAria"),
            onChange: (event) => setAddText(event.target.value),
            style: {
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              minHeight: 44,
              padding: "7px 9px",
              borderRadius: 8,
              border: `1px solid ${T.border1}`,
              background: T.base,
              color: T.text,
              fontWeight: 400,
              fontSize: 12.5,
              lineHeight: 1.5,
              fontFamily: "inherit",
            },
          }),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
            button(t("save"), t("save"), add, { disabled: busy || addText.trim() === "", tone: "accent" }),
            h(
              "span",
              { style: { fontWeight: 400, fontSize: 10.5, lineHeight: 1.4, color: T.caption } },
              t("hint"),
            ),
          ),
        ),
        notice === null
          ? null
          : h(
              "div",
              {
                style: {
                  padding: "7px 14px",
                  fontWeight: 500,
                  fontSize: 11.5,
                  lineHeight: 1.4,
                  color: notice.error ? T.warn : HUE,
                  borderBottom: `1px solid ${T.border1}`,
                  flex: "0 0 auto",
                },
              },
              noticeText,
            ),
        status === "loading"
          ? h("div", { style: { padding: "18px 14px", fontWeight: 400, fontSize: 12, lineHeight: 1.5, color: T.text3 } }, t("loading"))
          : null,
        status === "error"
          ? h(
              "div",
              { style: { padding: "16px 14px", fontWeight: 400, fontSize: 12, lineHeight: 1.5, color: T.warn, overflowWrap: "anywhere" } },
              errorText(t, error),
            )
          : null,
        status === "ready"
          ? h(
              "div",
              {
                style: {
                  flex: "1 1 auto",
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "10px 14px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  scrollbarWidth: "thin",
                },
              },
              phrases.length === 0
                ? h(
                    "div",
                    { style: { fontWeight: 400, fontSize: 12, lineHeight: 1.5, color: T.caption, padding: "4px 2px" } },
                    t("empty"),
                  )
                : phrases.map((phrase) =>
                    h(PhraseRow, {
                      key: phrase.id,
                      t,
                      phrase,
                      editing,
                      confirming,
                      busy,
                      onInsert: insert,
                      onStartEdit: (target) => {
                        setConfirming("");
                        setEditing({ id: target.id, text: target.text });
                      },
                      onEditText: (text) => setEditing((current) => (current === null ? null : { ...current, text })),
                      onSaveEdit: saveEdit,
                      onCancel: () => {
                        setEditing(null);
                        setConfirming("");
                      },
                      onStartDelete: (id) => {
                        setEditing(null);
                        setConfirming(id);
                      },
                      onConfirmDelete: confirmDelete,
                    }),
                  ),
            )
          : null,
      );
    }


    /* ----------------------------- chip and menu ------------------------------ */

    /*
     * Attribute-scoped rules instead of inline styles: the chip must match the
     * permission trigger beside it, and only CSS can express `:hover`,
     * `aria-expanded` and `:focus-visible`. Every value is a theme token with a
     * literal fallback, so a renamed token degrades instead of breaking.
     */
    const PHRASE_CSS = [
      // One chip in the composer tool row, matching the sibling permission
      // trigger value for value (same height, inset padding, colour, type).
      "[data-phrase-chip]{display:inline-flex;align-items:center;gap:4px;max-width:220px;height:28px;padding:0 4px 0 8px;",
      "border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;",
      "color:var(--dsw-alias-label-secondary,currentColor);font-family:inherit;font-size:13px;font-weight:500;line-height:20px;",
      "cursor:pointer}",
      '[data-phrase-chip][aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      "@media (hover:hover){[data-phrase-chip]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}}",
      "[data-phrase-chip]:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));",
      "outline-offset:1px}",
      // The host's own menu surface: translucent fill + backdrop blur, the
      // elevation stroke carried inside the shadow (no border box).
      "[data-phrase-menu]{position:fixed;z-index:30;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;",
      "border:0;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-specific-menu,rgba(248,249,250,.94));",
      "backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));",
      "box-shadow:var(--dsw-elevation-panel,0 0 0 0.5px rgba(0,0,0,.16),0 3px 8px rgba(0,0,0,.03),0 0 16px rgba(0,0,0,.02));",
      "color:var(--dsw-alias-label-primary,currentColor);font-size:13px;line-height:20px;pointer-events:auto}",
      "[data-phrase-menu] header{display:flex;align-items:center;gap:6px;padding:8px 10px 6px;",
      "border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.04))}",
      "[data-phrase-menu] [data-phrase-count]{color:var(--dsw-alias-label-caption,currentColor);font-size:11px;font-weight:400}",
      "[data-phrase-menu] [data-phrase-manage],[data-phrase-menu] [data-phrase-retry]{margin-left:auto;height:22px;padding:0 8px;",
      "cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));border-radius:var(--dsw-radius-sm,6px);",
      "background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font-family:inherit;font-size:11px;font-weight:500}",
      "@media (hover:hover){[data-phrase-menu] [data-phrase-manage]:hover,",
      "[data-phrase-menu] [data-phrase-retry]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}}",
      "[data-phrase-menu] [data-phrase-manage]:focus-visible,",
      "[data-phrase-menu] [data-phrase-retry]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}",
      // `overscroll-behavior` keeps a wheel that reaches the end of the list
      // from chaining into the hero body, which would close the menu (the
      // anchor rect is stale after any page scroll).
      "[data-phrase-menu] [data-phrase-body]{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;",
      "padding:6px;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin}",
      "[data-phrase-menu] [data-phrase-row]{display:block;width:100%;box-sizing:border-box;padding:7px 8px;border:0;",
      "border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,currentColor);",
      "font-family:inherit;font-size:13px;font-weight:400;line-height:20px;text-align:left;white-space:pre-wrap;",
      "overflow-wrap:anywhere;cursor:pointer}",
      // The clamp lives on the inner span: a button's anonymous content box does
      // not reliably honour line-clamp, and the row must stay a real button.
      "[data-phrase-menu] [data-phrase-row-text]{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
      "@media (hover:hover){[data-phrase-menu] [data-phrase-row]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}}",
      "[data-phrase-menu] [data-phrase-row]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-2px}",
      "[data-phrase-menu] [data-phrase-empty]{padding:14px 10px;color:var(--dsw-alias-label-caption,currentColor);",
      "font-size:12px;font-weight:400;line-height:18px}",
      "[data-phrase-menu] [data-phrase-note]{padding:8px 10px;color:var(--dsw-alias-state-warn-primary,#b45309);",
      "font-size:12px;font-weight:400;line-height:18px;overflow-wrap:anywhere}",
      "[data-phrase-menu] footer{padding:5px 10px 7px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.04));",
      "color:var(--dsw-alias-label-caption,currentColor);font-size:11px;font-weight:400}",
    ].join("");

    function IconLines({ size = 15 } = {}) {
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          "aria-hidden": true,
          style: { display: "block", flex: "none", color: "currentColor" },
        },
        h("path", {
          d: "M3 4.5h10M3 8h7M3 11.5h9",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.5,
          strokeLinecap: "round",
        }),
      );
    }

    function IconChevron({ size = 12 } = {}) {
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 12 12",
          "aria-hidden": true,
          style: { display: "block", flex: "none", color: "var(--dsw-alias-label-caption, currentColor)" },
        },
        h("path", {
          d: "M3 4.5 6 7.5 9 4.5",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

    /**
     * The chip in the composer tool row, right after the permission control. It
     * is registered once, in `conversation.input.left`: that row is rendered by
     * the same `InputBar` on the New Session page and in a live Session, unlike
     * `conversation.composer.dock`, which the hero variant never draws.
     *
     * The chip owns the phrase list, the insertion facade and the anchor rect;
     * the dropdown itself renders in `shell.overlay`, so no scroll container can
     * clip it.
     */
    function PhraseMenuChip(props) {
      const t = useT();
      const menu = usePhraseMenu();
      const { status, phrases, error, refresh } = usePhrases();
      const buttonRef = useRef(null);
      // Same facade the panel uses; called unconditionally because the hero row
      // only mounts inside a Session, where both props exist.
      const useDraft = typeof props.useInput === "function" ? props.useInput : () => "";
      const draft = useDraft((state) => (state && typeof state.draft === "string" ? state.draft : ""));

      /**
       * Insert a saved line at the caret, then close. A failed span capture
       * degrades to appending the whole draft; only a thrown facade leaves the
       * dropdown open with a warning.
       * @param text - the phrase to insert.
       */
      const insert = useCallback(
        (text) => {
          const actions = props.inputActions;
          if (actions === undefined) {
            publishPhraseMenu({ notice: "menuInsertFailed" });
            return;
          }
          try {
            const span = actions.captureInsertion();
            if (actions.insertText(text, span)) {
              publishPhraseMenu({ open: false, notice: null });
              return;
            }
          } catch {
            // Fall through to the whole-draft fallback.
          }
          try {
            actions.setDraft(`${draft}${draft === "" ? "" : "\n"}${text}`);
            publishPhraseMenu({ open: false, notice: null });
          } catch {
            publishPhraseMenu({ notice: "menuInsertFailed" });
          }
        },
        [props.inputActions, draft],
      );
      const insertRef = useRef(insert);
      useEffect(() => {
        insertRef.current = insert;
      }, [insert]);
      // Stable identities keep the publish effect off the keystroke path: the
      // facade's `inputActions` object is the host's, not ours to assume stable.
      const publishedInsert = useCallback((text) => insertRef.current(text), []);
      const publishedManage = useCallback(() => {
        publishPhraseMenu({ open: false, notice: null });
        try {
          ctxRef.current.sidebarRight.openTab(TAB_KIND);
        } catch (failure) {
          console.warn("[dsh-phrase] could not open the phrases panel", failure);
        }
      }, []);

      useEffect(() => {
        publishPhraseMenu({ status, phrases, error, refresh, insert: publishedInsert, manage: publishedManage });
      }, [status, phrases, error, refresh, publishedInsert, publishedManage]);
      useEffect(
        () => () => {
          // Leaving the blank session must not strand an open dropdown over the
          // next page, and a stale closure would insert into a dead session.
          publishPhraseMenu({ open: false, notice: null, insert: null, manage: null });
        },
        [],
      );

      const toggle = useCallback((event) => {
        if (phraseMenu.open) {
          publishPhraseMenu({ open: false, notice: null });
          return;
        }
        const node = buttonRef.current;
        if (node === null) return;
        const rect = node.getBoundingClientRect();
        publishPhraseMenu({
          open: true,
          notice: null,
          // A pointer open must leave the caret in the composer (that is where
          // the phrase lands); a keyboard open has no caret to protect, so the
          // dropdown takes focus and supports arrow keys.
          focusOnOpen: event !== undefined && event.detail === 0,
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        });
        // The panel edits the same file; re-read on every open so the dropdown
        // never offers a phrase the panel already deleted.
        refresh();
      }, [refresh]);

      return h(
        React.Fragment,
        null,
        h("style", { key: "css" }, PHRASE_CSS),
        h(
          "button",
          {
            ref: buttonRef,
            type: "button",
            "data-phrase-chip": "",
            "aria-expanded": menu.open,
            "aria-controls": MENU_ID,
            title: t("menuHint"),
            // Never take focus on press: the composer keeps the caret that
            // `captureInsertion` reads, and the user can keep typing afterwards.
            onMouseDown: (event) => event.preventDefault(),
            onClick: toggle,
          },
          h(IconLines, { size: 14 }),
          h(
            "span",
            { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
            t("menuTitle"),
          ),
          h(IconChevron, { size: 12 }),
        ),
      );
    }

    /**
     * The dropdown, in the frame-wide overlay so neither the transcript nor the
     * docked composer can clip it. It is a presenter: everything it draws
     * comes from {@link phraseMenu}.
     */
    function PhraseMenuLayer() {
      const t = useT();
      const menu = usePhraseMenu();
      const panelRef = useRef(null);

      useEffect(() => {
        if (!menu.open) return undefined;
        // Minimal range: the chip toggles itself, and a press on the panel must
        // not count as "outside".
        const outside = (target) =>
          !(target instanceof Element) || target.closest("[data-phrase-menu], [data-phrase-chip]") === null;
        const onPointerDown = (event) => {
          if (outside(event.target)) publishPhraseMenu({ open: false, notice: null });
        };
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          // Consume it: the shell listens for Escape too, and closing the whole
          // layer stack behind a dropdown is not what the user asked for.
          event.stopPropagation();
          publishPhraseMenu({ open: false, notice: null });
          const chip = document.querySelector("[data-phrase-chip]");
          if (chip instanceof HTMLElement) chip.focus();
        };
        // The anchor rect is a snapshot: any layout move invalidates it, and a
        // scroll inside the dropdown's own list is not a layout move.
        const onMove = (event) => {
          if (event.type === "scroll" && !outside(event.target)) return;
          publishPhraseMenu({ open: false, notice: null });
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onMove);
        window.addEventListener("scroll", onMove, true);
        return () => {
          document.removeEventListener("pointerdown", onPointerDown, true);
          document.removeEventListener("keydown", onKeyDown, true);
          window.removeEventListener("resize", onMove);
          window.removeEventListener("scroll", onMove, true);
        };
      }, [menu.open]);

      // Keyboard open: move into the list. Pointer open leaves the caret where
      // the phrase is about to land.
      useEffect(() => {
        if (!menu.open || !menu.focusOnOpen) return;
        const panel = panelRef.current;
        if (panel === null) return;
        const first = panel.querySelector("[data-phrase-row], [data-phrase-manage]");
        if (first instanceof HTMLElement) first.focus();
      }, [menu.open, menu.focusOnOpen]);

      if (!menu.open || menu.rect === null) return null;

      /** Arrow / Home / End within the list, for a keyboard open. */
      const onPanelKeyDown = (event) => {
        const panel = panelRef.current;
        if (panel === null) return;
        const rows = Array.from(panel.querySelectorAll("[data-phrase-row]"));
        if (rows.length === 0) return;
        const active = rows.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (active === -1) {
            rows[event.key === "ArrowDown" ? 0 : rows.length - 1].focus();
            return;
          }
          const step = event.key === "ArrowDown" ? 1 : -1;
          rows[(active + step + rows.length) % rows.length].focus();
        } else if (event.key === "Home") {
          event.preventDefault();
          rows[0].focus();
        } else if (event.key === "End") {
          event.preventDefault();
          rows[rows.length - 1].focus();
        }
      };

      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      // Never wider than the window: a 320px card on a 300px viewport would be
      // pushed off the right edge by the clamp below.
      const width = Math.min(320, Math.max(200, viewportWidth - margin * 2));
      const left = Math.max(margin, Math.min(menu.rect.left, viewportWidth - width - margin));
      const spaceBelow = viewportHeight - menu.rect.bottom - 8;
      // Flip above the chip when the row sits low on screen, and cap the body so
      // the dropdown never runs off the edge it is anchored to.
      const openUp = spaceBelow < 220 && menu.rect.top > spaceBelow;
      const space = Math.max(120, openUp ? menu.rect.top - 16 : spaceBelow);
      const maxHeight = Math.min(360, space);
      const anchor = openUp ? { bottom: viewportHeight - menu.rect.top + 6 } : { top: menu.rect.bottom + 6 };

      const saved = menu.status === "ready" && menu.phrases.length > 0;
      const body =
        menu.status === "loading"
          ? h("div", { "data-phrase-empty": "" }, t("loading"))
          : menu.status === "error"
            ? h(
                "div",
                null,
                h("div", { "data-phrase-note": "" }, errorText(t, menu.error)),
                h(
                  "div",
                  { style: { display: "flex", justifyContent: "flex-end", padding: "0 10px 8px" } },
                  h(
                    "button",
                    {
                      type: "button",
                      "data-phrase-retry": "",
                      title: t("refresh"),
                      onClick: () => {
                        if (typeof menu.refresh === "function") menu.refresh();
                      },
                    },
                    t("refresh"),
                  ),
                ),
              )
            : menu.phrases.length === 0
              ? h("div", { "data-phrase-empty": "" }, t("menuEmpty"))
              : menu.phrases.map((phrase) =>
                  h(
                    "button",
                    {
                      key: phrase.id,
                      type: "button",
                      "data-phrase-row": "",
                      // The full line on hover: the clamp hides the tail of a
                      // long phrase, and two lines sharing a prefix would look
                      // identical.
                      title: phrase.text,
                      // Same reason as the chip: keep the composer's caret.
                      onMouseDown: (event) => event.preventDefault(),
                      onClick: () => {
                        if (typeof menu.insert === "function") menu.insert(phrase.text);
                      },
                    },
                    h("span", { "data-phrase-row-text": "" }, phrase.text),
                  ),
                );

      return h(
        "div",
        {
          ref: panelRef,
          id: MENU_ID,
          "data-phrase-menu": "",
          onKeyDown: onPanelKeyDown,
          style: { left, width, maxHeight, ...anchor },
        },
        h(
          "header",
          null,
          h("span", { style: { fontWeight: 500 } }, t("menuTitle")),
          saved ? h("span", { "data-phrase-count": "" }, `${menu.phrases.length} ${t("menuCount")}`) : null,
          h(
            "button",
            {
              type: "button",
              "data-phrase-manage": "",
              title: t("menuManageTitle"),
              onClick: () => {
                if (typeof menu.manage === "function") menu.manage();
              },
            },
            t("menuManage"),
          ),
        ),
        menu.notice === null ? null : h("div", { "data-phrase-note": "" }, t(menu.notice)),
        h("div", { "data-phrase-body": "" }, body),
        // The hint only makes sense while there is something to click.
        saved ? h("footer", null, t("menuHint")) : null,
      );
    }

    return {
      inject: ["slots", "sidebarRight", "sidebarRightTabs", "locale"],
      apply(ctx) {
        ctxRef.current = ctx;
        ctx.effect(() => ctx.locale.register(NS, DICTS), "dsh-phrase: dictionaries");
        ctx.effect(() => {
          translate = ctx.locale.bind(NS);
          const off = ctx.locale.subscribe(() => {
            for (const listener of localeListeners) listener();
          });
          return () => {
            off();
            translate = (key) => key;
          };
        }, "dsh-phrase: locale binding");
        ctx.effect(() =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => translate("tabTitle"),
            guide: [
              {
                id: "dsh-phrase-panel",
                order: 62,
                title: () => translate("guideTitle"),
                description: () => translate("guideDescription"),
                icon: PhraseGlyph,
              },
            ],
          }),
        );
        ctx.effect(() =>
          ctx.slots.inject("sidebar.right.pane.tab", () =>
            ctx.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID }, PhrasesPanel),
          ),
        );
        // One seat for both pages: the composer tool row is drawn by the same
        // InputBar whether the Session is still blank (hero) or has a history,
        // while `conversation.composer.dock` is only drawn in the latter.
        ctx.effect(() =>
          ctx.slots.inject("conversation.input.left", () =>
            ctx.slots.register({ name: "conversation.input.left", id: "dsh-phrase-chip", order: 0 }, PhraseMenuChip),
          ),
        );
        // Its dropdown lives in the frame-wide overlay, outside every scroll
        // container, so no composer or hero wrapper can clip it.
        ctx.effect(() =>
          ctx.slots.inject("shell.overlay", () =>
            ctx.slots.register({ name: "shell.overlay", id: "dsh-phrase-menu", order: 30 }, PhraseMenuLayer),
          ),
        );
      },
    };
  },
});
