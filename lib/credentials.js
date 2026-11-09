/**
 * WorkBuddy / CodeBuddy desktop credentials.
 *
 * The desktop app writes its sign-in to a `*.info` JSON document inside
 * `CodeBuddyExtension/Data/Public/auth`. This module locates that file, reads
 * the access/refresh tokens, refreshes an expiring token against the same
 * endpoint the app's own client uses, and builds the request headers the
 * upstream chat endpoint expects.
 *
 * Two credential sources are supported:
 * 1. the desktop app's auth file (default; keeps working across app sign-ins), and
 * 2. a manually supplied access token (`config.token` / `WORKBUDDY_TOKEN`).
 *
 * The auth file is read-only by default. A refresh result is kept in memory for
 * the process lifetime; `writeBack` opts in to atomically replacing the app's
 * auth document, and is off because two clients refreshing the same rotating
 * refresh token can sign each other out.
 *
 * @module @ban-sky/dsh-workbuddy/credentials
 */

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** Environment variable that points at an explicit auth document. */
export const AUTH_FILE_ENV = 'WORKBUDDY_AUTH_FILE'

/** Environment variable that supplies a manual access token. */
export const AUTH_TOKEN_ENV = 'WORKBUDDY_TOKEN'

/** CN chat gateway (the CodeBuddy / WorkBuddy backend). */
export const CN_BASE_URL = 'https://copilot.tencent.com'

/** International chat gateway. */
export const GLOBAL_BASE_URL = 'https://www.workbuddy.ai'

/** Domain the CN app writes when the account carries none. */
export const DEFAULT_DOMAIN = 'www.codebuddy.cn'

/** Header identity; the upstream accepts a plain client string. */
export const CLIENT_USER_AGENT = 'dsh-workbuddy/0.1.0 (CodeBuddy compatible)'

/** Read the access token no earlier than this many ms before expiry. */
const REFRESH_GRACE_MS = 60_000

/**
 * Credential failure with a human-facing reason and a stable kind.
 *
 * Kinds are consumed by the plugin's diagnostics and tests; they are not sent
 * to the upstream.
 */
export class CredentialError extends Error {
  /**
   * @param {string} message - Human-facing explanation.
   * @param {string} kind - `missing` | `encrypted` | `malformed` | `refresh-failed` | `expired`.
   * @param {ErrorOptions} [options] - Standard error options.
   */
  constructor(message, kind, options) {
    super(message, options)
    this.name = 'CredentialError'
    this.kind = kind
  }
}

/**
 * Expand a leading `~` and make the path absolute.
 *
 * @param {string} path - Input path.
 * @param {string} [home] - Home directory override (tests).
 * @returns {string} Absolute path.
 */
export function expandPath(path, home = homedir()) {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return isAbsolute(path) ? path : resolve(path)
}

/**
 * Candidate auth directories for this platform, most specific first.
 *
 * @param {object} [env] - Environment-like object.
 * @param {string} [platform] - `process.platform` override.
 * @param {string} [home] - Home directory override.
 * @returns {string[]} Directories that may contain the auth documents.
 */
export function authDirectories(env = process.env, platform = process.platform, home = homedir()) {
  const suffix = ['CodeBuddyExtension', 'Data', 'Public', 'auth']
  if (platform === 'darwin') {
    return [join(home, 'Library', 'Application Support', ...suffix)]
  }
  if (platform === 'win32') {
    const dirs = []
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    const roaming = env.APPDATA ?? join(home, 'AppData', 'Roaming')
    dirs.push(join(local, ...suffix), join(roaming, ...suffix))
    return dirs
  }
  const xdg = env.XDG_DATA_HOME ?? join(home, '.local', 'share')
  return [join(xdg, ...suffix), join(home, '.config', ...suffix)]
}

/**
 * Resolve the auth document to read.
 *
 * Precedence: explicit option, then {@link AUTH_FILE_ENV}, then the platform
 * directories. Within a directory the WorkBuddy document is preferred over a
 * CodeBuddy one, then the first `*.info` by name.
 *
 * @param {object} [options] - Discovery inputs.
 * @param {string} [options.authFile] - Explicit path from plugin config.
 * @param {object} [options.env] - Environment-like object.
 * @param {string} [options.platform] - `process.platform` override.
 * @param {string} [options.home] - Home directory override.
 * @returns {string | undefined} Absolute path of an existing auth document.
 */
export function findAuthFile(options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const explicit = options.authFile?.trim()
  if (explicit) return expandPath(explicit, home)
  const fromEnv = env[AUTH_FILE_ENV]?.trim()
  if (fromEnv) return expandPath(fromEnv, home)
  for (const directory of authDirectories(env, platform, home)) {
    const found = pickAuthDocument(directory)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Pick the preferred `*.info` document inside one directory.
 *
 * @param {string} directory - Candidate directory.
 * @returns {string | undefined} Chosen document path.
 */
export function pickAuthDocument(directory) {
  if (!existsSync(directory)) return undefined
  let entries
  try {
    entries = readdirSync(directory).filter((name) => name.endsWith('.info'))
  } catch {
    return undefined
  }
  if (entries.length === 0) return undefined
  const rank = (name) => {
    const lower = name.toLowerCase()
    if (lower.includes('workbuddy')) return 0
    if (lower.includes('codebuddy')) return 1
    return 2
  }
  entries.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return join(directory, entries[0])
}

/**
 * Normalize an expiry timestamp to milliseconds.
 *
 * WorkBuddy clients write both seconds and milliseconds depending on version;
 * anything below 10^12 is treated as seconds.
 *
 * @param {unknown} value - Raw `expiresAt` / `expiresIn` field.
 * @returns {number} Epoch milliseconds, or 0 when absent.
 */
export function expiryToMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
}

/**
 * Whether an auth document is an encrypted envelope rather than plain JSON.
 *
 * Recent desktop builds may encrypt individual token fields at rest
 * (`{suite,keyId,nonce,authTag,ciphertext}`), which only the app's Electron
 * `safeStorage` helper can open. The plugin reports this instead of guessing.
 *
 * @param {unknown} value - Parsed document or token field.
 * @returns {boolean} True when the value looks encrypted.
 */
export function isEncryptedDocument(value) {
  if (typeof value !== 'object' || value === null) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  if (record.encrypted === true) return true
  return typeof record.ciphertext === 'string' && typeof record.nonce === 'string'
}

/**
 * Parse a WorkBuddy auth document in either the nested OAuth shape or the flat
 * panel shape.
 *
 * @param {unknown} document - Parsed JSON document.
 * @returns {{ accessToken: string, refreshToken: string, expiresAt: number, domain: string, uid: string, enterpriseId: string, nickname: string, enterpriseName: string }} Normalized credential.
 * @throws {CredentialError} When the document is malformed or encrypted.
 */
export function parseAuthDocument(document) {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new CredentialError('WorkBuddy 登录文件不是 JSON 对象', 'malformed')
  }
  if (isEncryptedDocument(document)) {
    throw new CredentialError(
      'WorkBuddy 登录文件已加密（Electron safeStorage），无法直接读取。请在插件配置里填入 accessToken，或把 WORKBUDDY_AUTH_FILE 指向桌面端导出的明文 auth 文件。',
      'encrypted',
    )
  }
  const record = /** @type {Record<string, any>} */ (document)
  const nested = record.auth
  const auth = typeof nested === 'object' && nested !== null ? nested : record
  if (isEncryptedDocument(auth)) {
    throw new CredentialError(
      'WorkBuddy 登录文件中的令牌已加密（Electron safeStorage），无法直接读取。请在插件配置里填入 accessToken。',
      'encrypted',
    )
  }
  if (isEncryptedDocument(auth.accessToken)) {
    throw new CredentialError(
      'WorkBuddy accessToken 字段已加密（Electron safeStorage），无法直接读取。请在插件配置里填入 accessToken。',
      'encrypted',
    )
  }
  const accessToken = typeof auth.accessToken === 'string' ? auth.accessToken.trim() : ''
  if (accessToken === '') {
    throw new CredentialError('WorkBuddy 登录文件里没有 accessToken', 'malformed')
  }
  const account = typeof record.account === 'object' && record.account !== null ? record.account : {}
  const expiresAt = expiryToMs(auth.expiresAt)
  return {
    accessToken,
    refreshToken: typeof auth.refreshToken === 'string' ? auth.refreshToken : '',
    expiresAt,
    domain: typeof auth.domain === 'string' && auth.domain !== '' ? auth.domain : DEFAULT_DOMAIN,
    uid: typeof account.uid === 'string' ? account.uid : typeof auth.uid === 'string' ? auth.uid : '',
    enterpriseId:
      typeof account.enterpriseId === 'string'
        ? account.enterpriseId
        : typeof auth.enterpriseId === 'string'
          ? auth.enterpriseId
          : '',
    nickname: typeof account.nickname === 'string' ? account.nickname : '',
    enterpriseName: typeof account.enterpriseName === 'string' ? account.enterpriseName : '',
  }
}

/**
 * Decide the WorkBuddy region for a domain.
 *
 * @param {string} domain - Account domain or configured region marker.
 * @returns {'cn' | 'global'} Region.
 */
export function regionOf(domain) {
  const lowered = domain.trim().toLowerCase()
  if (lowered === 'workbuddy.ai' || lowered.endsWith('.workbuddy.ai')) return 'global'
  return 'cn'
}

/**
 * Resolve the chat gateway for a credential or explicit override.
 *
 * @param {object} options - Resolution inputs.
 * @param {string} [options.baseURL] - Explicit gateway from plugin config.
 * @param {string} [options.region] - `auto`, `cn`, or `global`.
 * @param {string} [options.domain] - Credential domain.
 * @returns {string} Gateway origin without a trailing slash.
 */
export function resolveBaseURL({ baseURL, region, domain }) {
  const explicit = baseURL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const effective = region === 'cn' || region === 'global' ? region : regionOf(domain ?? '')
  return effective === 'global' ? GLOBAL_BASE_URL : CN_BASE_URL
}

/**
 * Live WorkBuddy credential: the source file/token, the current access token,
 * and a single-flight refresh.
 */
export class WorkBuddyCredentials {
  /**
   * @param {object} options - Credential options.
   * @param {string} [options.authFile] - Explicit auth document.
   * @param {string} [options.token] - Manual access token.
   * @param {string} [options.uid] - Manual account id.
   * @param {string} [options.enterpriseId] - Manual enterprise id.
   * @param {string} [options.domain] - Manual domain.
   * @param {string} [options.baseURL] - Explicit gateway origin.
   * @param {'auto' | 'cn' | 'global'} [options.region] - Region override.
   * @param {boolean} [options.writeBack] - Persist refreshed tokens into the auth file.
   * @param {((message: string) => void)} [options.onWarning] - Diagnostic sink.
   * @param {object} [options.env] - Environment-like object.
   * @param {string} [options.platform] - Platform override.
   * @param {string} [options.home] - Home directory override.
   * @param {typeof fetch} [options.fetch] - Fetch implementation.
   */
  constructor(options = {}) {
    this.env = options.env ?? process.env
    this.platform = options.platform ?? process.platform
    this.home = options.home ?? homedir()
    this.fetch = options.fetch ?? globalThis.fetch
    this.onWarning = options.onWarning ?? (() => {})

    this.manualToken = (options.token ?? this.env[AUTH_TOKEN_ENV] ?? '').trim()
    this.manualTokenMode = this.manualToken !== ''
    this.uid = (options.uid ?? '').trim()
    this.enterpriseId = (options.enterpriseId ?? '').trim()
    this.domain = (options.domain ?? '').trim()
    this.explicitBaseURL = options.baseURL?.trim() ?? ''
    this.region = options.region ?? 'auto'
    this.writeBack = options.writeBack === true
    this.authFile = findAuthFile({
      authFile: options.authFile,
      env: this.env,
      platform: this.platform,
      home: this.home,
    })

    /** @type {Record<string, any> | undefined} */
    this.document = undefined
    this.documentMtimeMs = 0
    /** @type {Record<string, any> | undefined} */
    this.fileCredential = undefined
    this.source = this.manualTokenMode ? 'token' : this.authFile ? 'file' : 'none'
    /** @type {Promise<void> | undefined} */
    this.refreshing = undefined
  }

  /**
   * Read the auth document again when the file changed on disk, so an app
   * sign-in or the app's own refresh is picked up without restarting DSH.
   *
   * @returns {Record<string, any> | undefined} Current file credential.
   */
  load() {
    if (this.manualTokenMode) {
      this.fileCredential = {
        accessToken: this.manualToken,
        refreshToken: '',
        expiresAt: 0,
        domain: this.domain || DEFAULT_DOMAIN,
        uid: this.uid,
        enterpriseId: this.enterpriseId,
        nickname: '',
        enterpriseName: '',
      }
      return this.fileCredential
    }
    if (!this.authFile) return undefined
    let mtimeMs = 0
    try {
      mtimeMs = statSync(this.authFile).mtimeMs
    } catch {
      return this.fileCredential
    }
    if (this.fileCredential !== undefined && mtimeMs === this.documentMtimeMs) {
      return this.fileCredential
    }
    try {
      const parsed = JSON.parse(readFileSync(this.authFile, 'utf8'))
      this.document = parsed
      this.fileCredential = parseAuthDocument(parsed)
      this.documentMtimeMs = mtimeMs
      this.source = 'file'
      return this.fileCredential
    } catch (error) {
      if (error instanceof CredentialError) {
        this.onWarning(error.message)
        this.fileCredential = undefined
        return undefined
      }
      this.onWarning(
        `无法读取 WorkBuddy 登录文件 ${this.authFile}：${error instanceof Error ? error.message : String(error)}`,
      )
      this.fileCredential = undefined
      return undefined
    }
  }

  /**
   * Whether a token is known (manual or from the auth file).
   *
   * @returns {boolean} True when requests can be signed.
   */
  signedIn() {
    return this.load() !== undefined
  }

  /**
   * Current gateway origin for this credential.
   *
   * @returns {string} Origin without a trailing slash.
   */
  baseURL() {
    const credential = this.load()
    return resolveBaseURL({
      baseURL: this.explicitBaseURL,
      region: this.region,
      domain: credential?.domain ?? this.domain,
    })
  }

  /**
   * Whether the current token is at or past its refresh point. A manual token
   * has no recorded expiry and is never refreshed here.
   *
   * @returns {boolean} True when refresh is due.
   */
  refreshDue() {
    const credential = this.load()
    if (credential === undefined) return false
    if (credential.refreshToken === '') return false
    if (credential.expiresAt === 0) return false
    return Date.now() >= credential.expiresAt - REFRESH_GRACE_MS
  }

  /**
   * Request headers for the current credential, refreshing first when due.
   *
   * @param {object} [options] - Header options.
   * @param {boolean} [options.forceRefresh] - Refresh regardless of expiry.
   * @returns {Promise<Record<string, string>>} Headers including `authorization`.
   * @throws {CredentialError} When no credential is available.
   */
  async headers(options = {}) {
    let credential = this.load()
    if (credential === undefined) {
      throw new CredentialError(
        this.authFile
          ? `WorkBuddy 登录文件 ${this.authFile} 中没有可用的 accessToken。`
          : `未找到 WorkBuddy 登录凭据。请先登录 WorkBuddy 桌面端，或在插件配置中填写 token。`,
        'missing',
      )
    }
    if (options.forceRefresh === true || this.refreshDue()) {
      credential = await this.refresh()
    }
    return this.buildHeaders(credential)
  }

  /**
   * Build the upstream request headers for one credential.
   *
   * @param {NonNullable<WorkBuddyCredentials['fileCredential']>} credential - Credential.
   * @returns {Record<string, string>} Headers.
   */
  buildHeaders(credential) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${credential.accessToken}`,
      'user-agent': CLIENT_USER_AGENT,
      'x-user-id': credential.uid,
      'x-enterprise-id': credential.enterpriseId,
      'x-tenant-id': credential.enterpriseId,
      'x-domain': credential.domain || DEFAULT_DOMAIN,
    }
    return headers
  }

  /**
   * Refresh the access token against the WorkBuddy refresh endpoint.
   *
   * Concurrent callers share one in-flight request. A manual token cannot be
   * refreshed and raises `missing`-style guidance instead of a network call.
   *
   * @param {AbortSignal} [signal] - Cancellation signal.
   * @returns {Promise<NonNullable<WorkBuddyCredentials['fileCredential']>>} Refreshed credential.
   * @throws {CredentialError} When no refresh token exists or the refresh fails.
   */
  async refresh(signal) {
    if (this.refreshing !== undefined) {
      await this.refreshing
      const current = this.load()
      if (current === undefined) throw new CredentialError('WorkBuddy 凭据刷新失败', 'refresh-failed')
      return current
    }
    const credential = this.load()
    if (credential === undefined) {
      throw new CredentialError('未找到 WorkBuddy 登录凭据', 'missing')
    }
    if (credential.refreshToken === '') {
      throw new CredentialError(
        'WorkBuddy 令牌已过期且没有 refreshToken。请在桌面端重新登录，或更新插件里的 token。',
        'expired',
      )
    }
    this.refreshing = this.performRefresh(credential, signal)
    try {
      await this.refreshing
    } finally {
      this.refreshing = undefined
    }
    const refreshed = this.load()
    if (refreshed === undefined) throw new CredentialError('WorkBuddy 凭据刷新失败', 'refresh-failed')
    return refreshed
  }

  /**
   * Perform one refresh request and apply its result.
   *
   * @param {NonNullable<WorkBuddyCredentials['fileCredential']>} credential - Expiring credential.
   * @param {AbortSignal} [signal] - Cancellation signal.
   * @returns {Promise<void>} Resolves after the in-memory token is replaced.
   */
  async performRefresh(credential, signal) {
    const url = `${this.baseURL()}/v2/plugin/auth/token/refresh`
    const headers = {
      ...this.buildHeaders(credential),
      'x-refresh-token': credential.refreshToken,
      'x-auth-refresh-source': 'plugin',
    }
    let response
    try {
      response = await this.fetch(url, { method: 'POST', headers, body: '{}', signal })
    } catch (error) {
      throw new CredentialError(
        `刷新 WorkBuddy 令牌失败：${error instanceof Error ? error.message : String(error)}`,
        'refresh-failed',
        { cause: error },
      )
    }
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new CredentialError(
        `刷新 WorkBuddy 令牌返回了非 JSON 响应（HTTP ${response.status}）`,
        'refresh-failed',
      )
    }
    if (!response.ok || payload?.code !== 0 || typeof payload?.data !== 'object' || payload.data === null) {
      const message =
        payload?.displayMsg?.zh ??
        payload?.displayMsg?.en ??
        payload?.msg ??
        `HTTP ${response.status}`
      throw new CredentialError(`刷新 WorkBuddy 令牌失败：${message}`, 'refresh-failed')
    }
    const data = /** @type {Record<string, any>} */ (payload.data)
    const next = {
      accessToken: typeof data.accessToken === 'string' ? data.accessToken : '',
      refreshToken:
        typeof data.refreshToken === 'string' && data.refreshToken !== ''
          ? data.refreshToken
          : credential.refreshToken,
      expiresAt: expiryToMs(data.expiresAt) || (typeof data.expiresIn === 'number' ? Date.now() + data.expiresIn * 1000 : 0),
      domain: typeof data.domain === 'string' && data.domain !== '' ? data.domain : credential.domain,
      uid: credential.uid,
      enterpriseId: credential.enterpriseId,
      nickname: credential.nickname,
      enterpriseName: credential.enterpriseName,
    }
    if (next.accessToken === '') {
      throw new CredentialError('刷新 WorkBuddy 令牌的响应里没有 accessToken', 'refresh-failed')
    }
    this.fileCredential = next
    if (this.writeBack && this.authFile && this.document !== undefined) {
      this.persist(next)
    }
  }

  /**
   * Write a refreshed token back into the desktop auth document.
   *
   * Best-effort: a failed write is reported as a warning, because the refreshed
   * in-memory token is still usable and the app owns the file.
   *
   * @param {NonNullable<WorkBuddyCredentials['fileCredential']>} credential - Refreshed credential.
   */
  persist(credential) {
    const document = this.document
    if (document === undefined) return
    const auth = typeof document.auth === 'object' && document.auth !== null ? document.auth : document
    auth.accessToken = credential.accessToken
    if (credential.refreshToken !== '') auth.refreshToken = credential.refreshToken
    if (credential.expiresAt > 0) auth.expiresAt = credential.expiresAt
    if (credential.domain !== '') auth.domain = credential.domain
    const temporary = join(dirname(this.authFile), `.${basename(this.authFile)}.${process.pid}.tmp`)
    try {
      writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
      renameSync(temporary, this.authFile)
    } catch (error) {
      this.onWarning(
        `刷新后的 WorkBuddy 令牌未能写回 ${this.authFile}：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Non-secret status for `/health` and logs.
   *
   * @returns {{ signedIn: boolean, source: string, authFile: string, uid: string, nickname: string, enterpriseName: string, expiresAt: number, refreshable: boolean, baseURL: string }} Status.
   */
  status() {
    const credential = this.load()
    return {
      signedIn: credential !== undefined,
      source: credential === undefined ? 'none' : this.manualTokenMode ? 'token' : 'file',
      authFile: this.authFile ?? '',
      uid: credential?.uid ?? '',
      nickname: credential?.nickname ?? '',
      enterpriseName: credential?.enterpriseName ?? '',
      expiresAt: credential?.expiresAt ?? 0,
      refreshable: (credential?.refreshToken ?? '') !== '',
      baseURL: this.baseURL(),
    }
  }
}
