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
      secLogin: '浏览器登录',
      secModels: '模型与计费',
      secStatus: '连接状态',
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
      secLogin: 'Browser sign-in',
      secModels: 'Models & billing',
      secStatus: 'Connection',
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

    const CSS = `
.wb-page{width:100%;min-width:0;height:100%;min-height:0;display:flex;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6}
.wb-scroll{flex:1;min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.wb-content{max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px}
@media(max-width:640px){.wb-content{padding:0 16px 32px}}
.wb-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;padding-top:28px}
[data-platform=darwin] .wb-heading{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.wb-heading-main{display:flex;align-items:center;gap:12px;min-width:0}
.wb-heading-text{min-width:0}
.wb-heading h1{margin:0;font-size:20px;font-weight:500;line-height:28px}
.wb-heading p{margin:2px 0 0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.wb-mark{width:34px;height:34px;flex:none;border-radius:10px;box-shadow:0 2px 8px rgba(60,92,255,.22)}
.wb-heading-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-badge{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;font-size:12px;line-height:1;font-weight:500;background:var(--dsw-alias-bg-success,rgba(46,160,67,.12));color:var(--dsw-alias-label-success,#17663a);white-space:nowrap}
.wb-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.wb-badge-off{background:var(--dsw-alias-bg-warning,rgba(191,120,0,.12));color:var(--dsw-alias-label-warning,#8a5a00)}
.wb-banner{margin:0 0 16px;padding:10px 14px;border-radius:12px;font-size:13px;line-height:21px;word-break:break-word}
.wb-banner-ok{background:var(--dsw-alias-bg-success,rgba(46,160,67,.1));color:var(--dsw-alias-label-success,#17663a)}
.wb-banner-error{background:var(--dsw-alias-bg-danger,rgba(229,72,77,.1));color:var(--dsw-alias-label-danger,#b42318)}
.wb-card{border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;margin-bottom:16px;overflow:hidden;background:var(--dsw-alias-bg-base)}
.wb-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;min-height:52px;padding:8px 16px}
.wb-card-toggle{appearance:none;border:0;background:none;padding:4px 0;display:flex;align-items:center;gap:10px;cursor:pointer;color:inherit;font:inherit;text-align:left;border-radius:8px}
.wb-card-toggle:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-chevron{width:12px;height:12px;flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.wb-chevron-open{transform:rotate(90deg)}
.wb-card-title{font-size:14px;font-weight:500;line-height:22px}
.wb-card-sub{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.wb-card-body{padding:0 16px 16px;display:flex;flex-direction:column;gap:4px}
.wb-card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wb-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:8px 0;border-top:.5px solid var(--dsw-alias-border-l4)}
.wb-row:first-child{border-top:0}
.wb-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.wb-row-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;line-height:22px;font-weight:500}
.wb-row-title-text{overflow-wrap:anywhere}
.wb-row-sub{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.wb-row-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:none}
.wb-chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;font-size:11px;line-height:1;font-weight:500;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary)}
.wb-chip-accent{background:var(--dsw-alias-state-business-primary,#4b6bff);color:#fff}
.wb-chip-warn{background:var(--dsw-alias-bg-warning,rgba(191,120,0,.14));color:var(--dsw-alias-label-warning,#8a5a00)}
.wb-chip-solid{color:#fff}
.wb-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap}
.wb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.wb-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-btn:disabled{opacity:.45;cursor:default}
.wb-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#24292f);color:var(--dsw-alias-button-primary-label,#fff)}
.wb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-fill,#24292f);opacity:.9}
.wb-btn-danger{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:var(--dsw-alias-label-danger,#b42318)}
.wb-btn-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.wb-credits{display:flex;flex-direction:column;gap:10px;margin-top:8px;padding-top:16px;border-top:.5px solid var(--dsw-alias-border-l3)}
.wb-credits-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wb-credit-total{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.wb-credit-number{font-size:30px;font-weight:600;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.wb-credit-unit{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.wb-credit-list{display:flex;flex-direction:column;gap:14px}
.wb-credit-row{display:flex;flex-direction:column;gap:6px}
.wb-credit-row-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.wb-credit-name{font-size:13px;line-height:20px;overflow-wrap:anywhere}
.wb-credit-count{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.wb-credit-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wb-bar{height:6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07));overflow:hidden}
.wb-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4b6bff);transition:width .2s ease}
.wb-hint{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.wb-empty{padding:24px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.wb-login{display:flex;flex-direction:column;gap:10px;padding-top:4px}
.wb-login-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wb-label{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.wb-select{height:30px;padding:0 8px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:13px}
.wb-select:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.wb-link{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:9px;background:var(--dsw-alias-button-primary-fill,#24292f);color:var(--dsw-alias-button-primary-label,#fff);font-size:13px;text-decoration:none;white-space:nowrap}
.wb-link:hover{opacity:.9}
.wb-code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);word-break:break-all;min-width:0}
.wb-mono{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;overflow-wrap:anywhere}
.wb-table-wrap{overflow:auto;max-height:420px;margin:0 -16px;padding:0 16px}
.wb-table{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}
.wb-table th{position:sticky;top:0;z-index:1;text-align:left;font-weight:500;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-base);padding:8px 10px 8px 0;border-bottom:.5px solid var(--dsw-alias-border-l3);white-space:nowrap}
.wb-table td{padding:10px 10px 10px 0;border-bottom:.5px solid var(--dsw-alias-border-l4);vertical-align:middle}
.wb-table tr:last-child td{border-bottom:0}
.wb-model-cell{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:160px}
.wb-model-text{display:flex;flex-direction:column;gap:1px;min-width:0}
.wb-model-name{font-size:13px;line-height:20px}
.wb-model-id{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.wb-chips{display:flex;gap:4px;flex-wrap:wrap}
.wb-promo-cell{display:flex;flex-direction:column;gap:4px;min-width:150px}
.wb-promo-text{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.wb-grid{display:grid;grid-template-columns:140px minmax(0,1fr);gap:10px 16px;padding:6px 0;font-size:13px;line-height:21px}
@media(max-width:520px){.wb-grid{grid-template-columns:110px minmax(0,1fr)}}
.wb-key{color:var(--dsw-alias-label-tertiary)}
.wb-value{min-width:0;overflow-wrap:anywhere}
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
     * Collapsible card, in the app's own list-card idiom.
     *
     * @param {{ title: string, subtitle?: string, open: boolean, onToggle: Function, actions?: Array<any>, children?: Array<any> }} props - Props.
     * @returns {any} Element.
     */
    function Card({ title, subtitle, open, onToggle, actions, children }) {
      return h(
        'section',
        { className: 'wb-card' },
        h(
          'div',
          { className: 'wb-card-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'wb-card-toggle',
              'aria-expanded': open ? 'true' : 'false',
              onClick: onToggle,
            },
            h('span', { className: open ? 'wb-chevron wb-chevron-open' : 'wb-chevron' }, chevron()),
            h('span', { className: 'wb-card-title' }, title),
            subtitle ? h('span', { className: 'wb-card-sub' }, subtitle) : null,
          ),
          actions !== undefined && actions.length > 0 ? h('div', { className: 'wb-card-actions' }, ...actions) : null,
        ),
        open ? h('div', { className: 'wb-card-body' }, ...(children ?? [])) : null,
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
      const [open, setOpen] = useState({ accounts: true, login: false, models: false, status: false })
      const [login, setLogin] = useState(null)
      const [loginRegion, setLoginRegion] = useState('cn')
      const [catalog, setCatalog] = useState(null)
      const [catalogBusy, setCatalogBusy] = useState(false)

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

      useEffect(() => {
        void refresh()
        void loadCatalog()
      }, [refresh, loadCatalog])

      const signedIn = status?.signedIn === true

      useEffect(() => {
        if (!signedIn) {
          setCredits(null)
          return
        }
        void loadCredits()
      }, [signedIn, status?.activeAccountId, loadCredits])

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
              setOpen((current) => ({ ...current, accounts: true }))
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
              { className: 'wb-chips' },
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
                    { className: 'wb-chips' },
                    badge(model.promotion.label, model.promotion.color),
                    model.promotion.status === 'upcoming'
                      ? h('span', { className: 'wb-chip wb-chip-warn' }, tr('promoUpcoming'))
                      : null,
                  ),
              model.promotion !== undefined && model.promotion !== null && promoSummary(model.promotion) !== ''
                ? h('span', { className: 'wb-promo-text' }, promoSummary(model.promotion))
                : null,
            ),
          ),
        ),
      )

      const accountRows = (accounts?.accounts ?? []).map((account) => {
        const title = account.label || account.nickname || account.uid || account.id
        const detail = [account.nickname, account.uid, account.domain].filter(
          (part) => typeof part === 'string' && part !== '',
        )
        return h(
          'div',
          { key: account.id, className: 'wb-row' },
          h(
            'div',
            { className: 'wb-row-main' },
            h(
              'span',
              { className: 'wb-row-title' },
              h('span', { className: 'wb-row-title-text' }, title),
              account.active ? h('span', { className: 'wb-chip wb-chip-accent' }, tr('active')) : null,
            ),
            detail.length > 0 ? h('span', { className: 'wb-row-sub' }, detail.join(' · ')) : null,
            typeof account.expiresAt === 'number' && account.expiresAt > 0
              ? h('span', { className: 'wb-row-sub' }, tr('expiry') + ' ' + new Date(account.expiresAt).toLocaleString())
              : null,
          ),
          h(
            'div',
            { className: 'wb-row-actions' },
            account.active
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'wb-btn',
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
                className: 'wb-btn wb-btn-ghost',
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
                className: 'wb-btn wb-btn-ghost',
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
            h('span', { className: 'wb-credit-count' }, String(entry.remain) + ' / ' + String(entry.size)),
          ),
          h(
            'div',
            { className: 'wb-bar' },
            h('div', { className: 'wb-bar-fill', style: { width: String(Math.round(ratio * 100)) + '%' } }),
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
                { className: 'wb-credit-total' },
                h('span', { className: 'wb-credit-number' }, credits === null ? '—' : String(credits.total)),
                h('span', { className: 'wb-credit-unit' }, tr('creditsUnit')),
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

      const accountsBody = [
        accounts === null
          ? h('p', { className: 'wb-empty' }, tr('loading'))
          : accounts.accounts.length === 0
            ? h('p', { className: 'wb-empty' }, tr('accountsEmpty'))
            : h('div', null, ...accountRows),
        h(
          'div',
          { className: 'wb-card-actions', style: { marginTop: '8px' } },
          h(
            'button',
            {
              type: 'button',
              className: 'wb-btn wb-btn-primary',
              onClick: () => setOpen((current) => ({ ...current, login: true })),
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

      const loginBody = [
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

      const modelsBody = [
        h('p', { className: 'wb-hint' }, tr('modelsHint')),
        catalog !== null && catalog.models.length === 0
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

      const statusPairs = [
        [tr('state'), status === null ? '' : status.signedIn ? tr('signedIn') : tr('notSignedIn'), false],
        [tr('source'), status === null ? '' : status.saved === true ? tr('sourceSaved') : tr('sourceNone'), false],
        [tr('account'), status === null || status.uid === '' ? null : status.uid, true],
        [tr('expiry'), expiry, false],
        [tr('gateway'), status === null ? '' : status.baseURL, true],
        [tr('models'), status === null ? '' : String(status.modelCount ?? 0), false],
      ].filter((pair) => pair[1] !== null)

      const statusBody = [
        status === null
          ? h('p', { className: 'wb-empty' }, busy === 'status' ? tr('loading') : tr('noStatus'))
          : h(
              'div',
              { className: 'wb-grid' },
              ...statusPairs.flatMap(([key, value, mono]) => [
                h('span', { key: 'k:' + key, className: 'wb-key' }, key),
                h('span', { key: 'v:' + key, className: mono === true ? 'wb-value wb-mono' : 'wb-value' }, value),
              ]),
            ),
        h('p', { className: 'wb-hint' }, tr('storageNote')),
        h(
          'div',
          { className: 'wb-card-actions', style: { marginTop: '8px' } },
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
                h(
                  'svg',
                  { className: 'wb-mark', viewBox: '0 0 32 32', role: 'img', 'aria-hidden': 'true' },
                  h(
                    'defs',
                    null,
                    h(
                      'linearGradient',
                      { id: 'wb-page-gradient', x1: '0', y1: '0', x2: '1', y2: '1' },
                      h('stop', { offset: '0', stopColor: '#3b82f6' }),
                      h('stop', { offset: '0.55', stopColor: '#6366f1' }),
                      h('stop', { offset: '1', stopColor: '#8b5cf6' }),
                    ),
                  ),
                  h('rect', { width: '32', height: '32', rx: '9', fill: 'url(#wb-page-gradient)' }),
                  h('path', {
                    d: 'M8 11l3.4 10 3.1-7 3.1 7L21 11',
                    fill: 'none',
                    stroke: '#fff',
                    strokeWidth: '2.2',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }),
                  h('circle', { cx: '23.5', cy: '9.5', r: '2.2', fill: '#fff', opacity: '0.9' }),
                ),
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
            Card({
              title: tr('secAccounts'),
              subtitle: accounts !== null ? String(accounts.accounts.length) : undefined,
              open: open.accounts,
              onToggle: () => toggle('accounts'),
              children: accountsBody,
            }),
            Card({
              title: tr('secLogin'),
              open: open.login,
              onToggle: () => toggle('login'),
              children: loginBody,
            }),
            Card({
              title: tr('secModels'),
              subtitle:
                catalog !== null ? (catalog.source === 'remote' ? tr('modelsRemote') : tr('modelsFallback')) : undefined,
              open: open.models,
              onToggle: () => toggle('models'),
              actions: [
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wb-btn wb-btn-ghost',
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
              title: tr('secStatus'),
              open: open.status,
              onToggle: () => toggle('status'),
              children: statusBody,
            }),
          ),
        ),
      )
    }

    /**
     * Sidebar rail glyph: the gradient W mark, sized by the rail.
     *
     * @param {{size?: number}} props - Rail props.
     * @returns {any} Element.
     */
    function WorkBuddyGlyph({ size }) {
      const px = typeof size === 'number' && size > 0 ? size : 18
      return h(
        'svg',
        { width: px, height: px, viewBox: '0 0 32 32', role: 'img', 'aria-hidden': 'true' },
        h(
          'defs',
          null,
          h(
            'linearGradient',
            { id: 'wb-rail-gradient', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0', stopColor: '#3b82f6' }),
            h('stop', { offset: '0.55', stopColor: '#6366f1' }),
            h('stop', { offset: '1', stopColor: '#8b5cf6' }),
          ),
        ),
        h('rect', { width: '32', height: '32', rx: '9', fill: 'url(#wb-rail-gradient)' }),
        h('path', {
          d: 'M8 11l3.4 10 3.1-7 3.1 7L21 11',
          fill: 'none',
          stroke: '#fff',
          strokeWidth: '3',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: '23.5', cy: '9.5', r: '2.4', fill: '#fff', opacity: '0.9' }),
      )
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
