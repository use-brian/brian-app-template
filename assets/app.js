/**
 * Minimal Brian app.
 *
 * The shape to copy: handshake first, then call the brain MCP server with the
 * token you were handed. There is no other way out of the sandbox — no
 * cookies, no storage, no access to the page around you.
 */

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

/** Resolve once the host hands over a bridge token. */
function connect() {
  return new Promise((resolve) => {
    window.addEventListener("message", (event) => {
      if (event.data?.type === "ub:token" && event.data.token) resolve(event.data);
    });
    parent.postMessage({ type: "ub:ready" }, "*");
  });
}

/** Call one brain MCP tool. */
async function callTool(ctx, name, args) {
  const res = await fetch(`${ctx.apiOrigin}/api/brain/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status}`);
  return res.json();
}

async function main() {
  const ctx = await connect();
  statusEl.textContent = "Searching the brain…";
  try {
    const result = await callTool(ctx, "searchBrain", { query: "recent" });
    const text = result?.result?.content?.[0]?.text ?? "";
    statusEl.textContent = text ? "" : "Nothing came back.";
    for (const line of text.split("\n").filter(Boolean).slice(0, 20)) {
      const li = document.createElement("li");
      li.textContent = line;
      resultsEl.append(li);
    }
  } catch (err) {
    // Fail visibly. A blank app is indistinguishable from a broken one.
    statusEl.textContent = String(err.message ?? err);
  }
}

void main();
