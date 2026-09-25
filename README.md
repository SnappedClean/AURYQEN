# AURYQEN — omnidirectional capability platform

AURYQEN is a general-purpose capability architecture for execution, intelligence, memory, eventing, permissions, and interfaces. **The source for both the public browser workspace and the executable Python/SQLite core is public in this repository.** Credentials, personal data, and live databases must never be committed.

## Two ways to run it

**Public GitHub Pages:** [Open AURYQEN](https://snappedclean.github.io/AURYQEN/). Its browser-side runtime executes bounded graphs, persists browser-local state, records events, and supports tested recipes. GitHub Pages is static: it cannot run a persistent server or host model secrets.

**Local core:** See [core/README.md](core/README.md). Run `cd core && python3 http_server.py`, then open `http://127.0.0.1:8765/`. The local interface can invoke real permitted capabilities, store task/conversation records and events in SQLite, request owner approval for memory writes, and display native chat with an honest unconfigured state if no model is attached. The [MCP adapter](core/docs/MCP.md) shares the exact same Core.submit execution path.

The source is openly visible, but your installed runtime operates on your computer. No server has been deployed by merely publishing this code.

## Cloud execution — no local installation

Open the deployed site and choose **Cloud & ChatGPT**. The site prepares a GitHub Issue containing a bounded public task. After you submit it while signed into your GitHub account, [AURYQEN cloud task](.github/workflows/cloud-task.yml) executes it on a GitHub-hosted runner, then writes its actual result into a comment. Refresh the page to retrieve the result from GitHub. No software runs on your computer beyond the browser; no local server is required for this flow. It is an intentionally small cloud executor, **not** the full persistent Auryqen backend. Only issues authored by the repository owner are executed. Public GitHub issues/comments are not suitable for confidential information.

Available cloud operations: text normalization, uppercase, word counting, slugging, and JSON formatting. No shell commands, project/file access, or AI model are exposed by this public runner. Browser workbench tasks still execute in the browser.

The **ChatGPT handoff** creates a separate public issue. In ChatGPT, ask the connected GitHub-enabled assistant to check the Auryqen inbox (or paste the issue link). Its replies can appear in the public GitHub thread and on the website after refresh. This is a transparent, **manually initiated relay**, not autonomous or embedded ChatGPT. A fully automatic, private two-way conversation requires an authorized hosted model service and authenticated remote MCP integration; a ChatGPT subscription is not a free embeddable model API. Nothing in this project installs local software or starts a paid service automatically.

## Architecture and verification

- `runtime.mjs`, `app.mjs`: dependency-free, browser-only capability workbench.
- `core/core.py`: persistent capability execution, grant and approval checks, tasks, memory, conversations, SQLite events.
- `core/model_adapter.py`: optional OpenAI-compatible model adapter; model tool proposals go through the same core. No provider is configured by default.
- `core/mcp_server.py`: local MCP stdio tools through the same core. Not a remotely hosted ChatGPT connector yet.
- `core/http_server.py` and `core/ui/`: loopback-only web interface for the persistent core.
- `core/tests/`: tests of persistence, grants, owner approval, MCP, model proposal, and shared execution.

Run `npm test` and `npm run check` for the public client. Run `cd core && python3 -m unittest discover -s tests -v` for the core. GitHub Actions verifies both, then publishes **only the static client files** to Pages.

## Security and scope

Do not put secrets into the public Pages app, upload live SQLite database files, or port-forward the loopback core. Local browser permission toggles are not multi-user authentication. Real remote ChatGPT-to-AURYQEN access requires independently secured hosting, HTTPS and authorization; native Auryqen chat requires a separately configured model endpoint. No AI model, paid API or remote MCP service is silently connected.

This is a functional foundation, not the completed general-purpose platform. See [SECURITY.md](SECURITY.md) and [core/README.md](core/README.md).

## Ownership

Copyright © 2026 AURYQEN project. All rights reserved. Public source visibility does not itself grant an open-source license.
