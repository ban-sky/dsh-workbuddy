# Changelog

## 0.1.0 — 2026-11-09

First release.

- Adds a `workbuddy` model provider to DSH: 20 WorkBuddy models (GLM-5.3 family,
  Kimi, MiniMax, DeepSeek-V4, Hy, Step, Space-Bunny) appear in the model picker.
- Reuses a signed-in WorkBuddy / CodeBuddy desktop app: discovers the auth
  document on macOS, Windows, and Linux, reads the bearer token, and refreshes
  an expiring token through `/v2/plugin/auth/token/refresh` (single-flight).
- Runs a loopback OpenAI-compatible shim (127.0.0.1, ephemeral port, random
  per-boot key) that forwards `/v1/chat/completions` and `/v1/models` to the
  WorkBuddy gateway with the account headers the gateway expects.
- Supports manual-token mode (`token` config / `WORKBUDDY_TOKEN`) when the
  desktop file is encrypted or the app is on another machine.
- Maps WorkBuddy errors (401, 402, 429, 404, 5xx) to OpenAI-shaped errors and
  retries once after a token refresh.
- 27 tests: credential discovery/parsing/refresh, shim protocol, PiAiAdapter
  end-to-end (text and native tool calls), and plugin activation.
- GitHub Actions CI (Node 22/24) and a tag-driven release workflow that builds
  the installable tarball on GitHub.
