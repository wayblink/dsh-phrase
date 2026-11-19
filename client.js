/**
 * Browser half of the phrases bundle.
 *
 * One surface: a right-Sidebar "口头禅" tab. Clicking a row inserts that
 * phrase into the current Session's composer at the caret; the same panel adds,
 * edits and deletes the stored list. The composer chip is only a door to it.
 *
 * The list itself lives on the Host (`<DSH_HOME>/phrases.json`); this module
 * reads and mutates it through `/api/phrases`, so the data survives restarts and
 * does not depend on a browser origin.
 */

window.__ModuleLoader__.load({
  id: "@wayblink/phrases-dsh",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;
    /** Latest client context, for the chip's click handler. */
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
      border2: "var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 16%, transparent))",
      accent: "var(--dsw-alias-brand-primary, color-mix(in srgb, currentColor 70%, transparent))",
      warn: "var(--dsw-alias-state-warn-primary, color-mix(in srgb, currentColor 55%, transparent))",
      danger: "var(--dsw-alias-state-error-primary, color-mix(in srgb, currentColor 80%, transparent))",
    };

    const TAB_KIND = "phrases";
    const TAB_ID = "@wayblink/phrases-dsh/panel";
    const HUE = "#0891b2";

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

    async function readPhrases() {
      const tried = [];
      for (const url of routeUrls("api/phrases")) {
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
          if (!response.ok) {
            return { ok: false, error: body && body.error ? String(body.error) : `读取失败 (${response.status})` };
          }
          return { ok: true, body };
        } catch {
          // Try the next candidate.
        }
      }
      return { ok: false, error: `没有可用的接口: ${tried.join(", ")}` };
    }

    async function writePhrase(action) {
      const candidates = routeUrls("api/phrases");
      const url = candidates.find((candidate) => candidate.startsWith(`${location.origin}/`)) ?? candidates[0];
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            // Custom header + JSON body: both make a cross-origin page need a
            // preflight this server never answers.
            "x-phrases-write": "1",
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
        if (!response.ok) {
          return { ok: false, error: body && body.error ? String(body.error) : `保存失败 (${response.status})` };
        }
        return { ok: true, body };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    function usePhrases() {
      const [state, setState] = useState({ status: "loading", phrases: [], error: "" });
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
          setState({ status: "ready", phrases, error: "" });
        });
        return () => {
          alive = false;
        };
      }, [nonce]);
      return { ...state, refresh, setPhrases: (phrases) => setState({ status: "ready", phrases, error: "" }) };
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
      const { phrase, editing, confirming, busy, onInsert, onStartEdit, onEditText, onSaveEdit, onCancel, onStartDelete, onConfirmDelete } =
        props;
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
            button("保存", "保存修改", onSaveEdit, { disabled: busy, tone: "accent" }),
            button("取消", "放弃修改", onCancel),
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
            title: "点击插入到输入框",
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
              button("删除", "确认删除", onConfirmDelete, { disabled: busy, tone: "danger" }),
              button("取消", "保留", onCancel),
            )
          : h(
              "div",
              { style: { display: "flex", gap: 4, flex: "0 0 auto" } },
              button("插入", "插入到输入框", () => onInsert(phrase.text), { tone: "accent" }),
              button("编辑", "修改这句", () => onStartEdit(phrase)),
              button("删除", "删除这句", () => onStartDelete(phrase.id)),
            ),
      );
    }

    function PhrasesPanel(props = {}) {
      const { status, phrases, error, refresh, setPhrases } = usePhrases();
      const [addText, setAddText] = useState("");
      const [editing, setEditing] = useState(null);
      const [confirming, setConfirming] = useState("");
      const [notice, setNotice] = useState("");
      const [busy, setBusy] = useState(false);
      // The host's selector hook over the composer draft. Called unconditionally:
      // the panel only mounts inside a Session, where the hook is present, but a
      // conditional hook call would still be a rules-of-hooks violation.
      const useDraft = typeof props.useInput === "function" ? props.useInput : () => "";
      const draft = useDraft((state) => (state && typeof state.draft === "string" ? state.draft : ""));
      const actions = props.inputActions;

      const insert = useCallback(
        (text) => {
          if (actions === undefined) {
            setNotice("在会话里打开这个面板才能插入");
            return;
          }
          try {
            const span = actions.captureInsertion();
            if (actions.insertText(text, span)) {
              setNotice("已插入到输入框");
              return;
            }
          } catch {
            // Fall through to the whole-draft fallback.
          }
          try {
            actions.setDraft(`${draft}${draft === "" ? "" : "\n"}${text}`);
            setNotice("已追加到输入框");
          } catch {
            setNotice("插入失败，请把光标放到输入框后重试");
          }
        },
        [actions, draft],
      );

      const save = useCallback(
        async (action) => {
          if (busy) return;
          setBusy(true);
          setNotice("");
          const result = await writePhrase(action);
          setBusy(false);
          if (!result.ok) {
            setNotice(result.error);
            return;
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
          h("span", { style: { fontWeight: 650, fontSize: 14, lineHeight: 1.2, letterSpacing: "-0.01em" } }, "口头禅"),
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
          button("刷新", "重新读取", refresh),
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
            placeholder: "新增一句常说的话，比如：收到，我马上看。",
            "aria-label": "新增口头禅",
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
            { style: { display: "flex", alignItems: "center", gap: 6 } },
            button("保存", "保存这条口头禅", add, { disabled: busy || addText.trim() === "", tone: "accent" }),
            h(
              "span",
              { style: { fontWeight: 400, fontSize: 10.5, lineHeight: 1.4, color: T.caption } },
              "点句子插入输入框；最多 100 条，每条 300 字",
            ),
          ),
        ),
        notice === ""
          ? null
          : h(
              "div",
              {
                style: {
                  padding: "7px 14px",
                  fontWeight: 500,
                  fontSize: 11.5,
                  lineHeight: 1.4,
                  color: notice === "已插入到输入框" || notice === "已追加到输入框" ? HUE : T.warn,
                  borderBottom: `1px solid ${T.border1}`,
                  flex: "0 0 auto",
                },
              },
              notice,
            ),
        status === "loading"
          ? h("div", { style: { padding: "18px 14px", fontWeight: 400, fontSize: 12, lineHeight: 1.5, color: T.text3 } }, "读取中…")
          : null,
        status === "error"
          ? h("div", { style: { padding: "16px 14px", fontWeight: 400, fontSize: 12, lineHeight: 1.5, color: T.warn } }, error)
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
                    "还没有保存的口头禅。上面输入一句，保存后点它就能插入。",
                  )
                : phrases.map((phrase) =>
                    h(PhraseRow, {
                      key: phrase.id,
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

    function PhrasesChip() {
      const open = useCallback(() => {
        try {
          ctxRef.current.sidebarRight.openTab(TAB_KIND);
        } catch (error) {
          console.warn("[phrases] could not open the phrases panel", error);
        }
      }, []);
      return h(
        "button",
        {
          type: "button",
          onClick: open,
          title: "打开口头禅面板",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            margin: "0 0 6px 2px",
            padding: "3px 8px",
            borderRadius: 999,
            border: `1px solid ${T.border1}`,
            background: T.layer1,
            color: "inherit",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.2,
            cursor: "pointer",
          },
        },
        h("span", { style: { color: T.text2 } }, "口头禅"),
      );
    }

    return {
      inject: ["slots", "sidebarRight", "sidebarRightTabs"],
      apply(ctx) {
        ctxRef.current = ctx;
        ctx.effect(() =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => "口头禅",
            guide: [
              {
                id: "phrases-panel",
                order: 62,
                title: () => "口头禅",
                description: () => "常说的话，点击插入输入框",
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
        ctx.effect(() =>
          ctx.slots.inject("conversation.composer.dock", () =>
            ctx.slots.register({ name: "conversation.composer.dock", id: "phrases-chip", order: 22 }, PhrasesChip),
          ),
        );
      },
    };
  },
});
