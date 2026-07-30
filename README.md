# Brian app template

A starting point for a **custom Home app** — a small static web app that renders
full-page inside Use Brian and reads the workspace brain through a scoped
bridge.

Click **Use this template** (or
`gh repo create my-app --template use-brian/brian-app-template`), edit
`brian-app.json` and `index.html`, push, then add it in Use Brian under
**Studio → Mini apps → Custom → Add from GitHub**.

## What an app is

Three things, and nothing else:

| File | Required | What it is |
|---|---|---|
| `brian-app.json` | yes | The manifest — name, icon, entry, and the access the app asks for |
| `index.html` | yes | The entry page (any name, as long as the manifest points at it) |
| `assets/**` | no | CSS, JS, images, fonts |

There is **no build step and no server**. Whatever is in the repo is what runs.
Files the app cannot serve — `README.md`, `LICENSE`, CI config, lockfiles — are
ignored, so an ordinary repo works fine.

Limits: 100 files, 5 MB total, 2 MB per file.

## The manifest

```jsonc
{
  "manifestVersion": 1,
  "name": "Pipeline board",           // shown on the Home strip and the consent screen
  "description": "This quarter's deals, by stage",
  "icon": "Users",                    // a lucide icon name
  "entry": "index.html",
  "scopes": {
    "data": "read",                   // "read" | "read_write"
    "identity": false,                // release the viewer's display NAME
    "net": []                         // extra origins the app may fetch from
  }
}
```

**Ask for the least you need.** `scopes` is what a workspace owner or admin
reads before approving your app, and a wider request is a harder approval to
get. Some specifics:

- `data: "read"` reaches no write tool at all. Use it unless the app genuinely
  writes.
- `identity` is only about the viewer's *name*. Your app can always tell
  viewers apart (a stable `userId` is in the bridge token) without it.
- `net` origins must be bare `https://host` — no path, no wildcard. Default to
  none: the bridge already reaches the brain.

**Changing `scopes` takes your app off Home** until an admin approves the new
list. That is deliberate — a push should not be able to widen what your code
can reach. Adding features is free; asking for more access is a conversation.

## Reaching the brain

Your app runs sandboxed at an opaque origin: **no cookies, no localStorage, no
access to the surrounding page**. Everything comes over a `postMessage` bridge.

```html
<script type="module">
  // Ask the host for a bridge token.
  let ctx = null;
  const ready = new Promise((resolve) => {
    window.addEventListener("message", (e) => {
      if (e.data?.type === "ub:token") { ctx = e.data; resolve(ctx); }
    });
  });
  parent.postMessage({ type: "ub:ready" }, "*");
  await ready;

  // Call the brain MCP server with it, exactly like any MCP client.
  const res = await fetch(`${ctx.apiOrigin}/api/brain/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "searchBrain", arguments: { query: "open deals" } },
    }),
  });
</script>
```

The token is short-lived. Post `{ type: "ub:token" }` again to get a fresh one.

**Persisting state.** You have no browser storage, so use the bridge KV:

```js
await fetch(`${ctx.apiOrigin}/api/home-apps/${ctx.appId}/state?scope=user`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
  body: JSON.stringify({ data: { lastTab: "deals" } }),
});
```

`scope=user` is per viewer, `scope=workspace` is shared. 256 KB each.

**Linking into Brian.** `parent.postMessage({ type: "ub:navigate", path: "/w/<workspaceId>/tasks" }, "*")`.
Only in-app paths inside your own workspace are accepted.

## Checking your work

```bash
npx @use-brian/brian-app lint
```

Run it in CI (see `.github/workflows/lint.yml`). It runs the same validator the
importer runs, so green here means the import will not surprise you.
