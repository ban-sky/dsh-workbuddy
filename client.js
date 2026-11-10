window.__ModuleLoader__.load({
  id: '@ban-sky/dsh-workbuddy',

  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useState } = React
    const h = React.createElement

    /** Locale namespace, matching the dictionaries registered below. */
    const NS = 'dsh-workbuddy'
    /** Authenticated Host route registered by the Host half. */
    const ROUTE = 'api/workbuddy'
    /** Main-panel key; also the id of the sidebar rail entry. */
    const PANEL_ID = 'workbuddy'

    const zh = {
      panelLabel: 'WorkBuddy',
      title: 'WorkBuddy',
      subtitle: '在 DSH 中直接使用 WorkBuddy / CodeBuddy 账号的模型',
      secAccounts: '账号',
      secConnection: '连接',
      secLogin: '浏览器登录',
      secModels: '模型',
      accountsUnit: '个账号',
      active: '当前',
      switchTo: '切换',
      rename: '重命名',
      renamePrompt: '账号备注名',
      remove: '移除',
      confirmRemove: '确认移除',
      accountError: '账号操作失败',
      addAccount: '添加账号',
      accountsEmpty: '还没有已登录的账号，先在「浏览器登录」里完成一次登录。',
      creditsUnit: '剩余积分',
      creditsRefresh: '刷新积分',
      creditsEmpty: '该账号暂无可显示的积分套餐。',
      creditsError: '读取积分失败',
      creditsExpiring: '即将到期',
      creditsMonthly: '按月套餐',
      creditsRefreshAt: '下次重置',
      creditsExpires: '到期',
      creditsPackage: '积分套餐',
      creditsSourcePersonal: '积分来自 WorkBuddy 个人计费接口。',
      creditsSourceEnterprise: '积分来自 WorkBuddy 企业计费接口。',
      secUsage: '用量统计',
      usageInput: '输入',
      usageOutput: '输出',
      usageCached: '缓存命中',
      usageUncached: '未缓存',
      usageRequests: '请求数',
      usageCreditsSpent: '消耗积分',
      usageTokensPerCredit: '每积分 token',
      usageCreditsPerKToken: '每千 token 积分',
      usageCacheHitRate: '缓存命中率',
      usageRefresh: '刷新用量',
      usageReset: '清零统计',
      usageConfirmReset: '再次点击清零',
      usageEmpty: '还没有用量记录。发起一次对话后，这里会显示输入、输出与缓存命中情况。',
      usageHint: '积分消耗取自 WorkBuddy 每次响应返回的计费用量，仅统计本机经由此插件发出的请求。',
      usageByModel: '按模型',
      usageCreditsShort: '积分',
      usageUpdated: '统计时间',
      loginHint: '生成登录链接后，在浏览器完成登录，令牌会自动保存。',
      loginRegion: '登录站点',
      loginRegionCn: '中国站（codebuddy.cn）',
      loginRegionGlobal: '国际站（workbuddy.ai）',
      loginStart: '生成登录链接',
      loginStarting: '正在生成…',
      loginOpen: '打开登录页',
      loginWaiting: '等待浏览器授权…（完成后自动保存）',
      loginDone: '登录成功，令牌已保存。',
      loginExpired: '登录链接已过期，请重新生成。',
      loginCancel: '取消登录',
      loginError: '登录失败',
      state: '连接状态',
      signedIn: '已接入',
      notSignedIn: '未登录',
      source: '凭据来源',
      sourceNone: '未登录',
      sourceSaved: '浏览器登录',
      account: '账号 uid',
      expiry: '令牌到期',
      noExpiry: '未提供到期时间',
      gateway: '网关',
      models: '可用模型',
      modelsHint: '推理等级、点数倍率与限时优惠来自 WorkBuddy 官方目录，实际扣费以服务端为准。',
      modelsRefresh: '刷新目录',
      modelsEmpty: '暂无可显示模型。',
      modelsFallback: '内置快照',
      modelsRemote: '官方目录',
      reasoning: '推理等级',
      reasoningDefault: '默认',
      rate: '倍率',
      promo: '优惠',
      promoUpcoming: '即将开始',
      promoUntil: '至',
      promoDaily: '每日',
      promoNone: '—',
      test: '测试连接',
      testing: '正在测试…',
      clear: '退出登录',
      confirmClear: '再次点击确认退出',
      clearedOk: '已退出登录并清除本机令牌。',
      testedFail: '测试未通过',
      loading: '正在读取…',
      statusError: '无法读取 WorkBuddy 状态',
      clearError: '退出失败',
      noStatus: '插件 Host 尚未就绪，请稍后重试。',
      refresh: '刷新',
      storageNote:
        '令牌保存在本机 DSH 目录下的 .workbuddy-credentials.json（权限 0600），不写入插件配置、日志或网络响应。',
    }

    const en = {
      panelLabel: 'WorkBuddy',
      title: 'WorkBuddy',
      subtitle: 'Use WorkBuddy / CodeBuddy account models inside DSH',
      secAccounts: 'Accounts',
      secConnection: 'Connection',
      secLogin: 'Browser sign-in',
      secModels: 'Models',
      accountsUnit: 'accounts',
      active: 'active',
      switchTo: 'Switch',
      rename: 'Rename',
      renamePrompt: 'Account label',
      remove: 'Remove',
      confirmRemove: 'Confirm remove',
      accountError: 'Account action failed',
      addAccount: 'Add account',
      accountsEmpty: 'No signed-in account yet. Complete a browser sign-in first.',
      creditsUnit: 'credits left',
      creditsRefresh: 'Refresh credits',
      creditsEmpty: 'No credit packages to show for this account.',
      creditsError: 'Could not read the credits',
      creditsExpiring: 'expiring soon',
      creditsMonthly: 'monthly package',
      creditsRefreshAt: 'resets',
      creditsExpires: 'expires',
      creditsPackage: 'Credit package',
      creditsSourcePersonal: 'Credits come from the WorkBuddy personal billing API.',
      creditsSourceEnterprise: 'Credits come from the WorkBuddy enterprise billing API.',
      secUsage: 'Usage',
      usageInput: 'Input',
      usageOutput: 'Output',
      usageCached: 'Cache hit',
      usageUncached: 'Uncached',
      usageRequests: 'Requests',
      usageCreditsSpent: 'Credits spent',
      usageTokensPerCredit: 'Tokens per credit',
      usageCreditsPerKToken: 'Credits per 1K tokens',
      usageCacheHitRate: 'Cache hit rate',
      usageRefresh: 'Refresh usage',
      usageReset: 'Reset',
      usageConfirmReset: 'Click again to reset',
      usageEmpty: 'No usage recorded yet. Start a conversation and the input, output, and cache figures appear here.',
      usageHint: 'Credits come from the billing usage WorkBuddy returns with every response; only requests sent through this plugin on this machine are counted.',
      usageByModel: 'By model',
      usageCreditsShort: 'credits',
      usageUpdated: 'Measured',
      loginHint: 'Generate a login link, finish signing in, and the token is saved automatically.',
      loginRegion: 'Login site',
      loginRegionCn: 'China (codebuddy.cn)',
      loginRegionGlobal: 'International (workbuddy.ai)',
      loginStart: 'Generate login link',
      loginStarting: 'Generating…',
      loginOpen: 'Open login page',
      loginWaiting: 'Waiting for browser authorization… (saved automatically)',
      loginDone: 'Signed in and saved the token.',
      loginExpired: 'The link expired. Generate a new one.',
      loginCancel: 'Cancel',
      loginError: 'Login failed',
      state: 'Status',
      signedIn: 'Connected',
      notSignedIn: 'Signed out',
      source: 'Credential source',
      sourceNone: 'Signed out',
      sourceSaved: 'Browser sign-in',
      account: 'Account uid',
      expiry: 'Token expiry',
      noExpiry: 'No expiry recorded',
      gateway: 'Gateway',
      models: 'Models',
      modelsHint: 'Reasoning levels, credit multipliers, and limited-time offers come from the WorkBuddy catalog; the server remains authoritative.',
      modelsRefresh: 'Refresh catalog',
      modelsEmpty: 'No models to show.',
      modelsFallback: 'Built-in snapshot',
      modelsRemote: 'Official catalog',
      reasoning: 'Reasoning',
      reasoningDefault: 'default',
      rate: 'Multiplier',
      promo: 'Offer',
      promoUpcoming: 'upcoming',
      promoUntil: 'until',
      promoDaily: 'daily',
      promoNone: '—',
      test: 'Test connection',
      testing: 'Testing…',
      clear: 'Sign out',
      confirmClear: 'Click again to confirm',
      clearedOk: 'Signed out and removed the local token.',
      testedFail: 'Test failed',
      loading: 'Loading…',
      statusError: 'Could not read the WorkBuddy status',
      clearError: 'Sign-out failed',
      noStatus: 'The plugin Host is not ready yet. Try again shortly.',
      refresh: 'Refresh',
      storageNote:
        'The token is stored in .workbuddy-credentials.json (mode 0600) under your DSH directory; it is never written to config, logs, or a response.',
    }

    /**
     * Call one action on the Host route.
     *
     * @param {string} action - Action name.
     * @param {Record<string, unknown>} [payload] - Extra fields.
     * @returns {Promise<any>} The `value` of a successful envelope.
     */
    async function call(action, payload) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload ?? {}) }),
      })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (data === null || typeof data !== 'object' || data.ok !== true) {
        const message =
          data !== null && typeof data === 'object' && data.error !== null && typeof data.error === 'object'
            ? data.error.message
            : `HTTP ${response.status}`
        const error = new Error(typeof message === 'string' ? message : `HTTP ${response.status}`)
        error.code = data?.error?.code
        throw error
      }
      return data.value
    }

    /**
     * Shape a single saved account like the multi-account payload.
     *
     * @param {any} status - The `status` action payload.
     * @returns {{activeId: string, accounts: object[]}} Account view.
     */
    function singleAccountView(status) {
      if (status === null || typeof status !== 'object' || status.signedIn !== true) {
        return { activeId: '', accounts: [] }
      }
      const id = typeof status.uid === 'string' ? status.uid : 'default'
      return {
        activeId: id,
        accounts: [
          {
            id,
            label: '',
            uid: status.uid ?? '',
            nickname: status.nickname ?? '',
            enterpriseName: status.enterpriseName ?? '',
            domain: status.domain ?? '',
            expiresAt: status.expiresAt ?? 0,
            refreshable: status.refreshable === true,
            savedAt: '',
            active: true,
          },
        ],
      }
    }

    /**
     * First visible character of an account label, used as the avatar text.
     *
     * @param {string} value - Account title.
     * @returns {string} One character.
     */
    function initialOf(value) {
      const text = typeof value === 'string' ? value.trim() : ''
      return text === '' ? '?' : Array.from(text)[0].toUpperCase()
    }

    /**
     * Group a token or request count with thin separators.
     *
     * @param {unknown} value - Number from the Host.
     * @returns {string} Display text, `—` when unknown.
     */
    function formatCount(value) {
      if (typeof value !== 'number' || Number.isFinite(value) !== true) return '—'
      return Math.round(value).toLocaleString()
    }

    /**
     * Show a credit amount without trailing zeros.
     *
     * @param {unknown} value - Credits, possibly fractional.
     * @returns {string} Display text, `—` when unknown.
     */
    function formatCredits(value) {
      if (typeof value !== 'number' || Number.isFinite(value) !== true) return '—'
      if (value === 0) return '0'
      if (value < 0.01) return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
      return (Math.round(value * 100) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
    }

    /**
     * Turn a 0..1 ratio into a percentage.
     *
     * @param {unknown} value - Ratio.
     * @returns {string} Display text.
     */
    function formatPercent(value) {
      if (typeof value !== 'number' || Number.isFinite(value) !== true) return '—'
      return (Math.round(value * 1000) / 10).toFixed(1).replace(/\.0$/, '') + '%'
    }

    /**
     * Placeholder bars shown while a card waits for its first payload.
     *
     * @param {number} rows - How many shimmer rows to draw.
     * @param {string} [shape] - `row` for text lines, `block` for tiles.
     * @returns {unknown} Skeleton node.
     */
    function skeleton(rows, shape = 'row') {
      const items = []
      for (let index = 0; index < rows; index += 1) {
        if (shape === 'block') {
          items.push(h('div', { key: String(index), className: 'wb-skeleton-block' }))
        } else {
          items.push(
            h(
              'div',
              { key: String(index), className: 'wb-skeleton-row' },
              h('div', {
                className: 'wb-skeleton-bar',
                style: { width: String(26 + ((index * 17) % 22)) + '%' },
              }),
              h('div', {
                className: 'wb-skeleton-bar',
                style: { flex: '1', maxWidth: String(34 + ((index * 11) % 24)) + '%', marginLeft: 'auto' },
              }),
            ),
          )
        }
      }
      return h('div', { className: 'wb-skeleton', 'aria-hidden': 'true' }, ...items)
    }

    const CSS = `
.wb-page{--wb-on-solid:#fff;width:100%;min-width:0;height:100%;min-height:0;display:flex;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;animation:wb-fade .16s ease-out both}
@keyframes wb-fade{from{opacity:0}to{opacity:1}}
@keyframes wb-rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.wb-page,.wb-card{animation:none!important}.wb-bar-fill,.wb-chevron{transition:none!important}}
.wb-scroll{flex:1;min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.wb-content{max-width:1040px;margin:0 auto;padding:0 clamp(20px,3.4vw,44px) 56px}
@media(max-width:640px){.wb-content{padding:0 16px 40px}}
.wb-heading{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:14px 20px;margin-bottom:20px;padding-top:30px;padding-bottom:18px;border-bottom:.5px solid var(--dsw-alias-border-l4)}
[data-platform=darwin] .wb-heading{padding-top:calc(30px + var(--dsh-frame-top-clearance,0px))}
.wb-heading-main{display:flex;align-items:center;gap:14px;min-width:0}
.wb-mark{width:42px;height:42px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:13px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l4)}
.wb-heading-text{min-width:0}
.wb-heading h1{margin:0;font-size:22px;font-weight:600;line-height:30px;letter-spacing:-.015em}
.wb-heading p{margin:3px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.wb-heading-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px}
.wb-badge{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;font-size:12px;line-height:1;font-weight:500;background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 14%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 60%, var(--dsw-alias-label-primary));white-space:nowrap}
.wb-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.wb-badge-off{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 16%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 60%, var(--dsw-alias-label-primary))}
.wb-banner{margin:0 0 16px;padding:10px 14px;border-radius:12px;font-size:13px;line-height:21px;word-break:break-word}
.wb-banner-ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 14%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 60%, var(--dsw-alias-label-primary))}
.wb-banner-error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary,#ec1313) 12%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-error-primary,#ec1313) 60%, var(--dsw-alias-label-primary))}
.wb-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:stretch}
.wb-card-wide{grid-column:1/-1}
@media(max-width:860px){.wb-cards{grid-template-columns:minmax(0,1fr)}}
.wb-card{min-width:0;display:flex;flex-direction:column;border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;background:var(--dsw-alias-bg-base);overflow:hidden;animation:wb-rise .22s ease-out both;transition:border-color .16s ease,box-shadow .16s ease}
.wb-cards>.wb-card:nth-child(1){animation-delay:20ms}
.wb-cards>.wb-card:nth-child(2){animation-delay:60ms}
.wb-cards>.wb-card:nth-child(3){animation-delay:100ms}
.wb-cards>.wb-card:nth-child(4){animation-delay:140ms}
.wb-card:hover{border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 28px -18px rgba(0,0,0,.4)}
.wb-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;padding:11px 16px;border-bottom:.5px solid var(--dsw-alias-border-l4);background:color-mix(in srgb, var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04)) 45%, transparent)}
.wb-card-close .wb-card-head{border-bottom-color:transparent}
.wb-card-titles{display:flex;align-items:center;gap:9px;min-width:0;padding:2px 4px 2px 0;margin:-2px 0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px}
.wb-card-titles-static{cursor:default;padding:2px 0;margin:0}
.wb-card-titles-static:focus-visible{outline:none}
.wb-card-titles:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-card-title{font-size:14px;font-weight:600;line-height:22px;white-space:nowrap}
.wb-card-icon{width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary)}
.wb-card-icon-accounts{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 12%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 62%, var(--dsw-alias-label-primary))}
.wb-card-icon-connection{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 14%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#22c55e) 60%, var(--dsw-alias-label-primary))}
.wb-card-icon-models{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 16%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 60%, var(--dsw-alias-label-primary))}
.wb-card-icon-usage{background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 12%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 62%, var(--dsw-alias-label-primary))}
.wb-avatar{width:30px;height:30px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:1;letter-spacing:.02em}
.wb-avatar-active{background:var(--dsw-alias-state-business-primary,#4b6bff);color:var(--wb-on-solid,#fff)}
.wb-dot{width:7px;height:7px;flex:none;border-radius:50%;display:inline-block}
.wb-dot-on{background:var(--dsw-alias-state-success-primary,#22c55e)}
.wb-dot-off{background:var(--dsw-alias-state-warn-primary,#f59e0b)}
.wb-card-sub{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums}
.wb-chevron{width:11px;height:11px;flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.wb-chevron-open{transform:rotate(90deg)}
.wb-card-body{display:flex;flex-direction:column;flex:1;gap:12px;padding:14px 16px 16px;min-height:0}
.wb-card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-rows{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto;scrollbar-gutter:stable;padding-right:2px}
.wb-account{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;transition:border-color .15s ease,background .15s ease}
.wb-account:hover{border-color:var(--dsw-alias-border-l3)}
.wb-account-active{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-business-primary,#4b6bff) 5%, transparent)}
.wb-account-top{display:flex;align-items:center;gap:10px;min-width:0}
.wb-account-name{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.wb-account-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:600;line-height:20px}
.wb-account-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.wb-account-meta>span+span::before{content:"·";margin-right:6px;opacity:.55}
.wb-account-uid{font-size:10.5px}
.wb-account-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-left:40px}
.wb-row-title-text{overflow-wrap:anywhere}
.wb-chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;font-size:11px;line-height:1;font-weight:500;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary)}
.wb-chip-accent{background:var(--dsw-alias-state-business-primary,#4b6bff);color:var(--wb-on-solid,#fff)}
.wb-chip-warn{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 16%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 60%, var(--dsw-alias-label-primary))}
.wb-chip-solid{color:var(--wb-on-solid,#fff)}
.wb-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .12s ease,opacity .12s ease}
.wb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.wb-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-btn:disabled{opacity:.45;cursor:default}
.wb-btn:active:not(:disabled){transform:translateY(.5px)}
.wb-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4176e6));color:var(--dsw-alias-label-primary-foreground,#fff)}
.wb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#4176e6));opacity:.9}
.wb-btn-danger{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:color-mix(in srgb, var(--dsw-alias-state-error-primary,#ec1313) 60%, var(--dsw-alias-label-primary))}
.wb-btn-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.wb-btn-sm{height:26px;padding:0 10px;font-size:12px}
.wb-sub{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px;padding-top:13px;border-top:.5px solid var(--dsw-alias-border-l4)}
.wb-sub-title{font-size:12px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}
.wb-kv{display:flex;flex-direction:column}
.wb-kv-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:.5px solid var(--dsw-alias-border-l4)}
.wb-kv-row:last-child{border-bottom:0;padding-bottom:0}
.wb-kv-row:first-child{padding-top:0}
.wb-kv-key{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wb-kv-value{min-width:0;text-align:right;font-size:13px;line-height:20px;overflow-wrap:anywhere}
.wb-state{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.wb-metric{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
.wb-metric-value{font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wb-metric-unit{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wb-credits{display:flex;flex-direction:column;gap:12px;margin-top:auto;padding-top:13px;border-top:.5px solid var(--dsw-alias-border-l4)}
.wb-credits-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wb-credit-list{display:flex;flex-direction:column;gap:13px}
.wb-credit-row{display:flex;flex-direction:column;gap:5px}
.wb-credit-row-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.wb-credit-name{font-size:12px;line-height:19px;overflow-wrap:anywhere}
.wb-credit-count{font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.wb-credit-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.wb-credit-count-warn{color:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#f59e0b) 60%, var(--dsw-alias-label-primary))}
.wb-credit-count-low{color:var(--dsw-alias-state-error-primary,#ec1313)}
.wb-bar{height:5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));overflow:hidden}
.wb-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4b6bff);transition:width .2s ease}
.wb-bar-ok{background:var(--dsw-alias-state-success-primary,#22c55e)}
.wb-bar-warn{background:var(--dsw-alias-state-warn-primary,#f59e0b)}
.wb-bar-low{background:var(--dsw-alias-state-error-primary,#ec1313)}
.wb-hint{margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-tertiary)}
.wb-empty{margin:0;padding:22px 0;text-align:center;font-size:13px;line-height:21px;color:var(--dsw-alias-label-tertiary)}
.wb-skeleton{display:flex;flex-direction:column;gap:9px;padding:2px 0}
.wb-skeleton-row{display:flex;align-items:center;gap:10px}
.wb-skeleton-bar{height:11px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));animation:wb-pulse 1.3s ease-in-out infinite}
.wb-skeleton-block{height:34px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));animation:wb-pulse 1.3s ease-in-out infinite}
@keyframes wb-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.wb-skeleton-bar,.wb-skeleton-block{animation:none}}
.wb-login{display:flex;flex-direction:column;gap:9px}
.wb-login-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.wb-select{height:30px;padding:0 8px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:13px}
.wb-select:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-link{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:9px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4176e6));color:var(--dsw-alias-label-primary-foreground,#fff);font-size:13px;text-decoration:none;white-space:nowrap}
.wb-link:hover{opacity:.9}
.wb-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);word-break:break-all;min-width:0}
.wb-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}
.wb-table-wrap{max-height:340px;overflow:auto;margin:0 -16px;padding:0 16px;scrollbar-gutter:stable}
.wb-table{width:100%;border-collapse:collapse;font-size:12px;min-width:480px}
.wb-table th{position:sticky;top:0;z-index:1;text-align:left;font-weight:500;font-size:10.5px;line-height:16px;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-base);padding:7px 10px 7px 0;border-bottom:.5px solid var(--dsw-alias-border-l3);white-space:nowrap}
.wb-table td{padding:5px 10px 5px 0;border-bottom:.5px solid var(--dsw-alias-border-l4);vertical-align:middle}
.wb-table tbody tr{transition:background .12s ease}
.wb-table tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.wb-table tr:last-child td{border-bottom:0}
.wb-model-cell{display:flex;align-items:baseline;gap:6px;min-width:140px}
.wb-model-text{display:flex;align-items:baseline;gap:6px;min-width:0;flex-wrap:wrap}
.wb-model-name{font-size:12.5px;line-height:18px;font-weight:500}
.wb-model-id{font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.wb-chips{display:flex;gap:3px;flex-wrap:wrap;align-items:center}
.wb-chips-sm .wb-chip{height:18px;padding:0 6px;font-size:10.5px;border-radius:5px}
.wb-usage-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media(max-width:640px){.wb-usage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.wb-usage-cell{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;min-width:0;transition:border-color .15s ease,background .15s ease}
.wb-usage-cell:hover{border-color:var(--dsw-alias-border-l3);background:color-mix(in srgb, var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04)) 50%, transparent)}
.wb-usage-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-usage-value{font-size:15px;font-weight:600;line-height:22px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.wb-usage-models{display:flex;flex-direction:column;gap:4px}
.wb-usage-model{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;line-height:18px;min-width:0}
.wb-usage-model-name{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-usage-model-meta{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.wb-promo-cell{display:flex;align-items:center;gap:4px;min-width:96px}
.wb-promo-text{max-width:170px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

`

    /** Chevron used inside collapsible card headers. */
    function chevron() {
      return h(
        'svg',
        {
          className: 'wb-chevron',
          viewBox: '0 0 12 12',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.6',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M4.5 2.5 8 6l-3.5 3.5' }),
      )
    }

    /**
     * One card in the panel grid. Unless `fixed`, the whole title area toggles it.
     *
     * @param {{ title: string, subtitle?: string, icon?: object, wide?: boolean, fixed?: boolean, open?: boolean, onToggle?: Function, actions?: Array<any>, children?: Array<any> }} props - Props.
     * @returns {any} Element.
     */
    function Card({ title, subtitle, icon, wide, fixed, open, onToggle, actions, children }) {
      const classes = ['wb-card']
      if (wide === true) classes.push('wb-card-wide')
      const expanded = fixed === true || open === true
      if (!expanded) classes.push('wb-card-close')
      const parts = [
        icon === undefined ? null : h('span', { className: 'wb-card-icon wb-card-icon-' + icon.tone }, icon.node()),
        h('span', { className: 'wb-card-title' }, title),
        subtitle !== undefined && subtitle !== '' ? h('span', { className: 'wb-card-sub' }, subtitle) : null,
      ]
      return h(
        'section',
        { className: classes.join(' ') },
        h(
          'div',
          { className: 'wb-card-head' },
          fixed === true
            ? h('div', { className: 'wb-card-titles wb-card-titles-static' }, ...parts)
            : h(
                'button',
                {
                  type: 'button',
                  className: 'wb-card-titles',
                  'aria-expanded': open === true ? 'true' : 'false',
                  onClick: onToggle,
                },
                h('span', { className: open === true ? 'wb-chevron wb-chevron-open' : 'wb-chevron' }, chevron()),
                ...parts,
              ),
          actions !== undefined && actions.length > 0 ? h('div', { className: 'wb-card-actions' }, ...actions) : null,
        ),
        expanded ? h('div', { className: 'wb-card-body' }, ...(children ?? [])) : null,
      )
    }

    /**
     * The WorkBuddy panel: accounts, credits, sign-in, catalog, and status.
     *
     * @param {{t?: Function}} props - Slot props.
     */
    function WorkBuddyPanel({ t }) {
      const tr = typeof t === 'function' ? t : (key) => key
      const [status, setStatus] = useState(null)
      const [busy, setBusy] = useState('')
      const [message, setMessage] = useState(null)
      const [accounts, setAccounts] = useState(null)
      const [accountBusy, setAccountBusy] = useState('')
      const [removeArmed, setRemoveArmed] = useState('')
      const [credits, setCredits] = useState(null)
      const [creditsBusy, setCreditsBusy] = useState(false)
      const [creditsError, setCreditsError] = useState('')
      const [open, setOpen] = useState({ models: false })
      const [login, setLogin] = useState(null)
      const [loginRegion, setLoginRegion] = useState('cn')
      const [catalog, setCatalog] = useState(null)
      const [catalogBusy, setCatalogBusy] = useState(false)
      const [usage, setUsage] = useState(null)
      const [usageBusy, setUsageBusy] = useState(false)
      const [usageResetArmed, setUsageResetArmed] = useState(false)

      const toggle = (key) => setOpen((current) => ({ ...current, [key]: !current[key] }))

      const refresh = useCallback(async () => {
        setBusy('status')
        try {
          const next = await call('status')
          setStatus(next)
          try {
            setAccounts(await call('accounts'))
          } catch (error) {
            // A Host process that predates the multi-account actions still answers
            // "status"; fall back to the single saved account instead of failing
            // the whole panel. The next Host reload picks up the real actions.
            if (error?.code !== 'UNKNOWN_ACTION') throw error
            setAccounts(singleAccountView(next))
          }
          setMessage(null)
        } catch (error) {
          setMessage({ kind: 'error', text: tr('statusError') + ': ' + error.message })
        } finally {
          setBusy('')
        }
      }, [tr])

      const loadCatalog = useCallback(
        async (action = 'models') => {
          setCatalogBusy(true)
          try {
            setCatalog(await call(action))
          } catch (error) {
            setMessage({ kind: 'error', text: tr('statusError') + ': ' + error.message })
          } finally {
            setCatalogBusy(false)
          }
        },
        [tr],
      )

      const loadCredits = useCallback(async () => {
        setCreditsBusy(true)
        setCreditsError('')
        try {
          setCredits(await call('credits'))
        } catch (error) {
          setCredits(null)
          // An older Host half has no `credits` action; stay quiet instead of
          // showing a permanent error banner until the Host reloads.
          setCreditsError(error?.code === 'UNKNOWN_ACTION' ? '' : error.message)
        } finally {
          setCreditsBusy(false)
        }
      }, [])

      const loadUsage = useCallback(async (action = 'usage', payload) => {
        setUsageBusy(true)
        try {
          setUsage(await call(action, payload))
        } catch (error) {
          // An older Host half has no `usage` action; the card simply stays empty.
          if (error?.code !== 'UNKNOWN_ACTION') {
            setMessage({ kind: 'error', text: tr('statusError') + ': ' + error.message })
          }
        } finally {
          setUsageBusy(false)
        }
      }, [tr])

      useEffect(() => {
        void refresh()
        void loadCatalog()
      }, [refresh, loadCatalog])

      const signedIn = status?.signedIn === true

      useEffect(() => {
        if (!signedIn) {
          setCredits(null)
          setUsage(null)
          return
        }
        void loadCredits()
        void loadUsage()
      }, [signedIn, status?.activeAccountId, loadCredits, loadUsage])

      useEffect(() => {
        if (login === null || login.status !== 'pending') return undefined
        let cancelled = false
        let timer
        const tick = async () => {
          try {
            const value = await call('loginPoll', { loginId: login.loginId })
            if (cancelled) return
            if (value.status === 'done') {
              setStatus(value.state ?? (await call('status')))
              setLogin({ ...login, status: 'done' })
              void refresh()
              void loadCatalog()
              setMessage({ kind: 'ok', text: tr('loginDone') })
              return
            }
            if (value.status === 'expired') {
              setLogin({ ...login, status: 'expired' })
              setMessage({ kind: 'error', text: value.message || tr('loginExpired') })
              return
            }
            timer = setTimeout(tick, 2000)
          } catch (error) {
            if (!cancelled) {
              setLogin({ ...login, status: 'error' })
              setMessage({ kind: 'error', text: tr('loginError') + ': ' + error.message })
            }
          }
        }
        timer = setTimeout(tick, 1500)
        return () => {
          cancelled = true
          clearTimeout(timer)
        }
      }, [login?.loginId, login?.status])

      const onTest = async () => {
        setBusy('test')
        setMessage(null)
        try {
          const result = await call('test')
          setMessage({ kind: result.connected ? 'ok' : 'error', text: result.message })
          try {
            setStatus(await call('status'))
          } catch {
            // The probe result is what matters here.
          }
        } catch (error) {
          setMessage({ kind: 'error', text: tr('testedFail') + ': ' + error.message })
        } finally {
          setBusy('')
        }
      }

      const removeArmedBoolean = () => removeArmed === 'active'

      const onClear = async () => {
        if (!removeArmedBoolean()) return
        setBusy('clear')
        setMessage(null)
        try {
          const state = await call('clear')
          setStatus(state)
          setAccounts(await call('accounts'))
          setCredits(null)
          setMessage({ kind: 'ok', text: tr('clearedOk') })
        } catch (error) {
          setMessage({ kind: 'error', text: tr('clearError') + ': ' + error.message })
        } finally {
          setBusy('')
          setRemoveArmed('')
        }
      }

      const onSwitch = async (id) => {
        setAccountBusy(id)
        setMessage(null)
        try {
          const value = await call('switchAccount', { id })
          setAccounts({ activeId: value.activeId, accounts: value.accounts })
          if (value.state) setStatus(value.state)
          setCredits(null)
          void loadCredits()
          void loadCatalog()
        } catch (error) {
          setMessage({ kind: 'error', text: tr('accountError') + ': ' + error.message })
        } finally {
          setAccountBusy('')
        }
      }

      const onRemove = async (id) => {
        if (removeArmed !== id) {
          setRemoveArmed(id)
          return
        }
        setAccountBusy(id)
        setMessage(null)
        try {
          const value = await call('removeAccount', { id })
          setAccounts({ activeId: value.activeId, accounts: value.accounts })
          if (value.state) setStatus(value.state)
          setRemoveArmed('')
          void loadCredits()
          void loadCatalog()
        } catch (error) {
          setMessage({ kind: 'error', text: tr('accountError') + ': ' + error.message })
        } finally {
          setAccountBusy('')
        }
      }

      const onRename = async (account) => {
        const current = account.label || account.nickname || account.uid || account.id
        const next = window.prompt(tr('renamePrompt'), current)
        if (next === null) return
        setAccountBusy(account.id)
        setMessage(null)
        try {
          const value = await call('renameAccount', { id: account.id, label: next })
          setAccounts({ activeId: value.activeId, accounts: value.accounts })
        } catch (error) {
          setMessage({ kind: 'error', text: tr('accountError') + ': ' + error.message })
        } finally {
          setAccountBusy('')
        }
      }

      const onLogin = async () => {
        setBusy('login')
        setMessage(null)
        setLogin(null)
        try {
          const value = await call('loginStart', { region: loginRegion })
          setLogin({ ...value, status: 'pending' })
        } catch (error) {
          setMessage({ kind: 'error', text: tr('loginError') + ': ' + error.message })
        } finally {
          setBusy('')
        }
      }

      const onCancelLogin = async () => {
        if (login?.loginId) {
          try {
            await call('loginCancel', { loginId: login.loginId })
          } catch {
            // The session expires on its own; cancellation is best-effort.
          }
        }
        setLogin(null)
      }

      const expiry =
        typeof status?.expiresAt === 'number' && status.expiresAt > 0
          ? new Date(status.expiresAt).toLocaleString()
          : tr('noExpiry')

      const promoSummary = (promotion) => {
        if (promotion === undefined || promotion === null) return ''
        // The Host already formats daily windows as "HH:MM–HH:MM" strings.
        if (Array.isArray(promotion.daily) && promotion.daily.length > 0) {
          return tr('promoDaily') + ' ' + promotion.daily.join(' / ')
        }
        // Prefer the localized hover copy the official catalog ships.
        if (typeof promotion.textZh === 'string' && promotion.textZh !== '') return promotion.textZh
        if (typeof promotion.textEn === 'string' && promotion.textEn !== '') return promotion.textEn
        if (typeof promotion.endsAt === 'number') {
          return tr('promoUntil') + ' ' + new Date(promotion.endsAt).toLocaleDateString()
        }
        return ''
      }

      const badge = (label, color) =>
        label
          ? h(
              'span',
              {
                className: color ? 'wb-chip wb-chip-solid' : 'wb-chip',
                style: color ? { background: color } : undefined,
              },
              label,
            )
          : null

      const catalogRows = (catalog?.models ?? []).map((model) =>
        h(
          'tr',
          { key: model.id },
          h(
            'td',
            null,
            h(
              'div',
              { className: 'wb-model-cell' },
              h(
                'div',
                { className: 'wb-model-text' },
                h('span', { className: 'wb-model-name' }, model.name || model.id),
                model.name && model.name !== model.id ? h('span', { className: 'wb-model-id wb-mono' }, model.id) : null,
              ),
              model.tier
                ? h(
                    'span',
                    {
                      className: model.tier.color ? 'wb-chip wb-chip-solid' : 'wb-chip',
                      style: model.tier.color ? { background: model.tier.color } : undefined,
                      title: model.tier.text,
                    },
                    model.tier.label,
                  )
                : null,
            ),
          ),
          h(
            'td',
            null,
            h(
              'div',
              { className: 'wb-chips wb-chips-sm' },
              ...(model.efforts ?? []).map((effort) =>
                h(
                  'span',
                  {
                    key: effort,
                    className: effort === model.defaultEffort ? 'wb-chip wb-chip-accent' : 'wb-chip',
                    title: effort === model.defaultEffort ? tr('reasoningDefault') : undefined,
                  },
                  effort,
                ),
              ),
            ),
          ),
          h('td', { className: 'wb-mono' }, model.creditsText || tr('promoNone')),
          h(
            'td',
            null,
            h(
              'div',
              { className: 'wb-promo-cell' },
              model.promotion === undefined || model.promotion === null
                ? h('span', { className: 'wb-promo-text' }, tr('promoNone'))
                : h(
                    'div',
                    { className: 'wb-chips wb-chips-sm' },
                    badge(model.promotion.label, model.promotion.color),
                    model.promotion.status === 'upcoming'
                      ? h('span', { className: 'wb-chip wb-chip-warn' }, tr('promoUpcoming'))
                      : null,
                  ),
              model.promotion !== undefined && model.promotion !== null && promoSummary(model.promotion) !== ''
                ? h(
                    'span',
                    { className: 'wb-promo-text', title: promoSummary(model.promotion) },
                    promoSummary(model.promotion),
                  )
                : null,
            ),
          ),
        ),
      )

      const accountRows = (accounts?.accounts ?? []).map((account) => {
        const title = account.label || account.nickname || account.uid || account.id
        const meta = []
        if (typeof account.nickname === 'string' && account.nickname !== '' && account.nickname !== title) {
          meta.push(account.nickname)
        }
        if (typeof account.domain === 'string' && account.domain !== '') meta.push(account.domain)
        if (typeof account.expiresAt === 'number' && account.expiresAt > 0) {
          meta.push(tr('expiry') + ' ' + new Date(account.expiresAt).toLocaleDateString())
        }
        const shortUid =
          typeof account.uid === 'string' && account.uid !== '' ? account.uid.slice(0, 8) : ''
        return h(
          'div',
          { key: account.id, className: account.active ? 'wb-account wb-account-active' : 'wb-account' },
          h(
            'div',
            { className: 'wb-account-top' },
            h(
              'span',
              {
                className: account.active ? 'wb-avatar wb-avatar-active' : 'wb-avatar',
              },
              initialOf(title),
            ),
            h(
              'div',
              { className: 'wb-account-name' },
              h(
                'span',
                { className: 'wb-account-title' },
                h('span', { className: 'wb-row-title-text' }, title),
                account.active ? h('span', { className: 'wb-chip wb-chip-accent' }, tr('active')) : null,
              ),
              meta.length > 0 || shortUid !== ''
                ? h(
                    'span',
                    { className: 'wb-account-meta' },
                    ...meta.map((part) => h('span', { key: part }, part)),
                    shortUid === '' ? null : h('span', { className: 'wb-mono wb-account-uid' }, shortUid),
                  )
                : null,
            ),
          ),
          h(
            'div',
            { className: 'wb-account-actions' },
            account.active
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'wb-btn wb-btn-sm',
                    disabled: accountBusy !== '',
                    onClick: () => {
                      void onSwitch(account.id)
                    },
                  },
                  tr('switchTo'),
                ),
            h(
              'button',
              {
                type: 'button',
                className: 'wb-btn wb-btn-ghost wb-btn-sm',
                disabled: accountBusy !== '',
                onClick: () => {
                  void onRename(account)
                },
              },
              tr('rename'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'wb-btn wb-btn-ghost wb-btn-sm',
                disabled: accountBusy !== '',
                onClick: () => {
                  void onRemove(account.id)
                },
              },
              removeArmed === account.id ? tr('confirmRemove') : tr('remove'),
            ),
          ),
        )
      })

      const creditPackages = (credits?.packages ?? []).map((entry, index) => {
        const ratio = entry.size > 0 ? Math.max(0, Math.min(1, entry.remain / entry.size)) : 0
        const tone = ratio <= 0.1 ? ' wb-bar-low' : ratio <= 0.3 ? ' wb-bar-warn' : ' wb-bar-ok'
        const meta = []
        if (entry.monthly === true) meta.push(tr('creditsMonthly'))
        if (typeof entry.refreshAt === 'number' && entry.refreshAt > 0) {
          meta.push(tr('creditsRefreshAt') + ' ' + new Date(entry.refreshAt).toLocaleDateString())
        }
        if (typeof entry.expiresAt === 'number' && entry.expiresAt > 0) {
          meta.push(tr('creditsExpires') + ' ' + new Date(entry.expiresAt).toLocaleDateString())
        }
        return h(
          'div',
          { key: String(index), className: 'wb-credit-row' },
          h(
            'div',
            { className: 'wb-credit-row-head' },
            h('span', { className: 'wb-credit-name' }, entry.name || tr('creditsPackage')),
            h(
              'span',
              {
                className:
                  ratio <= 0.1 ? 'wb-credit-count wb-credit-count-low' : ratio <= 0.3 ? 'wb-credit-count wb-credit-count-warn' : 'wb-credit-count',
              },
              String(entry.remain) + ' / ' + String(entry.size),
            ),
          ),
          h(
            'div',
            { className: 'wb-bar' },
            h('div', {
              className: 'wb-bar-fill' + tone,
              style: { width: String(Math.round(ratio * 100)) + '%' },
            }),
          ),
          meta.length > 0
            ? h('div', { className: 'wb-credit-meta' }, ...meta.map((part) => h('span', { key: part }, part)))
            : null,
        )
      })

      const creditsCard = !signedIn
        ? null
        : h(
            'div',
            { className: 'wb-credits' },
            h(
              'div',
              { className: 'wb-credits-head' },
              h(
                'div',
                { className: 'wb-metric' },
                h('span', { className: 'wb-metric-value' }, credits === null ? '—' : String(credits.total)),
                h('span', { className: 'wb-metric-unit' }, tr('creditsUnit')),
                credits !== null && credits.expiringSoon === true
                  ? h('span', { className: 'wb-chip wb-chip-warn' }, tr('creditsExpiring'))
                  : null,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wb-btn wb-btn-ghost',
                  disabled: creditsBusy,
                  onClick: () => {
                    void loadCredits()
                  },
                },
                creditsBusy ? tr('loading') : tr('creditsRefresh'),
              ),
            ),
            creditsError !== ''
              ? h(
                  'p',
                  { className: 'wb-banner wb-banner-error', style: { margin: '4px 0 0' } },
                  tr('creditsError') + ': ' + creditsError,
                )
              : null,
            creditsError === '' && credits !== null && credits.packages.length === 0
              ? h('p', { className: 'wb-empty' }, tr('creditsEmpty'))
              : null,
            credits !== null && credits.packages.length > 0
              ? h('div', { className: 'wb-credit-list' }, ...creditPackages)
              : null,
            credits !== null
              ? h(
                  'p',
                  { className: 'wb-hint' },
                  credits.source === 'enterprise' ? tr('creditsSourceEnterprise') : tr('creditsSourcePersonal'),
                )
              : null,
          )

      const usageTotals = usage?.totals ?? null
      const usageModels = usage?.accounts?.find((entry) => entry.id === status?.activeAccountId)?.models ?? []

      const usageBody = [
        h('p', { className: 'wb-hint' }, tr('usageHint')),
        usageTotals === null || usageTotals.requests === 0
          ? h('p', { className: 'wb-empty' }, tr('usageEmpty'))
          : h(
              'div',
              { className: 'wb-usage-grid' },
              ...[
                [tr('usageInput'), formatCount(usageTotals.promptTokens)],
                [tr('usageOutput'), formatCount(usageTotals.completionTokens)],
                [tr('usageCached'), formatCount(usageTotals.cachedTokens)],
                [tr('usageUncached'), formatCount(usageTotals.uncachedTokens)],
                [tr('usageRequests'), formatCount(usageTotals.requests)],
                [tr('usageCreditsSpent'), formatCredits(usageTotals.credits)],
              ].map((pair) =>
                h(
                  'div',
                  { key: pair[0], className: 'wb-usage-cell' },
                  h('span', { className: 'wb-usage-label' }, pair[0]),
                  h('span', { className: 'wb-usage-value' }, pair[1]),
                ),
              ),
            ),
        usageTotals === null || usageTotals.requests === 0
          ? null
          : h(
              'div',
              { className: 'wb-kv' },
              ...[
                [tr('usageCacheHitRate'), formatPercent(usageTotals.cacheHitRate)],
                [tr('usageTokensPerCredit'), formatCount(usageTotals.tokensPerCredit)],
                [tr('usageCreditsPerKToken'), formatCredits(usageTotals.creditsPerKToken)],
              ].map((pair) =>
                h(
                  'div',
                  { key: pair[0], className: 'wb-kv-row' },
                  h('span', { className: 'wb-kv-key' }, pair[0]),
                  h('span', { className: 'wb-kv-value wb-mono' }, pair[1]),
                ),
              ),
            ),
        usageModels.length === 0
          ? null
          : h(
              'div',
              { className: 'wb-usage-models' },
              h('span', { className: 'wb-sub-title' }, tr('usageByModel')),
              ...usageModels.map((model) =>
                h(
                  'div',
                  { key: model.id, className: 'wb-usage-model' },
                  h('span', { className: 'wb-usage-model-name wb-mono' }, model.id),
                  h(
                    'span',
                    { className: 'wb-usage-model-meta' },
                    formatCount(model.totalTokens) + ' tok · ' + formatCredits(model.credits) + ' ' + tr('usageCreditsShort'),
                  ),
                ),
              ),
            ),
        usage !== null && typeof usage.updatedAt === 'number' && usage.updatedAt > 0
          ? h(
              'p',
              { className: 'wb-hint' },
              tr('usageUpdated') + ' ' + new Date(usage.updatedAt).toLocaleString(),
            )
          : null,
      ]

      const statusPairs = [
        [
          tr('state'),
          status === null
            ? ''
            : h(
                'span',
                { className: 'wb-state' },
                h('span', { className: status.signedIn ? 'wb-dot wb-dot-on' : 'wb-dot wb-dot-off' }),
                status.signedIn ? tr('signedIn') : tr('notSignedIn'),
              ),
          false,
        ],
        [tr('source'), status === null ? '' : status.saved === true ? tr('sourceSaved') : tr('sourceNone'), false],
        [tr('account'), status === null || status.uid === '' ? null : status.uid, true],
        [tr('expiry'), expiry, false],
        [tr('gateway'), status === null ? '' : status.baseURL, true],
        [tr('models'), status === null ? '' : String(status.modelCount ?? 0), false],
      ].filter((pair) => pair[1] !== null)

      const accountsBody = [
        accounts === null
          ? skeleton(2)
          : accounts.accounts.length === 0
            ? h('p', { className: 'wb-empty' }, tr('accountsEmpty'))
            : h('div', { className: 'wb-rows' }, ...accountRows),
        h(
          'div',
          { className: 'wb-card-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'wb-btn wb-btn-primary',
              disabled: busy !== '',
              onClick: () => {
                const target = typeof document === 'undefined' ? null : document.getElementById('wb-login')
                if (target !== null && typeof target.scrollIntoView === 'function') {
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              },
            },
            tr('addAccount'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'wb-btn',
              disabled: busy !== '',
              onClick: () => {
                void refresh()
              },
            },
            tr('refresh'),
          ),
          accounts !== null && accounts.accounts.length > 0
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'wb-btn wb-btn-danger',
                  disabled: busy !== '',
                  onClick: () => {
                    if (!removeArmedBoolean()) {
                      setRemoveArmed('active')
                      return
                    }
                    void onClear()
                  },
                },
                removeArmedBoolean() ? tr('confirmClear') : tr('clear'),
              )
            : null,
        ),
        creditsCard,
      ]

      const loginBlock = [
        h('p', { className: 'wb-hint' }, tr('loginHint')),
        h(
          'div',
          { className: 'wb-login' },
          h(
            'div',
            { className: 'wb-login-row' },
            h('span', { className: 'wb-label' }, tr('loginRegion')),
            h(
              'select',
              {
                className: 'wb-select',
                value: loginRegion,
                disabled: busy !== '',
                onChange: (event) => setLoginRegion(event.target.value),
              },
              h('option', { value: 'cn' }, tr('loginRegionCn')),
              h('option', { value: 'global' }, tr('loginRegionGlobal')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'wb-btn wb-btn-primary',
                disabled: busy !== '',
                onClick: () => {
                  void onLogin()
                },
              },
              busy === 'login' ? tr('loginStarting') : tr('loginStart'),
            ),
            login !== null && login.status === 'pending'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'wb-btn wb-btn-ghost',
                    onClick: () => {
                      void onCancelLogin()
                    },
                  },
                  tr('loginCancel'),
                )
              : null,
          ),
          login !== null && login.verificationUri
            ? h(
                'div',
                { className: 'wb-login-row' },
                h(
                  'a',
                  {
                    className: 'wb-link',
                    href: login.verificationUri,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                  },
                  tr('loginOpen'),
                ),
                h('code', { className: 'wb-code' }, login.verificationUri),
              )
            : null,
          login !== null && login.status === 'pending' ? h('p', { className: 'wb-hint' }, tr('loginWaiting')) : null,
          login !== null && login.status === 'done' ? h('p', { className: 'wb-hint' }, tr('loginDone')) : null,
          login !== null && (login.status === 'expired' || login.status === 'error')
            ? h('p', { className: 'wb-hint' }, tr('loginExpired'))
            : null,
        ),
      ]

      const connectionBody = [
        status === null
          ? busy === 'status'
            ? skeleton(3)
            : h('p', { className: 'wb-empty' }, tr('noStatus'))
          : h(
              'div',
              { className: 'wb-kv' },
              ...statusPairs.map(([key, value, mono]) =>
                h(
                  'div',
                  { key: 'r:' + key, className: 'wb-kv-row' },
                  h('span', { className: 'wb-kv-key' }, key),
                  h(
                    'span',
                    { className: mono === true ? 'wb-kv-value wb-mono' : 'wb-kv-value' },
                    value !== null && typeof value === 'object' ? value : String(value),
                  ),
                ),
              ),
            ),
        h(
          'div',
          { className: 'wb-card-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'wb-btn',
              disabled: busy !== '' || !signedIn,
              onClick: () => {
                void onTest()
              },
            },
            busy === 'test' ? tr('testing') : tr('test'),
          ),
        ),
        h('p', { className: 'wb-hint' }, tr('storageNote')),
        h(
          'div',
          { className: 'wb-sub', id: 'wb-login' },
          h('span', { className: 'wb-sub-title' }, tr('secLogin')),
        ),
        ...loginBlock,
      ]

      const modelsBody = [
        h('p', { className: 'wb-hint' }, tr('modelsHint')),
        catalog === null
          ? skeleton(5)
          : catalog.models.length === 0
            ? h('p', { className: 'wb-empty' }, tr('modelsEmpty'))
            : h(
              'div',
              { className: 'wb-table-wrap' },
              h(
                'table',
                { className: 'wb-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', null, tr('models')),
                    h('th', null, tr('reasoning')),
                    h('th', null, tr('rate')),
                    h('th', null, tr('promo')),
                  ),
                ),
                h('tbody', null, ...catalogRows),
              ),
            ),
      ]

      return h(
        'section',
        { className: 'wb-page', 'aria-label': tr('title') },
        h(
          'div',
          { className: 'wb-scroll' },
          h(
            'div',
            { className: 'wb-content' },
            h(
              'header',
              { className: 'wb-heading' },
              h(
                'div',
                { className: 'wb-heading-main' },
                h('span', { className: 'wb-mark' }, WorkBuddyMark({ size: 24 })),
                h(
                  'div',
                  { className: 'wb-heading-text' },
                  h('h1', null, tr('title')),
                  h('p', null, tr('subtitle')),
                ),
              ),
              h(
                'div',
                { className: 'wb-heading-actions' },
                status !== null
                  ? h(
                      'span',
                      { className: status.signedIn ? 'wb-badge' : 'wb-badge wb-badge-off' },
                      status.signedIn ? tr('signedIn') : tr('notSignedIn'),
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wb-btn',
                    disabled: busy !== '',
                    onClick: () => {
                      void refresh()
                      void loadCatalog()
                      void loadCredits()
                      void loadUsage()
                    },
                  },
                  tr('refresh'),
                ),
              ),
            ),
            message !== null
              ? h(
                  'p',
                  { className: 'wb-banner ' + (message.kind === 'ok' ? 'wb-banner-ok' : 'wb-banner-error') },
                  message.text,
                )
              : null,
            h(
              'div',
              { className: 'wb-cards' },
              Card({
                title: tr('secAccounts'),
                icon: { tone: 'accounts', node: () => CardIcon('accounts', 15) },
                subtitle:
                  accounts !== null
                    ? String(accounts.accounts.length) + ' ' + tr('accountsUnit')
                    : undefined,
                fixed: true,
                children: accountsBody,
              }),
              Card({
                title: tr('secConnection'),
                icon: { tone: 'connection', node: () => CardIcon('connection', 15) },
                subtitle: status === null ? undefined : status.signedIn ? tr('signedIn') : tr('notSignedIn'),
                fixed: true,
                children: connectionBody,
              }),
              Card({
                title: tr('secModels'),
                icon: { tone: 'models', node: () => CardIcon('models', 15) },
                subtitle:
                  catalog !== null
                    ? String(catalog.models.length) +
                      ' · ' +
                      (catalog.source === 'remote' ? tr('modelsRemote') : tr('modelsFallback'))
                    : undefined,
                wide: true,
                open: open.models,
                onToggle: () => toggle('models'),
                actions: [
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wb-btn wb-btn-ghost wb-btn-sm',
                      disabled: catalogBusy,
                      onClick: () => {
                        void loadCatalog('refreshModels')
                      },
                    },
                    catalogBusy ? tr('loading') : tr('modelsRefresh'),
                  ),
                ],
                children: modelsBody,
              }),
              Card({
                title: tr('secUsage'),
                icon: { tone: 'usage', node: () => CardIcon('usage', 15) },
                subtitle:
                  usageTotals !== null && usageTotals.requests > 0
                    ? formatCount(usageTotals.requests) + ' · ' + formatCredits(usageTotals.credits) + ' ' + tr('usageCreditsShort')
                    : undefined,
                wide: true,
                fixed: true,
                actions: [
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'wb-btn wb-btn-ghost wb-btn-sm',
                      disabled: usageBusy,
                      onClick: () => {
                        void loadUsage()
                      },
                    },
                    usageBusy ? tr('loading') : tr('usageRefresh'),
                  ),
                  usageTotals !== null && usageTotals.requests > 0
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'wb-btn wb-btn-ghost wb-btn-sm',
                          disabled: usageBusy,
                          onClick: () => {
                            if (!usageResetArmed) {
                              setUsageResetArmed(true)
                              return
                            }
                            setUsageResetArmed(false)
                            void loadUsage('resetUsage')
                          },
                        },
                        usageResetArmed ? tr('usageConfirmReset') : tr('usageReset'),
                      )
                    : null,
                ],
                children: usageBody,
              }),
            ),
          ),
        ),
      )
    }

    /**
     * Stroke-only glyphs used as card header icons.
     *
     * @param {string} name - One of `accounts`, `connection`, `models`.
     * @param {number} size - Pixel size.
     * @returns {any} Element.
     */
    function CardIcon(name, size) {
      const paths = {
        accounts: ['M4 6.5h16', 'M4 12h16', 'M4 17.5h10'],
        connection: ['M8.5 12h7', 'M6 8.5h-.5a3.5 3.5 0 0 0 0 7H6', 'M18 15.5h.5a3.5 3.5 0 0 0 0-7H18'],
        models: ['M4.5 7.5 12 4l7.5 3.5v9L12 20l-7.5-3.5z', 'M4.5 7.5 12 11l7.5-3.5', 'M12 11v9'],
        usage: ['M4.5 19.5h15', 'M7 19.5V13', 'M12 19.5V7', 'M17 19.5v-4.5'],
      }
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.7',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        ...(paths[name] ?? []).map((d, i) => h('path', { key: String(i), d })),
      )
    }

    /**
     * The WorkBuddy mark: a monochrome W drawn with currentColor, so it follows
     * the theme in both the rail and the page header.
     *
     * @param {{size?: number}} props - Pixel size.
     * @returns {any} Element.
     */
    function WorkBuddyMark({ size }) {
      const px = typeof size === 'number' && size > 0 ? size : 18
      return h(
        'svg',
        {
          width: px,
          height: px,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.9',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          role: 'img',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M3.4 7.5 7 16.6l2.6-6.1 2.6 6.1 3.6-9.1' }),
        h('circle', { cx: '18.6', cy: '7', r: '1.5', fill: 'currentColor', stroke: 'none' }),
      )
    }

    /**
     * Sidebar rail glyph.
     *
     * @param {{size?: number}} props - Rail props.
     * @returns {any} Element.
     */
    function WorkBuddyGlyph({ size }) {
      return WorkBuddyMark({ size })
    }

    /**
     * Register the Client half.
     *
     * @param {any} ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-workbuddy: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshPlugin = NS
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-workbuddy: styles')

      const boundT = ctx.locale.bind(NS)

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          },
          WorkBuddyPanel,
        ),
      )

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 11,
            label: () => boundT('panelLabel'),
            locale: NS,
          },
          WorkBuddyGlyph,
        ),
      )
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
