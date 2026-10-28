# Brian app template

A static Brian custom app frontend, with an optional trusted server module
skeleton for an application that owns business records and operations.

Brian applications reuse canonical data, current scoped permissions and typed
queries/transactional commands. Their screens can run inside Brian or as separate
frontends. A small iframe is one presentation option for an application.

| Path | Purpose |
|---|---|
| `brian-app.json`, `index.html`, `assets/` | Importable static frontend; the default is a read-only workspace-brain search |
| `server/module.mts` | Optional native application registration skeleton; integrate and deploy in the trusted Brian host |
| `.github/tests/` | Local bridge behavior tests, excluded from the static bundle |

The selected application-records foundation was verified locally on 2026-10-26.
This template does not certify a real application's adapter, data migration,
deployment or live qualification. Use the capabilities actually admitted by your
target Brian deployment. Unavailable Home application bindings, OAuth or source
profiles cannot be enabled by adding fields to a manifest.

## Start with a static workspace view

1. Click **Use this template** or run
   `gh repo create my-app --template use-brian/brian-app-template`.
2. Edit the name/description in `brian-app.json` and `index.html`. Configure
   `assets/config.js` with your exact Brian host origin, API origin and workspace
   ID. These are public deployment identifiers, never credentials.
3. Import the repository in **Studio > Mini apps > Custom > Add from GitHub**.
   The installed Home app ID is read from its bundle URL. Set `homeAppId` in
   config explicitly if your deployment serves bundles at a different path.
4. Have an owner/admin approve the stored manifest's scopes and add the app to
   the App store selection. Home itself opens Chat. Menu order and personal pins
   are navigation preferences, not permission grants.
5. Open the app. It discovers the viewer's current tools before calling
   `searchBrain`; a missing search capability is shown explicitly.

The iframe has no cookies, browser storage or access to the surrounding page.
The example accepts bridge messages only from its exact parent at the configured
host origin, matching API/workspace/Home app IDs. It requests a current token for
each call, keeps it in memory, omits cookies and refuses redirects. Reads are
cancelled and results cleared when the page is hidden. Search again after return;
no protected response or write queue is persisted.

The entry/bootstrap carries the signed bundle capability to CSS and nested ES
module URLs. Keep this propagation, or emit a single browser bundle: ordinary
relative imports do not inherit the entry query string. This capability serves
bundle bytes only and must never be used as the Brain API bearer.

Static import runs no install, build or server. If using a framework or the
application SDK, build locally and import the static output. GitHub import filters
repository furniture and non-serveable source; a ZIP or assistant-authored bundle
must contain only the manifest, entry HTML and serveable assets. Do not package
server source, tests, credentials or dependency trees. Limits: 100 files, 5 MB
total, 2 MB per file.

## Manifest permissions

The default `scopes.data: "read"` is the existing Brain bridge profile. Use
`read_write` only for a requested write workflow. `identity` releases the viewer's
display name; it does not establish authority. `net` adds exact bare HTTPS origins
to the sandbox's connection policy, without paths or wildcards. Keep it empty
when Brian's bridge is sufficient.

Unknown top-level fields are metadata; unknown keys inside `scopes` reject.
Widening the requested scopes requires owner/admin reconsent and makes the app
unrenderable until that happens. Hiding an app from the menu does not revoke it.

For an already deployed and admitted native module, replace `scopes` with its
exact requirements, for example:

```json
{
  "data": "none",
  "application": {
    "moduleKey": "example_module",
    "resources": [{
      "typeKey": "example_record",
      "actions": ["query", "command:change"],
      "readFields": ["title"],
      "writeFields": ["title"]
    }]
  }
}
```

These keys match the optional server skeleton. Replace them with the real
catalog. `data: "none"` withholds the legacy Brain surface and requires this
application-only profile without legacy store/agent powers. The manifest is an
additional ceiling, not a grant. Home application access also needs a linked
registration, current exact viewer grant and qualified binding. An old bridge
token cannot acquire those rights. Changing this manifest alone leaves the
default Brain search unavailable; replace `assets/app.js` with the application
client for that workflow.

## Add a Brian-native business application

Use `server/module.mts` as a typed registration boundary for an app-owned package.
It deliberately has no default storage or authorization implementation. Supply
the actual domain services, typed input schemas, current row/field/action checks
and result admission. Deploy it through the host's existing
`defineApplicationModules`/`ApplicationPlatformService` composition. Importing
this repository's static bundle does not deploy the module.

- Preserve native relational tables, constraints and business rules. Existing
  CRM and Task identities/writers stay canonical; reference them rather than
  creating an application copy. No generic record conversion is required.
- Use the dispatcher-provided transaction for the business mutation, resource
  versions, receipt, audit and committed event. Keep remote effects and heavy
  orchestration outside that transaction. Human UI, Brian/MCP, imports and jobs
  use the same semantic commands.
- Keep the stable module key, default state and blocker when enriching an existing
  lifecycle declaration. Registration does not enable a module or grant records.
- `new_work` is the default command class. A separately reviewed
  `existing_recovery` command can finish existing work while draining/disabled
  only under current authority and its actual business transition rules.

Use matching deployment-supplied `@use-brian/brian-app` packages. The browser
export is `@use-brian/brian-app/application`; `./module` and `./connector` are
server-only. Local kit tests do not prove that matching registry packages have
been published. Do not copy server imports or secrets into `assets/`.

```js
// Build this browser code locally with the matching SDK, then import its output.
import { createApplicationClient, createHomeApplicationTransport }
  from '@use-brian/brian-app/application';

const bridge = createHomeApplicationTransport({
  appId: applicationClientId, // application registration, distinct from Home app ID
  homeAppId, workspaceId, apiOrigin, hostOrigin, window,
});
const app = createApplicationClient({
  appId: applicationClientId, transport: bridge.transport,
});
const catalog = await app.catalog({ signal });
// Use an advertised registeredQuery(key, input) or command(key, envelope).
// Dispose the bridge on teardown. Keep returned evidence and receipts intact.
```

Commands carry an original `idempotencyKey`, exact JSON `input` and opaque
`expectedVersion` when required. Preserve the envelope for
`app.reconcile(commandKey, originalEnvelope)`. A timeout/disconnect after dispatch
can mean committed work: show uncertainty and reconcile before another attempt.
Do not automatically retry writes or replay them after login. Query page envelopes,
field/absence evidence and exact decimal strings must remain intact.

Standalone frontends use registered app-bound OAuth/PKCE and in-memory tokens.
Sign-in alone grants no records. Service credentials stay on a server; delegated
calls additionally require independently authenticated app-bound user authority.
Never accept claimed user IDs as authority or use native/owner session tokens as
application credentials.

## Connect an independently hosted system

If the application keeps its own backend, connect it as an independent source.
Its server verifies authenticated transport and request-bound Brian actor
assertions, maps both human and assistant identities, and checks its own current
record/field/action permissions. Identity verification does not authorize an
operation. Retained outputs need an admitted governed/released/ephemeral path;
they cannot become unrestricted shared memories. Source effects retain their own
idempotency receipts and reconciliation.

## App state and recovery

Bridge KV at `/api/home-apps/:homeAppId/state?scope=user|workspace` is for small
preferences (256 KB per scope). Do not use it as a business database or a shared
cache of viewer-specific protected results. Navigate with `ub:navigate` to a
validated path inside the same workspace.

Show denied/expired access, missing operations and budget exhaustion visibly.
A 429 means the app's daily budget is exhausted: wait for user action/reset. Bridge calls
consume the app's daily budget, so avoid background polling/retry loops. Protected
data caching and offline writes need a separately admitted retention contract.

## Check the result

```sh
node --test .github/tests/*.test.mjs
```

Run the matching bundle validator from an installed Brian source checkout:

```sh
pnpm --filter @use-brian/brian-app build
node packages/brian-app/bin/brian-app.js lint /absolute/path/to/my-app
```

Run those two commands from the OSS `use-brian` root. CI also runs the published
validator against this default legacy Brain manifest. When adopting application
scopes, use the matching deployment validator; an older published version may
not understand them. Lint proves packaging, not module deployment or permissions.
Verify actual allowed/denied operations, version conflicts, duplicate commands,
revocation, lifecycle recovery and uncertain outcomes for your application.

Current architectural direction: `brian-platform/docs/product-roadmap/native-extensible-backend-replanning.md`
(D05/D06) and `docs/plans/application-records-foundation-v1.md`. Detailed retained
contracts live in `docs/architecture/features/application-platform.md`,
`application-platform-sdk.md` and `home-apps.md`. Older scaffold/reference-app
campaigns do not expand this template into a new platform or certify rollout.
