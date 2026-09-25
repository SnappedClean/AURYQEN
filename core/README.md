# AURYQEN local core (public source)

Real local execution engine and conversation service. This source is public; **runtime data, credentials and personal content are not**. This service intentionally listens on loopback only. Do not port-forward it or expose it publicly.

## Start

From this directory, use Python 3.10+:

```sh
python3 http_server.py
```

Then open `http://127.0.0.1:8765/`. The HTTP interface and stdio MCP tool adapter call the **same** `Core.submit()` entry point. The core stores tasks, approvals, grants, events, conversations and memory in SQLite (`~/.auryqen/core.db`, configurable via `AURYQEN_DB`). Configure `AURYQEN_ALLOWED_ROOT` to a directory you explicitly want Auryqen to inspect. Defaults to this code directory. Directory inspections never leave it, including symlink targets.

Try a real local task: choose `directory.inspect`, enter `{"path":"."}`, and select Execute. View the corresponding task and event records. Choose `memory.write` with `{"key":"project","value":"Auryqen"}` and approve the pending request under Approvals. Restart and confirm its value is persisted.

## Native chat

Conversation records are stored even without a model. **No automatic ChatGPT subscription integration exists.** To enable genuine AI replies, configure an authorized OpenAI-compatible endpoint via `AURYQEN_MODEL_URL` and `AURYQEN_MODEL_ID` and optionally `AURYQEN_MODEL_API_KEY` in your process environment. Nothing here starts or charges a provider automatically. Its proposed tool calls must enter the same audited core as UI and MCP; sensitive writes stay pending until the owner approves. The current adapter supports a bounded tool loop and text replies; provider compatibility varies.

## MCP (local stdio)

Run `python3 mcp_server.py` through a trusted local MCP client with an explicitly configured command and environment. It implements MCP JSON-RPC `initialize`, `tools/list`, and `tools/call`. Example newline-delimited requests are in `docs/MCP.md`. It is **not** yet a remotely hosted OAuth/HTTPS MCP service for ChatGPT. Do not claim a ChatGPT connection until that separate end-to-end integration is verified.

## Tests

```sh
python3 -m unittest discover -s tests -v
python3 -m py_compile core.py http_server.py mcp_server.py model_adapter.py
```

Zero third-party Python dependencies. Local state and credentials must never be committed.