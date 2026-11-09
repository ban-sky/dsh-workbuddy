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
    /** Tab inside Settings → Plugins. */
    const SLOT = 'settings.plugins.tab'

    const zh = {
      tabLabel: 'WorkBuddy',
      title: 'WorkBuddy 接入',
      intro: '使用浏览器登录一次，即可在 DSH 中直接调用 WorkBuddy 的模型。令牌只保存在本机。',
      loginTitle: '浏览器登录',
      loginHint: '点击生成登录链接，在浏览器完成登录后会自动保存令牌。',
      loginRegion: '登录站点',
      loginRegionCn: '中国站（codebuddy.cn）',
      loginRegionGlobal: '国际站（workbuddy.ai）',
      loginStart: '生成登录链接',
      loginStarting: '正在生成…',
      loginOpen: '打开登录页',
      loginWaiting: '等待浏览器授权…（完成后自动保存）',
      loginDone: '登录成功，令牌已保存。',
      loginExpired: '登录链接已过期，请重新生成。',
      loginLinkHint: '如果按钮没有打开新窗口，请复制下面的链接到浏览器：',
      loginCancel: '取消登录',
      loginError: '登录失败',
      statusTitle: '当前状态',
      state: '连接状态',
      signedIn: '已接入',
      notSignedIn: '未登录',
      source: '凭据来源',
      sourceNone: '未登录',
      sourceSaved: '浏览器登录',
      account: '账号 uid',
      enterprise: '企业 id',
      expiry: '令牌到期',
      noExpiry: '未提供到期时间',
      gateway: '网关',
      models: '可用模型',
      test: '测试连接',
      testing: '正在测试…',
      clear: '退出登录',
      confirmClear: '再次点击确认退出',
      clearedOk: '已退出登录并清除本机令牌。',
      clearedNone: '当前没有已保存的令牌。',
      testedOk: '连接正常，令牌有效。',
      testedFail: '测试未通过',
      loading: '正在读取状态…',
      statusError: '无法读取 WorkBuddy 状态',
      clearError: '退出失败',
      noStatus: '插件 Host 尚未就绪，请稍后重试。',
      refresh: '刷新',
      storageNote:
        '令牌保存在本机 DSH 目录下的 .workbuddy-credentials.json（权限 0600），不写入插件配置、日志或网络响应。',
    }

    const en = {
      tabLabel: 'WorkBuddy',
      title: 'WorkBuddy access',
      intro: 'Sign in once in the browser to use WorkBuddy models from DSH. The token stays on this machine.',
      loginTitle: 'Browser sign-in',
      loginHint: 'Generate a login link and finish signing in. The token is saved automatically.',
      loginRegion: 'Login site',
      loginRegionCn: 'China (codebuddy.cn)',
      loginRegionGlobal: 'International (workbuddy.ai)',
      loginStart: 'Generate login link',
      loginStarting: 'Generating…',
      loginOpen: 'Open login page',
      loginWaiting: 'Waiting for browser authorization… (saved automatically)',
      loginDone: 'Signed in and saved the token.',
      loginExpired: 'The link expired. Generate a new one.',
      loginLinkHint: 'If the button did not open a new window, copy this link into a browser:',
      loginCancel: 'Cancel',
      loginError: 'Login failed',
      statusTitle: 'Current status',
      state: 'Status',
      signedIn: 'Connected',
      notSignedIn: 'Signed out',
      source: 'Credential source',
      sourceNone: 'Signed out',
      sourceSaved: 'Browser sign-in',
      account: 'Account uid',
      enterprise: 'Enterprise id',
      expiry: 'Token expiry',
      noExpiry: 'No expiry recorded',
      gateway: 'Gateway',
      models: 'Models',
      test: 'Test connection',
      testing: 'Testing…',
      clear: 'Sign out',
      confirmClear: 'Click again to confirm',
      clearedOk: 'Signed out and removed the local token.',
      clearedNone: 'There was no saved token.',
      testedOk: 'Connected: the token is valid.',
      testedFail: 'Test failed',
      loading: 'Loading status…',
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

    const CSS = `
.wb-root{display:flex;flex-direction:column;gap:14px;max-width:720px;color:var(--dsw-alias-label-primary,inherit)}
.wb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wb-title{margin:0;font-size:16px;font-weight:600}
.wb-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;line-height:1.5;background:var(--dsw-alias-bg-success,rgba(46,160,67,.12));color:var(--dsw-alias-label-success,#17663a)}
.wb-badge-off{background:var(--dsw-alias-bg-warning,rgba(191,120,0,.12));color:var(--dsw-alias-label-warning,#8a5a00)}
.wb-intro{margin:0;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,inherit)}
.wb-login{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px dashed var(--dsw-alias-border-l1,rgba(0,0,0,.18));border-radius:var(--dsw-radius-md,8px)}
.wb-login-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wb-login-url{word-break:break-all;font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.wb-login-link{display:inline-flex;align-items:center;padding:7px 12px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-button-primary-fill,#24292f);color:var(--dsw-alias-button-primary-label,#fff);font-size:12px;text-decoration:none}
.wb-select{padding:6px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font:inherit;font-size:12px}
.wb-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,rgba(0,0,0,.1)));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,transparent)}
.wb-card-title{margin:0;font-size:13px;font-weight:600}
.wb-grid{display:grid;grid-template-columns:minmax(96px,max-content) minmax(0,1fr);gap:8px 16px;font-size:12px;line-height:1.6}
.wb-key{color:var(--dsw-alias-label-secondary,inherit)}
.wb-value{min-width:0;overflow-wrap:anywhere}
.wb-mono{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px}
.wb-note{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit);padding:8px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-warning,rgba(191,120,0,.08))}
.wb-form{display:flex;flex-direction:column;gap:10px}
.wb-field{display:flex;flex-direction:column;gap:4px}
.wb-label{font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.wb-input{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.16));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font:inherit;font-size:12px}
.wb-input:focus{outline:2px solid var(--dsw-alias-focus-ring,var(--dsw-alias-button-primary-fill,#0969da));outline-offset:1px}
.wb-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:560px){.wb-row{grid-template-columns:1fr}}
.wb-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.wb-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:var(--dsw-radius-md,8px);padding:7px 12px;font:inherit;font-size:12px;line-height:1.4;cursor:pointer}
.wb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.wb-btn:disabled{opacity:.55;cursor:default}
.wb-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#24292f);color:var(--dsw-alias-button-primary-label,#fff)}
.wb-btn-primary:hover:not(:disabled){opacity:.92;background:var(--dsw-alias-button-primary-fill,#24292f)}
.wb-btn-danger{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:var(--dsw-alias-label-danger,#b42318)}
.wb-link{appearance:none;border:none;background:none;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:12px;cursor:pointer;padding:0;text-decoration:underline}
.wb-banner{margin:0;padding:8px 12px;border-radius:var(--dsw-radius-md,8px);font-size:12px;line-height:1.5;word-break:break-word}
.wb-banner-ok{background:var(--dsw-alias-bg-success,rgba(46,160,67,.12));color:var(--dsw-alias-label-success,#17663a)}
.wb-banner-error{background:var(--dsw-alias-bg-danger,rgba(229,72,77,.12));color:var(--dsw-alias-label-danger,#b42318)}
.wb-empty{font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.wb-hint{margin:0;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit)}
.wb-spacer{flex:1}
`

    /**
     * Settings → Plugins → WorkBuddy.
     *
     * @param {{t?: Function}} props - Slot props.
     */
    function WorkBuddySettings({ t }) {
      const tr = typeof t === 'function' ? t : (key) => key
      const [status, setStatus] = useState(null)
      const [busy, setBusy] = useState('')
      const [message, setMessage] = useState(null)
      const [clearArmed, setClearArmed] = useState(false)
      const [login, setLogin] = useState(null)
      const [loginRegion, setLoginRegion] = useState('cn')

      const refresh = useCallback(async () => {
        setBusy('status')
        try {
          setStatus(await call('status'))
          setMessage(null)
        } catch (error) {
          setMessage({ kind: 'error', text: `${tr('statusError')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }, [tr])

      useEffect(() => {
        refresh()
      }, [refresh])

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
              setMessage({ kind: 'error', text: `${tr('loginError')}: ${error.message}` })
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
          setMessage({ kind: 'error', text: `${tr('testedFail')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }

      const onClear = async () => {
        if (!clearArmed) {
          setClearArmed(true)
          setMessage({ kind: 'error', text: tr('confirmClear') })
          return
        }
        setClearArmed(false)
        setBusy('clear')
        setMessage(null)
        const hadSaved = status?.saved === true
        try {
          setStatus(await call('clear'))
          setMessage({ kind: 'ok', text: hadSaved ? tr('clearedOk') : tr('clearedNone') })
        } catch (error) {
          setMessage({ kind: 'error', text: `${tr('clearError')}: ${error.message}` })
        } finally {
          setBusy('')
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
          setMessage({ kind: 'error', text: `${tr('loginError')}: ${error.message}` })
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

      const row = (key, value, mono) =>
        h(
          'div',
          { className: 'wb-grid', style: { display: 'contents' } },
          h('span', { className: 'wb-key' }, key),
          h('span', { className: mono === true ? 'wb-value wb-mono' : 'wb-value' }, value),
        )

      return h(
        'div',
        { className: 'wb-root' },
        h(
          'div',
          { className: 'wb-head' },
          h('h2', { className: 'wb-title' }, tr('title')),
          status !== null
            ? h(
                'span',
                { className: status.signedIn ? 'wb-badge' : 'wb-badge wb-badge-off' },
                status.signedIn ? tr('signedIn') : tr('notSignedIn'),
              )
            : null,
        ),
        h('p', { className: 'wb-intro' }, tr('intro')),
        message !== null
          ? h('p', { className: `wb-banner ${message.kind === 'ok' ? 'wb-banner-ok' : 'wb-banner-error'}` }, message.text)
          : null,
        h(
          'section',
          { className: 'wb-card' },
          h('h3', { className: 'wb-card-title' }, tr('statusTitle')),
          status === null
            ? h('p', { className: 'wb-empty' }, busy === 'status' ? tr('loading') : tr('noStatus'))
            : h(
                'div',
                { className: 'wb-grid' },
                ...[
                  row(tr('state'), status.signedIn ? tr('signedIn') : tr('notSignedIn')),
                  row(tr('source'), status.saved === true ? tr('sourceSaved') : tr('sourceNone')),
                  status.uid !== '' ? row(tr('account'), status.uid, true) : null,
                  status.enterpriseName !== '' || status.uid !== ''
                    ? row(tr('enterprise'), status.enterpriseName || status.enterpriseId || '—')
                    : null,
                  row(tr('expiry'), expiry),
                  row(tr('gateway'), status.baseURL, true),
                  row(tr('models'), String(status.modelCount ?? 0)),
                ].filter(Boolean),
              ),
          h('p', { className: 'wb-hint' }, tr('storageNote')),
          h(
            'div',
            { className: 'wb-actions' },
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
            h(
              'button',
              {
                type: 'button',
                className: 'wb-btn',
                disabled: busy !== '' || status?.signedIn !== true,
                onClick: () => {
                  void onTest()
                },
              },
              busy === 'test' ? tr('testing') : tr('test'),
            ),
            h('span', { className: 'wb-spacer' }),
            h(
              'button',
              {
                type: 'button',
                className: 'wb-btn wb-btn-danger',
                disabled: busy !== '' || status?.signedIn !== true,
                onClick: () => {
                  void onClear()
                },
              },
              clearArmed ? tr('confirmClear') : tr('clear'),
            ),
          ),
        ),
        h(
          'section',
          { className: 'wb-card' },
          h('h3', { className: 'wb-card-title' }, tr('loginTitle')),
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
            ),
            h(
              'div',
              { className: 'wb-actions' },
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
                      className: 'wb-btn',
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
                      className: 'wb-login-link',
                      href: login.verificationUri,
                      target: '_blank',
                      rel: 'noreferrer noopener',
                    },
                    tr('loginOpen'),
                  ),
                  h('code', { className: 'wb-login-url' }, login.verificationUri),
                )
              : null,
            login !== null && login.status === 'pending' ? h('p', { className: 'wb-hint' }, tr('loginWaiting')) : null,
            login !== null && login.status === 'done' ? h('p', { className: 'wb-hint' }, tr('loginDone')) : null,
            login !== null && (login.status === 'expired' || login.status === 'error')
              ? h('p', { className: 'wb-hint' }, tr('loginExpired'))
              : null,
          ),
        ),
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

      ctx.slots.inject(SLOT, () =>
        ctx.slots.register(
          {
            name: SLOT,
            id: 'workbuddy',
            order: 70,
            label: () => boundT('tabLabel'),
            locale: NS,
          },
          WorkBuddySettings,
        ),
      )
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
