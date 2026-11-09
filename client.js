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
      intro:
        '把 WorkBuddy（CodeBuddy）桌面端已登录的账号接入 DSH。可以直接复用桌面端登录文件，也可以在这里粘贴 accessToken，或在没有桌面端的机器上使用网页登录。',
      loginTitle: '网页登录（无需桌面端）',
      loginHint:
        '生成登录链接后在浏览器打开并完成登录，插件会自动获取并保存令牌。适合 WorkBuddy 不在这台机器上、或登录文件已加密的情况。',
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
      notSignedIn: '未配置',
      source: '凭据来源',
      sourceNone: '未配置',
      sourceFile: 'WorkBuddy 桌面端登录文件',
      sourceSaved: '插件内保存的令牌',
      sourceToken: '插件配置 / 环境变量',
      account: '账号 uid',
      enterprise: '企业 id',
      expiry: '令牌到期',
      noExpiry: '未提供到期时间',
      gateway: '网关',
      models: '可用模型',
      authFile: '登录文件',
      savedNote: '当前请求使用插件内保存的令牌；清除后会回退到桌面端登录文件。',
      formTitle: '粘贴 accessToken',
      formHint:
        'accessToken 只保存在本机 DSH 目录下的 .workbuddy-credentials.json（权限 0600），不会写入插件配置、日志或网络响应。输入框有内容时，「测试连接」直接验证它，不会保存。',
      tokenLabel: 'accessToken',
      tokenPlaceholder: '粘贴 WorkBuddy / CodeBuddy 的 accessToken',
      uidLabel: '账号 uid（可选）',
      uidPlaceholder: '账号 uid，例如 123456789',
      enterpriseLabel: '企业 id（可选）',
      enterprisePlaceholder: '企业 id，个人账号可留空',
      domainLabel: '账号域名（可选）',
      domainPlaceholder: 'www.codebuddy.cn',
      save: '保存并连接',
      saving: '正在保存…',
      test: '测试连接',
      testing: '正在测试…',
      clear: '清除已保存令牌',
      confirmClear: '再次点击确认清除',
      showToken: '显示令牌',
      hideToken: '隐藏令牌',
      savedOk: '令牌已保存并立即生效。',
      clearedOk: '已清除插件内保存的令牌。',
      clearedNone: '没有需要清除的已保存令牌。',
      testedOk: '测试通过：网关已连通，令牌有效。',
      testedFail: '测试未通过',
      missingToken: '请先填写 accessToken。',
      loading: '正在读取状态…',
      statusError: '无法读取 WorkBuddy 状态',
      saveError: '保存失败',
      clearError: '清除失败',
      noStatus: '插件 Host 尚未就绪，请稍后重试或重启 DSH。',
      refresh: '刷新',
      hintFile:
        '桌面端登录后会自动生成登录文件，无需手动填写令牌。若已登录但显示未配置，请确认 WorkBuddy 桌面端与 DSH 在同一台机器运行。',
    }

    const en = {
      tabLabel: 'WorkBuddy',
      title: 'WorkBuddy access',
      intro:
        'Connect the account already signed in to the WorkBuddy (CodeBuddy) desktop app to DSH, paste an accessToken, or use the web login when the desktop app is not available.',
      loginTitle: 'Web login (no desktop app needed)',
      loginHint:
        'Generate a login link, open it in a browser, and sign in. The plugin receives and saves the token automatically. Use this when WorkBuddy is not installed on this machine or the sign-in file is encrypted.',
      loginRegion: 'Login site',
      loginRegionCn: 'China (codebuddy.cn)',
      loginRegionGlobal: 'International (workbuddy.ai)',
      loginStart: 'Generate login link',
      loginStarting: 'Generating…',
      loginOpen: 'Open login page',
      loginWaiting: 'Waiting for browser authorization… (saved automatically)',
      loginDone: 'Signed in and saved the token.',
      loginExpired: 'The login link expired. Generate a new one.',
      loginLinkHint: 'If the button did not open a new window, copy this link into a browser:',
      loginCancel: 'Cancel login',
      loginError: 'Login failed',
      statusTitle: 'Current status',
      state: 'Status',
      signedIn: 'Connected',
      notSignedIn: 'Not configured',
      source: 'Credential source',
      sourceNone: 'Not configured',
      sourceFile: 'WorkBuddy desktop sign-in file',
      sourceSaved: 'Token saved in this plugin',
      sourceToken: 'Plugin config / environment',
      account: 'Account uid',
      enterprise: 'Enterprise id',
      expiry: 'Token expiry',
      noExpiry: 'No expiry recorded',
      gateway: 'Gateway',
      models: 'Models',
      authFile: 'Sign-in file',
      savedNote:
        'Requests use the token saved in this plugin. Clearing it falls back to the desktop sign-in file.',
      formTitle: 'Paste an accessToken',
      formHint:
        'The accessToken is stored only in .workbuddy-credentials.json (mode 0600) inside your local DSH directory. It is never written to the plugin config, logs, or a network response. When the field is non-empty, Test connection checks that token without saving it.',
      tokenLabel: 'accessToken',
      tokenPlaceholder: 'Paste the WorkBuddy / CodeBuddy accessToken',
      uidLabel: 'Account uid (optional)',
      uidPlaceholder: 'Account uid, for example 123456789',
      enterpriseLabel: 'Enterprise id (optional)',
      enterprisePlaceholder: 'Enterprise id; leave empty for personal accounts',
      domainLabel: 'Account domain (optional)',
      domainPlaceholder: 'www.codebuddy.cn',
      save: 'Save and connect',
      saving: 'Saving…',
      test: 'Test connection',
      testing: 'Testing…',
      clear: 'Clear saved token',
      confirmClear: 'Click again to confirm',
      showToken: 'Show token',
      hideToken: 'Hide token',
      savedOk: 'Token saved and applied immediately.',
      clearedOk: 'Saved token cleared.',
      clearedNone: 'There was no saved token to clear.',
      testedOk: 'Connected: the gateway accepted the token.',
      testedFail: 'Test failed',
      missingToken: 'Enter an accessToken first.',
      loading: 'Loading status…',
      statusError: 'Could not read the WorkBuddy status',
      saveError: 'Save failed',
      clearError: 'Clear failed',
      noStatus: 'The plugin Host is not ready yet. Try again shortly or restart DSH.',
      refresh: 'Refresh',
      hintFile:
        'Signing in to the desktop app creates the sign-in file automatically. If it is not detected, make sure the desktop app and DSH run on the same machine.',
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
      const [form, setForm] = useState({ token: '', uid: '', enterpriseId: '', domain: '' })
      const [busy, setBusy] = useState('')
      const [message, setMessage] = useState(null)
      const [tokenVisible, setTokenVisible] = useState(false)
      const [clearArmed, setClearArmed] = useState(false)
      const [login, setLogin] = useState(null)
      const [loginRegion, setLoginRegion] = useState('cn')

      const applyStatus = useCallback((value) => {
        setStatus(value)
        setForm((current) => ({
          token: current.token,
          uid: current.uid !== '' ? current.uid : (value?.uid ?? ''),
          enterpriseId: current.enterpriseId !== '' ? current.enterpriseId : (value?.enterpriseId ?? ''),
          domain: current.domain !== '' ? current.domain : (value?.domain ?? ''),
        }))
      }, [])

      const refresh = useCallback(async () => {
        setBusy('status')
        try {
          applyStatus(await call('status'))
          setMessage(null)
        } catch (error) {
          setMessage({ kind: 'error', text: `${tr('statusError')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }, [applyStatus, tr])

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
              applyStatus(value.state ?? (await call('status')))
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
      }, [login?.loginId, login?.status, applyStatus])

      const onSave = async () => {
        if (form.token.trim() === '') {
          setMessage({ kind: 'error', text: tr('missingToken') })
          return
        }
        setBusy('save')
        setMessage(null)
        try {
          applyStatus(
            await call('save', {
              token: form.token.trim(),
              uid: form.uid.trim(),
              enterpriseId: form.enterpriseId.trim(),
              domain: form.domain.trim(),
            }),
          )
          setForm((current) => ({ ...current, token: '' }))
          setTokenVisible(false)
          setClearArmed(false)
          setMessage({ kind: 'ok', text: tr('savedOk') })
        } catch (error) {
          setMessage({ kind: 'error', text: `${tr('saveError')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }

      const onTest = async () => {
        setBusy('test')
        setMessage(null)
        try {
          const result = await call('test', {
            token: form.token.trim(),
            uid: form.uid.trim(),
            enterpriseId: form.enterpriseId.trim(),
            domain: form.domain.trim(),
          })
          setMessage({ kind: result.connected ? 'ok' : 'error', text: result.message })
          try {
            applyStatus(await call('status'))
          } catch {
            // Status is a convenience; the probe result is what matters here.
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
          const value = await call('clear')
          applyStatus(value)
          setForm((current) => ({ ...current, token: '' }))
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

      const sourceKey =
        status?.source === 'file'
          ? 'sourceFile'
          : status?.source === 'saved'
            ? 'sourceSaved'
            : status?.source === 'token'
              ? 'sourceToken'
              : 'sourceNone'
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
          h(
            'div',
            { className: 'wb-head' },
            h('h3', { className: 'wb-card-title' }, tr('statusTitle')),
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
          ),
          status === null
            ? h('p', { className: 'wb-empty' }, busy === 'status' ? tr('loading') : tr('noStatus'))
            : h(
                'div',
                { className: 'wb-grid' },
                ...[
                  row(tr('state'), status.signedIn ? tr('signedIn') : tr('notSignedIn')),
                  row(tr('source'), tr(sourceKey)),
                  status.uid !== '' ? row(tr('account'), status.uid, true) : null,
                  status.enterpriseName !== '' || status.uid !== ''
                    ? row(tr('enterprise'), status.enterpriseName || status.enterpriseId || '—')
                    : null,
                  row(tr('expiry'), expiry),
                  row(tr('gateway'), status.baseURL, true),
                  row(tr('models'), String(status.modelCount ?? 0)),
                  status.authFile !== '' ? row(tr('authFile'), status.authFile, true) : null,
                ].filter(Boolean)),
          status?.source === 'saved' ? h('p', { className: 'wb-note' }, tr('savedNote')) : null,
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
        h(
          'section',
          { className: 'wb-card' },
          h('h3', { className: 'wb-card-title' }, tr('formTitle')),
          h('p', { className: 'wb-hint' }, tr('hintFile')),
          h(
            'div',
            { className: 'wb-form' },
            h(
              'label',
              { className: 'wb-field' },
              h('span', { className: 'wb-label' }, tr('tokenLabel')),
              h('input', {
                className: 'wb-input wb-mono',
                type: tokenVisible ? 'text' : 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: tr('tokenPlaceholder'),
                value: form.token,
                onChange: (event) => setForm((current) => ({ ...current, token: event.target.value })),
              }),
            ),
            h('p', { className: 'wb-hint' }, tr('formHint')),
            h(
              'button',
              {
                type: 'button',
                className: 'wb-link',
                onClick: () => setTokenVisible((visible) => !visible),
              },
              tokenVisible ? tr('hideToken') : tr('showToken'),
            ),
            h(
              'div',
              { className: 'wb-row' },
              h(
                'label',
                { className: 'wb-field' },
                h('span', { className: 'wb-label' }, tr('uidLabel')),
                h('input', {
                  className: 'wb-input',
                  type: 'text',
                  autoComplete: 'off',
                  placeholder: tr('uidPlaceholder'),
                  value: form.uid,
                  onChange: (event) => setForm((current) => ({ ...current, uid: event.target.value })),
                }),
              ),
              h(
                'label',
                { className: 'wb-field' },
                h('span', { className: 'wb-label' }, tr('enterpriseLabel')),
                h('input', {
                  className: 'wb-input',
                  type: 'text',
                  autoComplete: 'off',
                  placeholder: tr('enterprisePlaceholder'),
                  value: form.enterpriseId,
                  onChange: (event) => setForm((current) => ({ ...current, enterpriseId: event.target.value })),
                }),
              ),
            ),
            h(
              'label',
              { className: 'wb-field' },
              h('span', { className: 'wb-label' }, tr('domainLabel')),
              h('input', {
                className: 'wb-input',
                type: 'text',
                autoComplete: 'off',
                placeholder: tr('domainPlaceholder'),
                value: form.domain,
                onChange: (event) => setForm((current) => ({ ...current, domain: event.target.value })),
              }),
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
                    void onSave()
                  },
                },
                busy === 'save' ? tr('saving') : tr('save'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wb-btn',
                  disabled: busy !== '',
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
                  disabled: busy !== '',
                  onClick: () => {
                    void onClear()
                  },
                },
                clearArmed ? tr('confirmClear') : tr('clear'),
              ),
            ),
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
