# dsh-phrase

Canned phrases for DeepSeek Harness — save the lines you type often and insert them into the composer with one click.

[中文说明](#中文说明)

## What it does

- A right-Sidebar **Phrases** tab (also reachable from the composer chip) lists your saved lines.
- Click a line — or its **Insert** button — and it lands in the current Session's composer at the caret. Edits you were already typing stay untouched.
- Add, edit and delete in the same panel. Delete asks once before removing.
- The list lives on the Host in `<DSH_HOME>/dsh-phrase.json`, so it survives DSH restarts and is independent of the browser origin. You can edit that file by hand.
- The UI is bilingual: English and 中文 follow the GUI language (Settings → General → Language).

## Install

```bash
dsh plugin add dsh-phrase
```

Or open **Plugins → Add plugin** and enter `dsh-phrase`. From a checkout, pass the directory path instead. Requires DSH `>= 0.2.2-rc.1`. After installing, refresh the page (or restart DSH) so the browser half loads.

## Usage

1. Open the **Phrases** tab from the right Sidebar, or click the **Phrases** chip under the composer.
2. Type a line you say often, then **Save**. Up to 100 lines, 300 characters each; duplicates are refused.
3. Click the saved line to insert it at the caret, then press Enter when you are ready to send.
4. **Edit** changes the text in place; **Delete** asks for confirmation.

## Storage and API

The Host half exposes one route over `<DSH_HOME>/dsh-phrase.json`:

| Route | Purpose |
|---|---|
| `GET /api/dsh-phrase` | `{ phrases: [{ id, text, createdAt }] }` |
| `POST /api/dsh-phrase` | `{ action: "add" \| "update" \| "delete", id?, text? }` → the updated list |

Writes require a JSON content type and an `x-dsh-phrase-write: 1` header (both force a CORS preflight), and a foreign `Origin` is refused. File writes are serialized and atomic (temp file + rename). A corrupt store is reported with its path instead of being treated as empty.

## Development

```bash
node --test test/*.test.js
```

Layout: `index.js` (Host routes), `src/store.js` (pure shape and validation), `client.js` (the panel, chip and insertion), `cordis.patch.yml` (the bundle row), `locale/` (Plugin Manager metadata), `docs/DETAIL.md` (the detail page).

## License

MIT © wayblink

---

## 中文说明

**dsh-phrase** 是 DeepSeek Harness 的口头禅插件：把常说的话存起来，在右侧「口头禅」面板里点一下，就插入当前会话的输入框。

- 输入框光标处插入，不会破坏你正在打的字；编辑器锁定或草稿版本变化时退化为追加到草稿末尾。
- 面板里可以新增、编辑、删除；删除需要再点一次确认。最多 100 条，每条 300 字，重复内容会被拒绝。
- 数据存放在 `<DSH_HOME>/dsh-phrase.json`（默认 `~/.dsh/dsh-phrase.json`），重启 DSH 不丢，也可以直接编辑该文件。
- 中英文界面跟随 DSH 的语言设置（设置 → 通用 → 语言）。

安装：`dsh plugin add dsh-phrase`，或在「插件 → 添加插件」里输入 `dsh-phrase`；也可以直接填本目录的绝对路径。需要 DSH `>= 0.2.2-rc.1`，装完刷新页面（或重启 DSH）。

用法：从右侧 Sidebar 打开「口头禅」，或点输入框下方的「口头禅」chip；顶部输入一句 → 保存；点句子或「插入」写进输入框；「编辑」改文字，「删除」二次确认。

测试：`node --test test/*.test.js`。
