# dsh-phrase — Canned phrases / 口头禅

[中文见下方](#中文)

## English

Save the lines you type often, then insert them into the composer with one click. The right-Sidebar **Phrases** tab lists them; the composer chip opens the same tab.

### Using it

- Type a line in the box at the top of the panel and press **Save**. Up to 100 lines, 300 characters each; empty, oversized and duplicate lines are refused.
- Click the line (or **Insert**) to put it into the current Session's composer at the caret. If the editor refuses (locked, or the draft revision moved), the plugin appends it to the current draft instead.
- **Edit** rewrites a line in place; **Delete** asks once before removing it. **Refresh** re-reads the Host store.
- The UI follows the GUI language: English and 中文 dictionaries are both shipped (Settings → General → Language).

### Storage, routes and safety

The list lives in `<DSH_HOME>/dsh-phrase.json`. Two routes serve it:

| Route | Purpose |
|---|---|
| `GET /api/dsh-phrase` | `{ phrases: [{ id, text, createdAt }] }` |
| `POST /api/dsh-phrase` | `{ action: "add" \| "update" \| "delete", id?, text? }` → the updated list |

A write needs `content-type: application/json` and `x-dsh-phrase-write: 1` (both force a CORS preflight this server never answers), and a foreign `Origin` is refused. Writes are serialized and atomic (temp file + rename). A malformed store returns `store_corrupt` with its path instead of an empty list.

The plugin registers no model tools; phrases stay local until you insert one and send it. The insertion surface is the conversation `inputActions` (`captureInsertion` + `insertText`), so reference chips, quotes and attachments in the draft are preserved.

### Limitations

- The panel only mounts inside a Session; opening it from a session-less page shows a hint instead of inserting.
- One hundred lines and 300 characters per line are fixed bounds, not settings.

## 中文

把经常输入的那几句话存起来，在右侧「口头禅」面板里点一下，就插入当前会话的输入框。

### 用法

- 面板顶部输入一句话，点「保存」。最多 100 条、每条 300 字；空内容、超长和重复内容会被拒绝。
- 点句子本身或「插入」按钮，插入到输入框光标处；编辑器锁定或草稿版本变化时，退化为追加到当前草稿末尾。
- 「编辑」原地改文字；「删除」需要再点一次确认；「刷新」重新读取 Host 上的列表。
- 界面跟随 DSH 的语言设置，内置英文和中文两套文案（设置 → 通用 → 语言）。

### 存储、路由与安全

列表存放在 `<DSH_HOME>/dsh-phrase.json`，由两条路由提供读写：

| 路由 | 作用 |
|---|---|
| `GET /api/dsh-phrase` | `{ phrases: [{ id, text, createdAt }] }` |
| `POST /api/dsh-phrase` | `{ action: "add" \| "update" \| "delete", id?, text? }` → 更新后的列表 |

写请求要求 `content-type: application/json` 与 `x-dsh-phrase-write: 1` 头（都会触发 CORS 预检），并拒绝 Origin 与 Host 不一致的请求；写入串行且原子（临时文件 + rename）。文件损坏时返回 `store_corrupt` 并给出路径，不会静默当成空列表。

插件不注册任何模型工具，内容只在你插入并发送后才会进入对话。插入使用会话的 `inputActions`（`captureInsertion` + `insertText`），草稿里的引用、引用块和附件都会保留。

### 限制

- 面板只在会话内可用；在没有会话的页面打开时只提示、不插入。
- 100 条、每条 300 字是固定上限，不提供设置项。
