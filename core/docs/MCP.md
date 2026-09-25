# Local MCP contract

`python3 mcp_server.py` reads line-delimited JSON-RPC on stdin and responds on stdout; diagnostic messages use stderr. Launch through a trusted local MCP host. Supported protocol version: `2025-06-18`.

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"auryqen-test","version":"0.1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"capability_invoke","arguments":{"capability":"text.normalize","input":{"text":"  HELLO    WORLD "}}}}
```

MCP returns task IDs, status and results produced by the real core. Write requests return `pending_approval` until the local owner resolves them in the local UI. A local stdio adapter cannot directly be added as a remote ChatGPT MCP connector; remote access would require independently secured hosting, HTTPS, authentication, and deployment. Never publish the local server or put secrets in a Pages bundle.