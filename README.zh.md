# DSH WorkBuddy

把已登录的 **WorkBuddy / CodeBuddy 桌面端**里的模型接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。装好插件、重启 DSH，模型选择器里就会出现 **WorkBuddy** 分组；选一个模型即可在 DSH 里对话、跑工具、发图片，复用桌面端账号与积分。

[English](./README.md) | 中文

## 它是怎么工作的

```text
DSH agent loop
   │  ctx.llm（统一模型接口）
   ▼
@deepseek-ai/dsh-llm-pi-ai  (PiAiAdapter, openai-completions 协议)
   │  http://127.0.0.1:<随机端口>/v1   + 每次启动随机生成的本地密钥
   ▼
dsh-workbuddy 本地 shim（只监听 127.0.0.1）
   │  注入 WorkBuddy 的 Authorization / X-User-Id / X-Enterprise-Id / X-Domain
   ▼
WorkBuddy 网关  POST /v2/chat/completions
   （国内 copilot.tencent.com；国际 www.workbuddy.ai）
```

WorkBuddy 的聊天网关本身就是 OpenAI `chat/completions` 协议，但鉴权用的是桌面端登录令牌加账号头，而且令牌会轮换。插件做三件事：

1. **找凭据**：读取桌面端 `CodeBuddyExtension/Data/Public/auth/*.info`（或手填 token）；
2. **本地转发**：起一个只绑定 `127.0.0.1` 的 OpenAI 兼容 shim，逐请求注入最新凭据，令牌过期时自动刷新并重试一次；
3. **注册模型**：通过 pi-ai 适配器把模型组接进 DSH，原生支持流式输出、工具调用、图片输入与思考等级。

桌面端登录文件**默认只读**；本地 shim 使用每次启动随机生成的密钥。WorkBuddy 令牌不会出现在 DSH 配置、日志或响应体里；在设置页粘贴的令牌只保存在 `$DSH_HOME` 下权限为 `0600` 的文件中。

## 前置条件

- DSH `0.2.x`（在 `0.2.1-rc.5` 上开发与测试），Node.js 22+；
- 已安装并**登录** WorkBuddy（国内版）或 WorkBuddy AI（国际版）桌面端；
  - macOS：`~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
  - Windows：`%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\`
  - Linux：`${XDG_DATA_HOME:-~/.local/share}/CodeBuddyExtension/Data/Public/auth/`

没有桌面端也可以用手动 token 模式（见下文）。

## 安装

### 方式一：从源码安装（当前可用）

```sh
git clone https://github.com/ban-sky/dsh-workbuddy.git
cd dsh-workbuddy
npm ci
npm test          # 44 项测试，包含本地假网关端到端
npm run build     # 产出 dist/*.tgz 与 sha256
dsh plugin --profile web add "$PWD"
```

### 方式二：Release 安装包

启用 Release 工作流后（见[构建与发布](#构建与发布默认在-github)），用带 workflow 权限的凭据打标签，
再从 GitHub Release 下载 `ban-sky-dsh-workbuddy-*.tgz`：

```sh
git tag v0.1.1 && git push origin v0.1.1
dsh plugin --profile web add /path/to/ban-sky-dsh-workbuddy-0.1.1.tgz
```

安装后重启 DSH（`dsh web`）。插件配置保存在 profile 的 `cordis.patch.yml` 里，模型组随插件启用。

## 配置

默认零配置：插件自动查找桌面端登录文件。

需要覆盖时，编辑 profile 的 `cordis.patch.yml` 中 `workbuddy` 行的 `config`：

```yaml
- insert:
    - id: workbuddy
      name: '@ban-sky/dsh-workbuddy'
      config:
        authFile: ''            # 显式指定 *.info 绝对路径
        token: ''               # 手动 accessToken（与 authFile 二选一）
        uid: ''                 # 手动 token 模式的账号 id
        enterpriseId: ''        # 手动 token 模式的企业 id
        domain: ''              # 默认 www.codebuddy.cn
        baseURL: ''             # 覆盖网关；默认按 region 选择
        region: auto            # auto | cn | global
        port: 0                 # shim 端口，0 = 随机
        writeBack: false        # 刷新后是否写回桌面端登录文件
```

也可以用环境变量：

| 变量 | 作用 |
| --- | --- |
| `WORKBUDDY_AUTH_FILE` | 指定桌面端登录文件路径 |
| `WORKBUDDY_TOKEN` | 手动 accessToken（优先于登录文件） |

`token` 在配置里标记为 secret；如果不想把令牌写进 YAML，优先使用环境变量。

### 在 DSH 设置页填写令牌（推荐）

不必手改 YAML：

1. 打开 **设置 → 插件 → WorkBuddy**；
2. 粘贴桌面端的 `accessToken`（可选填 `uid`、`enterpriseId`、`domain`），点 **保存并连接**。下一次请求立即生效，无需重启；
3. **测试连接** 会向网关发送一个 1 token 的 `ping`，直接判断令牌是否被接受；如果输入框里还有令牌，会直接测试它而不保存。**清除** 会删除已保存的令牌，并回退到桌面端登录文件（如果存在）。

令牌保存在 `$DSH_HOME/.workbuddy-credentials.json`（默认 `~/.dsh`），权限 `0600`，不会写进 profile YAML。优先级：配置 `token` / `WORKBUDDY_TOKEN` → 设置页保存的令牌 → 桌面端登录文件。

### 手动 token 模式

登录文件被 Electron `safeStorage` 加密、或 DSH 跑在 WSL / 另一台机器时，从桌面端复制 `accessToken`（以及可选的 `uid`、`enterpriseId`）填入 `token` / 环境变量即可。令牌过期后需要重新复制（手动模式没有 refreshToken）。

## 验证

1. 重启 DSH 后打开模型选择器，应出现 **WorkBuddy** 分组（20 个模型：GLM-5.3 系列、Kimi、MiniMax、DeepSeek-V4、Hy 等）；
2. 或打开 **设置 → 插件 → WorkBuddy**，粘贴令牌后点 **测试连接**：绿色提示表示网关已接受该令牌；
3. 选一个模型发一句「你好」，应能正常流式回复；
4. 带图或带工具的任务也应工作（网关原生支持 OpenAI 工具调用）。

无法使用 GUI 时，查看 DSH 日志里这一行确认插件已启动：

```text
workbuddy: shim listening on 127.0.0.1:<port>, gateway https://copilot.tencent.com, 20 models
```

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 模型组出现但请求报 `MISSING_CREDENTIAL` | 未登录桌面端，或登录文件位置不在默认路径。登录后重启 DSH，或设 `WORKBUDDY_AUTH_FILE`。 |
| 报 `ENCRYPTED_CREDENTIAL` | 新版桌面端加密了令牌字段。改用手动 `token` 模式。 |
| 401 / `Offline user session not found` | 令牌失效且无法刷新。重新登录桌面端，或更新手动 token。 |
| 402 / 积分不足 | WorkBuddy 账号额度用完；插件不代充、不绕过计费。 |
| 模型列表和桌面端不一致 | 内置模型表是 2026-10 的快照，上游会增减模型；见「限制」。 |

## 安全与隐私

- 本地 shim **只监听 `127.0.0.1`**，使用每次启动随机生成的 Bearer 密钥；端口随机。
- 登录文件默认只读；`writeBack: true` 才会原子写回（用于无桌面端常驻的场景）。
- 令牌只出现在发往 WorkBuddy 网关的请求头里；不写日志、不进配置、不进响应体。设置页保存的令牌存放在 `$DSH_HOME` 下权限 `0600` 的 JSON 文件中。
- 对话内容经本机转发到 WorkBuddy 网关，处理规则遵循你与 WorkBuddy 的协议；插件本身不收集遥测。

## 限制

- **模型表是快照**：上游随时新增/下线模型。遇到「模型不存在」，改用表中仍在列的模型，或提 issue 更新快照。
- **不解析加密登录文件**：Electron `safeStorage` 需要桌面端自己的辅助进程；插件选择明确报错而不是绕过。
- **只支持 WorkBuddy / CodeBuddy 网关**：`copilot.tencent.com`（国内）与 `www.workbuddy.ai`（国际）；自建代理可用 `baseURL` 指向兼容端点。
- **CI 不连接真实 WorkBuddy**：测试用本地假网关覆盖协议、鉴权、刷新、错误映射与工具调用；真实账号的端到端验证需要一张已登录的桌面端环境。

## 开发

```sh
npm ci
npm test            # node:test，44 项
npm run verify      # 逐个文件语法检查
npm run build       # dist/*.tgz + *.sha256
```

测试结构：

- `test/credentials.test.js` — 登录文件发现/解析/加密检测/刷新单飞/请求头；
- `test/shim.test.js` — 本地 shim 的鉴权、`/v1/models`、SSE 透传、401 刷新重试、错误映射；
- `test/adapter.test.js` — 真实的 `PiAiAdapter` → shim → 假网关端到端（文本、工具调用、无凭据失败）；
- `test/token-store.test.js` — 原子写入、`0600` 权限、规范化、损坏/超大文件处理；
- `test/http.test.js` — 设置路由的 `status`/`save`/`clear`/`test` 动作、错误信封、连通探测；
- `test/plugin.test.js` — `apply()` 注册路由与无凭据诊断。

## 构建与发布（默认在 GitHub）

- [`ci/github-workflows/ci.yml`](./ci/github-workflows/ci.yml)：每次 push / PR，在 Node 22 与 24 上跑测试与构建，上传 tarball 工件；
- [`ci/github-workflows/release.yml`](./ci/github-workflows/release.yml)：推送 `v*` 标签时，在 GitHub Actions 上重新测试、构建，并把 tarball 与 SHA-256 附加到 GitHub Release。

本地不需要预先生成 `dist/`；发布产物以 GitHub Actions 为准。

> **启用说明**：两个 workflow 文件暂放在 `ci/github-workflows/`，因为发布仓库所用的
> OAuth App 令牌没有 GitHub 的 `workflow` scope。把它们复制到 `.github/workflows/`
> 一次即可启用（网页操作或使用带 workflow 权限的凭据），详见 [`ci/README.md`](./ci/README.md)。
> 启用前不会自动构建；下面的本地构建命令与 CI 完全一致。

## License

MIT。模型名与协议行为来自 WorkBuddy 公开产品文档及社区公开资料，见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
