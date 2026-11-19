# @wayblink/phrases-dsh

DeepSeek Harness bundle for canned phrases: save the lines you type often, click one in the right-Sidebar **口头禅** panel, and it is inserted into the composer.

- Host half: `index.js` + `src/store.js` — `/api/phrases` over `<DSH_HOME>/phrases.json`, validated and serialized writes.
- Browser half: `client.js` — a right-Sidebar tab, a composer-dock chip, and click-to-insert through the conversation `inputActions`.

## Install

Through DSH's plugin manager: **Plugins → Add plugin** → the absolute path of this directory, or `dsh plugin add /path/to/phrases`.

Requires DSH `>=0.2.2-rc.1`.

## Test

```bash
node --test test/*.test.js
```

## Layout

| Path | Role |
|---|---|
| `index.js` | Host plugin: the two `/api/phrases` routes |
| `src/store.js` | Pure store shape and mutations (source of every validation) |
| `client.js` | Browser module: panel, chip, insertion |
| `cordis.patch.yml` | Inserts the `phrases` row |
| `locale/` | Plugin-manager title and description |
| `docs/DETAIL.md` | The plugin's detail page |
