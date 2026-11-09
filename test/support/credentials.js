/**
 * Saved-token credential helpers for the shim and adapter tests.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkBuddyCredentials } from '../../lib/credentials.js'
import { TokenStore } from '../../lib/token-store.js'

/**
 * Create credentials backed by a browser-login token in a temp store.
 *
 * @param {string} baseURL - Gateway override.
 * @param {Record<string, unknown>} [record] - Token record overrides.
 * @returns {WorkBuddyCredentials} Credentials.
 */
export function savedCredentials(baseURL, record = {}) {
  const store = new TokenStore({
    path: join(mkdtempSync(join(tmpdir(), 'dsh-workbuddy-support-')), 'tokens.json'),
  })
  store.save({
    token: 'upstream-token',
    uid: 'user-1',
    enterpriseId: 'ent-1',
    domain: 'www.codebuddy.cn',
    ...record,
  })
  return new WorkBuddyCredentials({ savedStore: store, baseURL })
}

/**
 * Create credentials with an empty store.
 *
 * @returns {WorkBuddyCredentials} Credentials.
 */
export function emptyCredentials() {
  const store = new TokenStore({
    path: join(mkdtempSync(join(tmpdir(), 'dsh-workbuddy-empty-')), 'tokens.json'),
  })
  return new WorkBuddyCredentials({ savedStore: store })
}
