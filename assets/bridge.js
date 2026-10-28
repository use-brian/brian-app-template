/** Legacy read-only Brain profile. Native application clients use the matching SDK. */
export class BridgeError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function exactOrigin(value) {
  try {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== 'https:'
      && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new BridgeError('deployment_not_configured');
  }
}

export function createBrainBridge({ hostOrigin, apiOrigin, workspaceId, homeAppId,
  frame = window, fetch: send = globalThis.fetch, timeoutMs = 5000 }) {
  const host = exactOrigin(hostOrigin);
  const api = exactOrigin(apiOrigin);
  if (![workspaceId, homeAppId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value))
    || frame.parent === frame || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
    throw new BridgeError('deployment_not_configured');
  }
  let disposed = false;
  let sequence = 0;
  const pending = new Set();

  function token(signal) {
    return new Promise((resolve, reject) => {
      if (disposed || signal.aborted) { reject(new BridgeError('cancelled')); return; }
      const cleanup = () => {
        clearTimeout(timer);
        frame.removeEventListener('message', receive);
        signal.removeEventListener('abort', cancel);
      };
      const cancel = () => { cleanup(); reject(new BridgeError('cancelled')); };
      const receive = event => {
        if (event.source !== frame.parent || event.origin !== host) return;
        const data = event.data;
        if (!data || data.type !== 'ub:token' || data.apiOrigin !== api
          || data.appId !== homeAppId || data.workspaceId !== workspaceId) return;
        cleanup();
        if (typeof data.token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token)) {
          reject(new BridgeError('authentication_required'));
        } else resolve(data.token);
      };
      const timer = setTimeout(() => { cleanup(); reject(new BridgeError('bridge_timeout')); }, timeoutMs);
      frame.addEventListener('message', receive);
      signal.addEventListener('abort', cancel, { once: true });
      try { frame.parent.postMessage({ type: 'ub:ready' }, host); }
      catch { cleanup(); reject(new BridgeError('authentication_required')); }
    });
  }

  async function request(method, params, { signal } = {}) {
    if (disposed || signal?.aborted) throw new BridgeError('cancelled');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    pending.add(controller);
    try {
      const bearer = await token(controller.signal);
      if (controller.signal.aborted) throw new BridgeError('cancelled');
      const id = ++sequence;
      const response = await send(`${api}/api/brain/mcp`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      if (!response.ok) throw new BridgeError(response.status === 429 ? 'budget_exhausted'
        : [401, 403, 404].includes(response.status) ? 'access_unavailable' : 'request_failed', response.status);
      const body = await response.json();
      if (controller.signal.aborted) throw new BridgeError('cancelled');
      if (!body || body.jsonrpc !== '2.0' || body.id !== id) throw new BridgeError('invalid_response');
      if (body.error) throw new BridgeError('rpc_error');
      if (!body.result || typeof body.result !== 'object') throw new BridgeError('invalid_response');
      if (body.result.isError) throw new BridgeError('tool_error');
      return body.result;
    } catch (error) {
      if (controller.signal.aborted) throw new BridgeError('cancelled');
      throw error instanceof BridgeError ? error : new BridgeError('request_failed');
    } finally {
      pending.delete(controller);
      signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    listTools: options => request('tools/list', {}, options),
    callTool: (name, args, options) => request('tools/call', { name, arguments: args }, options),
    dispose() {
      disposed = true;
      for (const controller of pending) controller.abort();
    },
  };
}
