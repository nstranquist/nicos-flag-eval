# Security

This repository is a pure evaluator plus a synthetic catalog. It must not
contain credentials, Access assertions, database URLs, or operator inboxes.

Report a suspected leak to the repository owner through a private channel.
Do not open a public issue with secrets.

Required properties:

- No factory catalog keys.
- No committed Wrangler identity.
- Release checks (when added) must reject secret-shaped values.
