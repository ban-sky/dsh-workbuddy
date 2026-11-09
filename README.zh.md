# DSH WorkBuddy

把 **WorkBuddy / CodeBuddy** 账号里的模型接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。在 DSH 设置页完成一次网页登录即可使用，无需在服务器上安装桌面端；对话、工具调用、图片输入和推理等级都走 DSH 正常的 Agent 流程。

[English](./README.md) | 中文

## 工作原理

```text
DSH Agent 循环
   → pi-ai 适配器（openai-completions 协议）
   → 127.0.0.1:<随机端口>  本地 shim（每次启动随机 Bearer 密钥）
   → WorkBuddy 网关  POST /v2/chat/completions
```

本地 shim 负责注入 WorkBuddy 的 Bearer token 与账号头（`x-user-id`、`x-enterprise-id`、`x-tenant-id`、`x-domain`），token 将过期时自动刷新，被拒绝时重试一次。20 个模型的目录、原生工具调用、流式输出、图片输入和推理等级通过 DSH 的 provider 接口注册。

## 环境要求

- DSH `0.2.x`，Node.js 22+。
- 一个 WorkBuddy 账号（中国站 `codebuddy.cn` 或国际站 `workbuddy.ai`）。DSH 所在服务器无需安装 WorkBuddy 桌面端。

## 安装

推荐从 Release 安装：

```sh
dsh plugin --profile web add ./ban-sky-dsh-workbuddy-0.2.0.tgz
```

从源码安装：

```sh
git clone https://github.com/ban-sky/dsh-workbuddy.git
cd dsh-workbuddy
npm ci && npm test && npm run build
dsh plugin --profile web add "$PWD"
```

安装后重启 DSH。

## 登录

1. 打开 **设置 → 插件 → WorkBuddy**。
2. 选择 **中国站** 或 **国际站**，点击 **生成登录链接**。
3. 在浏览器完成登录；页面每 2 秒轮询一次并自动保存 token。
4. 点击 **测试连接** 验证（会发送一次只含 1 个 token 的 `ping`）。

token 与 refresh token 保存在 `$DSH_HOME/.workbuddy-credentials.json`（权限 `0600`）；刷新后会写回新 token。**退出登录** 会删除该文件。

## 配置

通常无需配置。如需覆盖，在 profile 的 `cordis.patch.yml` 的 `workbuddy` 行中设置：

```yaml
- id: workbuddy
  config:
    region: auto       # auto | cn | global
    baseURL: ''        # 显式网关；留空按区域选择
    port: 0            # 本地 shim 端口；0 = 随机
```

## 安全

- **网页登录是唯一的凭据来源**：没有配置 token、环境变量 token、命令行 token 或粘贴框；`$wbEncrypted` 加密串会被直接拒绝。
- token 文件位于 `$DSH_HOME` 下、权限 `0600`，不会写入日志、插件配置或 HTTP 响应，也不会被打进 npm 包。
- shim 只监听 `127.0.0.1`，每次启动使用随机 Bearer 密钥；真实 token 只留在 Host 进程内。
- 出站请求只发往所选 WorkBuddy 网关。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `尚未登录 WorkBuddy` | 在设置页完成网页登录。 |
| `登录已失效（HTTP 401）` | 重新生成登录链接；refresh token 已被拒绝。 |
| 模型请求返回 `MISSING_CREDENTIAL` | 同上：Host 还没有保存 token。 |
| 登录链接过期 | 链接有效期 10 分钟，重新生成。 |
| 端口被占用 | 设 `port: 0`（默认）或换一个空闲端口。 |

WorkBuddy 的配额、限流错误会作为普通模型错误返回 DSH。

## 开发

```sh
npm test        # 45 项测试：credentials、OAuth、HTTP 路由、shim、adapter、插件
npm run verify  # 语法 + manifest + locale/icon 检查
npm run build   # dist/*.tgz + sha256
```

代码结构：`lib/credentials.js`（保存的 token 与刷新）、`lib/oauth.js`（网页登录）、`lib/token-store.js`（0600 文件）、`lib/http.js`（设置页路由）、`lib/shim.js`（本地代理）、`lib/adapter.js`（DSH provider）、`client.js`（设置页）。

GitHub Actions 在 Node 22/24 上跑测试，并在打 tag 时发布 Release。

## 许可证

MIT
