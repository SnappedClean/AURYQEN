# AURYQEN public workspace security

This site runs entirely in the browser and stores workspace data in localStorage. Do not enter API keys, passwords, private files, or sensitive personal/business records. Local authorization toggles are educational application policy, not protection against the person controlling the browser. No remote AI provider, service, or backend is connected in the public build.

GitHub Pages cannot securely store service secrets. Any future private backend must authenticate requests, enforce policy on the server, restrict CORS and origins as appropriate, validate inputs, and independently audit external effects. Never enable anonymous invocation of private capabilities.

Only static public files are uploaded by the Pages workflow. Do not commit local SQLite databases, private Python server code, `.env` files, tokens, or private user data to this repository.

Report suspected security problems privately to the repository owner rather than publishing exploit details in an issue.
