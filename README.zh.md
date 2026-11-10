# DSH WorkBuddy

把 **WorkBuddy / CodeBuddy** 账号里的模型接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。在 DSH 设置页完成一次网页登录即可使用，无需在服务器上安装桌面端；对话、工具调用、图片输入和推理等级都走 DSH 正常的 Agent 流程。支持多账号切换、积分显示和按账号节流。

[English](./README.md) | 中文

## 工作原理

```text
DSH Agent 循环
   → pi-ai 适配器（openai-completions 协议）
   → 127.0.0.1:<随机端口>  本地 shim（每次启动随机 Bearer 密钥）
   → WorkBuddy 网关  POST /v2/chat/completions
```

本地 shim 负责注入 WorkBuddy 的 Bearer token 与账号头（`x-user-id`、`x-enterprise-id`、`x-tenant-id`、`x-domain`），token 将过期时自动刷新，被拒绝时重试一次。

登录后会读取 WorkBuddy 官方应用通道目录（中国站 54 个对话模型，国际站 23 个），失败时回退到内置的 20 个模型快照。设置页会列出每个模型的推理等级、点数倍率和进行中/即将开始的优惠时段；**刷新目录** 可在不重启 DSH 的情况下重新读取。

配置界面是**侧边栏独立面板**：点击左侧图标栏里的 WorkBuddy 图标（位于「更多」上方）即可打开整页面板。面板为卡片网格，顺序是**账号 → 连接 → 模型**。账号卡和连接卡是**固定展开**的常驻卡片，不能收起；只有模型卡可以点标题栏折叠。账号行改为分两段排版：上方是首字头像加账号名（当前账号带「当前」标签），下方一行 11px 灰色元信息，依次是昵称、域名、令牌到期日与 8 位 uid，操作按钮（切换 / 重命名 / 移除）单独一行左对齐，不再挤在右侧把名字压窄。账号卡内仍带积分总额、每包进度条与到期信息，积分区固定在卡片底部。宽屏账号卡与连接卡并排且等高，模型卡横跨整行；窄屏（<860px）自动改为每行一张。颜色只用在有含义的地方：卡片头带淡色图标、账号头像、连接状态圆点、积分条低于 30% 转黄、低于 10% 转红。图标与页面标记为黑白线条，随主题自动反色。

## 环境要求

- DSH `0.2.x`，Node.js 22+。
- 一个 WorkBuddy 账号（中国站 `codebuddy.cn` 或国际站 `workbuddy.ai`）。DSH 所在服务器无需安装 WorkBuddy 桌面端。

## 安装

推荐从 Release 安装：

```sh
dsh plugin --profile web add ./ban-sky-dsh-workbuddy-0.8.0.tgz
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

1. 点击左侧边栏的 **WorkBuddy** 图标（在「更多」上方）打开面板。
2. 展开 **浏览器登录**，选择 **中国站** 或 **国际站**，点击 **生成登录链接**。
3. 在浏览器完成登录；页面每 2 秒轮询一次并自动保存该账号。
4. **测试连接** 会发送一次只含 1 个 token 的 `ping`。

再次登录会作为**新账号**加入，不会覆盖已有账号。

## 多账号

- 最多保存 8 个账号，各自独立的 token、refresh token 与账号头。
- 点 **切换** 立即把该账号设为当前账号；模型请求、积分查询都只使用当前账号。
- **重命名** 只改显示名，**移除** 需要点两次确认；移除当前账号会自动切到下一个。
- 每个账号有独立的设备标识与请求节流，互不阻塞，也不会串用身份。
- 所有账号保存在 `$DSH_HOME/.workbuddy-credentials.json`（权限 `0600`，原子写入），设备盐值在同目录的 `.device` 文件中；**退出登录** 只移除当前账号。

## 积分

账号卡片会显示当前账号的点数余额：总量、每个权益包的剩余/总量进度条、周期结束时间与最近到期时间。数据来自 WorkBuddy 计费接口，仅在本机请求；企业账号读取企业额度表，个人账号读取权益包表。读取失败会显示错误，而不是显示 0。

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
npm test        # 85 项测试：账号存储、设备标识与节流、积分、credentials、OAuth、模型目录、优惠、HTTP 路由、shim、adapter、插件
npm run verify  # 语法 + manifest + locale/icon 检查
npm run build   # dist/*.tgz + sha256
```

代码结构：`lib/token-store.js`（多账号 0600 文件）、`lib/accounts.js`（设备标识与按账号节流）、`lib/credits.js`（积分接口）、`lib/credentials.js`（当前账号的 token 与刷新）、`lib/oauth.js`（网页登录）、`lib/catalog-source.js`（在线目录与优惠）、`lib/promotions.js`（时段与徽章）、`lib/http.js`（设置页路由）、`lib/shim.js`（本地代理）、`lib/adapter.js`（DSH provider）、`client.js`（可折叠的设置分区）。

GitHub Actions 在 Node 22/24 上跑测试，并在打 tag 时发布 Release。

## 许可证

MIT
