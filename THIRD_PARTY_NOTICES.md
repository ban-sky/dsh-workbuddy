# Third-party notices

This project contains original code released under the MIT License (see
[LICENSE](./LICENSE)). It interoperates with, and its wire behavior was
cross-checked against, the following public resources. No source code was
copied from them; the model roster is factual metadata, and the protocol notes
were used to build an independent implementation.

## WorkBuddy / CodeBuddy

- WorkBuddy product documentation — model capabilities, custom-model behavior,
  and account/credit semantics: <https://www.workbuddy.cn/docs/workbuddy/>
- Tencent Cloud WorkBuddy Enterprise documentation — model configuration and
  desktop auth layout: <https://cloud.tencent.com/document/product/1831>

## Community protocol notes (MIT)

- `corrinehu/dsh-workbuddy-connect` — DSH plugin that first documented the
  desktop auth-file layout, the `/v2/chat/completions` gateway, the
  `X-User-Id` / `X-Enterprise-Id` / `X-Domain` headers, and the refresh
  endpoint: <https://github.com/corrinehu/dsh-workbuddy-connect>
- `HanHan666666/codebuddy2openai` — a minimal local OpenAI-compatible
  converter for the same gateway: <https://github.com/HanHan666666/codebuddy2openai>
- `syh0119/workbuddy2api` — community OpenAI-compatible gateway for WorkBuddy:
  <https://github.com/syh0119/workbuddy2api>

## Runtime dependencies

- `@earendil-works/pi-ai` (MIT) — provider protocol implementations consumed
  through `@deepseek-ai/dsh-llm-pi-ai`.
- `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-llm-pi-ai`,
  `@deepseek-ai/cordis`, `@deepseek-ai/schemastery` (MIT) — DeepSeek Harness
  packages this plugin plugs into.

WorkBuddy and CodeBuddy are trademarks of Tencent. This project is an
independent integration and is not affiliated with or endorsed by Tencent.
