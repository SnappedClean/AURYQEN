# AURYQEN — public capability workspace

AURYQEN is a general-purpose capability architecture for execution, intelligence, memory, eventing, permissions and interfaces. This public repository contains the **GitHub Pages control surface and a real, bounded browser-side runtime**. It does **not** contain the private Python/SQLite prototype, private data, API credentials, or a publicly deployed backend.

## Use the site

Once GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source: GitHub Actions**, the workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml) publishes the static app. It requires no paid hosting, API key, package install, or build step.

The public runtime actually:
- executes validated directed acyclic capability graphs, with branching and explicit type errors;
- exposes built-in text, JSON, memory and bounded waiting capabilities;
- records run, node, permission, recipe and memory events;
- persists this browser workspace using origin-scoped localStorage;
- enforces local grants for workflow execution, memory operations and recipe publication;
- lets you compose fixed-operation recipes, prove an exact test result, approve and reuse them;
- stores run snapshots and replays old graphs as new executions;
- offers an interactive architecture inspector with real local runtime counts;
- exports local workspace data as JSON.

Try this: open **Workbench**, click **Run graph**, inspect output and the **Event Stream**, disable **workflow.run** under **Permissions** and try again. Then enable **recipe.publish**, go to **Capabilities**, and test/publish the default recipe.

## Limitations and trust boundaries

This is an actual small runtime, **not the finished AURYQEN platform**. The GitHub Pages site is static; it cannot privately hold API keys or execute the separate Python backend. The **AI Models** view correctly reports no connected model. There is no hosted multi-user authentication, external connector execution, remote scheduler, system-wide event broker, cross-device sync, isolated arbitrary code runner, or online persistence. Do not put confidential information into public-site browser storage.

The browser grants demonstrate authorization within the local application; they are **not** security against someone controlling their own browser. A future private service must authenticate and authorize every request and action independently. Never add keys, bearer tokens, private database files or secrets to this public repository.

The existing, separately maintained local Python/SQLite prototype remains private. It contains capabilities, graph execution, Forge, persistent events, local-only HTTP endpoints and its own tests. This repository deliberately does not publish it merely because the website requires public visibility.

## Run locally and test

Open a terminal from a clone and serve this directory via a local static server:

~~~bash
python3 -m http.server 8000
~~~

Open \`http://127.0.0.1:8000\`. ES module imports will not work reliably through a \`file://\` URL.

No dependencies are required for the automated runtime checks:

~~~bash
npm test
npm run check
~~~

Node 20+ is recommended. The Pages workflow runs the tests before deploying.

## Architecture

| Domain | Public implementation |
|---|---|
| Execution engine | Graph validator, topological execution, replay, status and results |
| Capabilities | Built-ins and bounded, approved transformation recipes |
| Memory | Browser-local keyed persistence |
| Permissions | Local operation grants and denial events |
| Event system | Actual bounded append-only client event log |
| Interfaces | Workbench, Forge, history, inspector and architecture view |
| AI models | Interface placeholder, **not connected** |

Private services can later implement the same capabilities behind authenticated APIs without publishing their implementation or credentials.

## Ownership

Copyright © 2026 AURYQEN project. All rights reserved. This public repository is viewable for GitHub Pages; **no open-source license is granted** by default. Public visibility alone is not permission to reuse the source.
