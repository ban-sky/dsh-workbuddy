/**
 * Read the account hints that WorkBuddy puts in its access token.
 *
 * The cloud gateway expects `x-user-id`, `x-enterprise-id` and `x-tenant-id`
 * headers next to the bearer token. A token copied from the desktop app (or
 * obtained through the web login) always carries those values in its JWT
 * claims, so they do not have to be typed into the settings page.
 *
 * @module @ban-sky/dsh-workbuddy/jwt
 */

/**
 * Decode the payload of a JWT without verifying it.
 *
 * Verification is the gateway's job; this only reads hints the gateway itself
 * issued. Anything that is not a well-formed three-part JWT yields undefined.
 *
 * @param {string} token - Access token.
 * @returns {Record<string, unknown> | undefined} Claims, or undefined.
 */
export function decodeJwtClaims(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    const claims = JSON.parse(json)
    return claims !== null && typeof claims === 'object' && !Array.isArray(claims)
      ? /** @type {Record<string, unknown>} */ (claims)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Normalize a domain or issuer URL to a bare host name.
 *
 * @param {unknown} value - Domain, URL, or empty value.
 * @returns {string} Host name, or an empty string.
 */
export function normalizeDomain(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') return ''
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`)
    return url.hostname
  } catch {
    return text.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '')
  }
}

/**
 * Read the account hints from a WorkBuddy access token.
 *
 * @param {string} token - Access token, possibly not a JWT.
 * @returns {{ uid: string, enterpriseId: string, tenantId: string, domain: string, nickname: string, expiresAt: number }} Hints; empty strings when unavailable.
 */
export function tokenClaims(token) {
  const claims = decodeJwtClaims(token)
  if (claims === undefined) {
    return { uid: '', enterpriseId: '', tenantId: '', domain: '', nickname: '', expiresAt: 0 }
  }
  const text = (...keys) => {
    for (const key of keys) {
      const value = claims[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
    return ''
  }
  const rawExpiry = claims.exp
  const seconds = typeof rawExpiry === 'number' ? rawExpiry : typeof rawExpiry === 'string' ? Number(rawExpiry) : 0
  const expiresAt = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds > 1e12 ? seconds : seconds * 1000) : 0
  return {
    uid: text('sub', 'uid', 'user_id', 'userId'),
    enterpriseId: text('enterprise_id', 'enterpriseId', 'ent_id', 'entId'),
    tenantId: text('tenant_id', 'tenantId', 'tenant'),
    domain: normalizeDomain(text('domain', 'iss')),
    nickname: text('nickname', 'name', 'user_name', 'userName'),
    expiresAt,
  }
}
