// Every nested module needs the same bundle capability URL. A relative import
// does not inherit the entry's query string, and its Referer can lose that token.
const bundleToken = new URL(import.meta.url).searchParams.get('t');
const [{ createBrainBridge }, { deployment }] = await Promise.all(
  ['./bridge.js', './config.js'].map(path => {
    const url = new URL(path, import.meta.url);
    if (bundleToken) url.searchParams.set('t', bundleToken);
    return import(url.href);
  }),
);

const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const form = document.getElementById('search');
const queryEl = document.getElementById('query');
const submit = document.getElementById('submit');
const messages = {
  deployment_not_configured: 'Configure the Brian origins and workspace in assets/config.js, then open this app inside Brian.',
  authentication_required: 'Access has expired or is unavailable. Reopen the app and check its consent.',
  access_unavailable: 'Access is unavailable. Check your current permissions and app consent.',
  bridge_timeout: 'Brian did not provide access in time. Reopen the app to try again.',
  budget_exhausted: 'The daily app budget is exhausted. Try again after it resets.',
  search_unavailable: 'Brain search is unavailable for this app and viewer.',
  request_failed: 'The request failed. Search again when the connection is available.',
  invalid_response: 'Brian returned an unsupported response.',
  rpc_error: 'Brian could not complete the request.',
  tool_error: 'Brain search could not complete. Check access and try again.',
};

let bridge;
let active;

async function search() {
  active?.abort();
  const run = new AbortController();
  active = run;
  resultsEl.replaceChildren();
  statusEl.textContent = 'Searching the brain...';
  submit.disabled = true;
  try {
    const options = { signal: run.signal };
    const catalog = await bridge.listTools(options);
    if (!catalog.tools?.some(tool => tool.name === 'searchBrain')) {
      throw new Error('search_unavailable');
    }
    const result = await bridge.callTool('searchBrain', { query: queryEl.value.trim() || 'recent' }, options);
    if (active !== run || run.signal.aborted) return;
    const text = (result.content ?? []).filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text).join('\n');
    statusEl.textContent = text ? '' : 'No results were returned.';
    for (const line of text.split('\n').filter(Boolean).slice(0, 20)) {
      const li = document.createElement('li');
      li.textContent = line;
      resultsEl.append(li);
    }
  } catch (error) {
    if (active !== run || run.signal.aborted) return;
    resultsEl.replaceChildren();
    statusEl.textContent = messages[error.message] ?? messages.request_failed;
  } finally {
    if (active === run) submit.disabled = false;
  }
}

try {
  const bundleId = location.pathname.match(/^\/api\/home-apps\/([A-Za-z0-9_-]+)\/bundle\//)?.[1];
  bridge = createBrainBridge({ ...deployment, homeAppId: deployment.homeAppId || bundleId });
  statusEl.textContent = 'Search the workspace information you can currently access.';
  form.addEventListener('submit', event => { event.preventDefault(); void search(); });
} catch (error) {
  submit.disabled = true;
  statusEl.textContent = messages[error.message] ?? messages.request_failed;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  active?.abort();
  resultsEl.replaceChildren();
  if (bridge) statusEl.textContent = 'Paused. Search again when you return.';
});
window.addEventListener('pagehide', () => {
  active?.abort();
  resultsEl.replaceChildren();
  bridge?.dispose();
});
