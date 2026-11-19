# 口头禅（Canned phrases）

把经常输入的那几句话存起来，在右侧 Sidebar 的「口头禅」面板里点一下，就插入当前会话的输入框。

## 用起来

- 输入框下方有一个「口头禅」小按钮，点它打开右侧面板；也可以从右侧 Sidebar 的引导页进入。
- 面板顶部输入一句话，点「保存」。列表里点句子本身或「插入」，会插入到输入框光标处；「编辑」改文字，「删除」需要再点一次确认。
- 插入走的是 DSH 的 composer `inputActions`：优先 `captureInsertion()` + `insertText()` 保留光标与其他内容；如果编辑器已锁或版本变化，退化为把句子追加到当前草稿末尾。

## 数据存在哪

`<DSH_HOME>/phrases.json`（默认 `~/.dsh/phrases.json`）：

```json
{
  "version": 1,
  "phrases": [
    { "id": "p_...", "text": "收到，我马上看", "createdAt": "2026-11-19T03:00:00.000Z" }
  ]
}
```

文件是唯一数据源，重启 DSH、换浏览器 origin 都不会丢；也可以直接编辑文件（面板刷新即可见）。

## 路由与安全

| 路由 | 作用 |
|---|---|
| `GET /api/phrases` | 返回 `{ phrases }`；文件不存在时返回空列表 |
| `POST /api/phrases` | `{ action: "add" \\| "update" \\| "delete", id?, text? }`，返回更新后的列表 |

写请求要求 `content-type: application/json` 与 `x-phrases-write: 1` 头（两者都会触发 CORS 预检，跨源页面发不出去），并拒绝 Origin 与 Host 不一致的请求；写入按文件串行、先写临时文件再 rename。文件损坏时返回 500 并给出路径，不会静默当成空列表。

## 限制

- 最多 100 条，每条最多 300 字；重复内容会被拒绝。
- 面板只在会话内可用（插入依赖会话的 composer 动作）；从没有会话的引导页打开时，「插入」会提示先进入会话。
- 这是纯本地功能，不注册任何模型工具，也不会把内容发给模型，直到你把它插入输入框并发送。

## 验收

`node --test test/*.test.js` 覆盖：store 的增删改/校验/上限、Host 路由的读写与守卫、浏览器端的注册与点击插入。
