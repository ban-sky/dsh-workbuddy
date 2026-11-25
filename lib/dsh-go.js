/**
 * DSH Go (the phone app) contributions for the WorkBuddy panel.
 *
 * DSH Go renders plugin UI from a declarative view document (v2) that binds to
 * a data object pushed by the host half. The host half reaches it through the
 * `dshGo` service (`panel`, `strip`, `turnNote`), which only exists when the
 * app's bridge is installed — on a desktop-only host `ctx.inject(['dshGo'])`
 * simply never runs and the web panel is unaffected.
 *
 * This module stays pure: it builds the view document and maps one snapshot to
 * the data object. Fetching stays in `index.js`, next to the same services the
 * web route uses, so both surfaces show the same numbers.
 *
 * @module @ban-sky/dsh-workbuddy/dsh-go
 */

/** Panel id, matching `dshGo.contributes.panels[].id`. */
export const GO_PANEL_ID = 'workbuddy'

/** Composer strip id, matching `dshGo.contributes['composer.strip'][].id`. */
export const GO_STRIP_ID = 'workbuddy-credits'

/** Card accent colours understood by the app. */
const COLORS = Object.freeze({ account: 'blue', credits: 'teal', usage: 'green', streak: 'orange' })

/** Words for both app locales. */
const WORDS = Object.freeze({
  zh: {
    title: 'WorkBuddy',
    account: '账号',
    credits: '积分',
    usage: '本机用量',
    streak: '连续登录',
    name: '当前账号',
    signedIn: '登录状态',
    signedInYes: '已登录',
    signedInNo: '未登录',
    total: '可用积分',
    expiring: '即将到期',
    input: '输入',
    cached: '缓存命中',
    uncached: '未缓存输入',
    output: '输出',
    spent: '已用积分',
    days: '连续天数',
    today: '今日',
    todayYes: '已计入',
    todayNo: '还没计入',
    todayUnknown: '未知',
    nextTier: '下一档',
    makeup: '补登卡',
    tierCol: ['档位', '奖励', '状态'],
    tierLocked: '未达成',
    tierAvailable: '可兑换',
    tierRedeemed: '已兑换',
    refresh: '刷新',
    claimGift: '领福利',
    redeem: '兑换',
    updated: '更新于',
    noAccount: '未登录 WorkBuddy',
    strip: (total) => `WorkBuddy ${total} 分`,
    done: '已刷新',
    claimed: '已领取',
    redeemed: '已兑换',
    locked: '还不能兑换',
    failed: '操作失败，请重试',
    daysLeft: (n) => `再登录 ${n} 天`,
  },
  en: {
    title: 'WorkBuddy',
    account: 'Account',
    credits: 'Credits',
    usage: 'Local usage',
    streak: 'Daily streak',
    name: 'Account',
    signedIn: 'Status',
    signedInYes: 'Signed in',
    signedInNo: 'Signed out',
    total: 'Available',
    expiring: 'Expiring soon',
    input: 'Input',
    cached: 'Cache hits',
    uncached: 'Uncached input',
    output: 'Output',
    spent: 'Credits used',
    days: 'Streak',
    today: 'Today',
    todayYes: 'counted',
    todayNo: 'not yet',
    todayUnknown: 'unknown',
    nextTier: 'Next tier',
    makeup: 'Make-up cards',
    tierCol: ['Tier', 'Reward', 'State'],
    tierLocked: 'Locked',
    tierAvailable: 'Claimable',
    tierRedeemed: 'Claimed',
    refresh: 'Refresh',
    claimGift: 'Claim bonus',
    redeem: 'Redeem',
    updated: 'Updated',
    noAccount: 'WorkBuddy is not signed in',
    strip: (total) => `WorkBuddy ${total} cr`,
    done: 'Refreshed',
    claimed: 'Claimed',
    redeemed: 'Redeemed',
    locked: 'Not unlocked yet',
    failed: 'Failed, please retry',
    daysLeft: (n) => `${n} more days`,
  },
})

/**
 * Pick the word set for one app locale.
 *
 * @param {string} [locale] - `zh` or `en`.
 * @returns {typeof WORDS.zh} Words.
 */
export function goWords(locale) {
  return String(locale ?? '').startsWith('en') ? WORDS.en : WORDS.zh
}

/**
 * Format a credit count without trailing zeros.
 *
 * @param {number} value - Credit amount.
 * @returns {string} Display string.
 */
export function formatCredits(value) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  if (Math.abs(value) < 0.01) return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Format a token count compactly for a phone-sized strip.
 *
 * Token totals run into the millions, and a full `18,900,000` would push the
 * strip past the app's width budget, so large counts collapse to `18.9M`.
 *
 * @param {number} value - Token count.
 * @returns {string} Display string.
 */
export function formatTokens(value) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const shorten = (divisor, suffix) => `${(value / divisor).toFixed(1).replace(/\.0$/, '')}${suffix}`
  if (abs >= 1_000_000_000) return shorten(1_000_000_000, 'B')
  if (abs >= 1_000_000) return shorten(1_000_000, 'M')
  if (abs >= 10_000) return shorten(1_000, 'k')
  return Math.round(value).toLocaleString('en-US')
}

/**
 * Describe one tier reward in a few characters.
 *
 * @param {{credit: number, energy: number, cards: number, chances: number}} tier - Tier row.
 * @param {string} [locale] - App locale.
 * @returns {string} Reward summary.
 */
export function tierReward(tier, locale = 'zh') {
  const english = String(locale).startsWith('en')
  const parts = []
  if (tier.credit > 0) parts.push(`${tier.credit} ${english ? 'cr' : '积分'}`)
  if (tier.energy > 0) parts.push(`${tier.energy} ${english ? 'energy' : '能量'}`)
  if (tier.cards > 0) parts.push(`${tier.cards} ${english ? 'card' : '补登卡'}`)
  if (tier.chances > 0) parts.push(`${tier.chances} ${english ? 'draw' : '抽奖'}`)
  return parts.length === 0 ? '—' : parts.join(' · ')
}

/**
 * Build the panel's data object from one snapshot.
 *
 * Every value is already display-ready, so the view document stays static and
 * the bridge only ships a small patch when numbers change.
 *
 * @param {object} snapshot - Latest readings.
 * @param {{signedIn: boolean, nickname?: string, activeAccountId?: string}} [snapshot.status] - Credential status.
 * @param {{total: number, expiringSoon?: number, packages?: ReadonlyArray<object>}} [snapshot.credits] - Credit balance.
 * @param {{totals?: Record<string, number>}} [snapshot.usage] - Local usage ledger view.
 * @param {object} [snapshot.growth] - `growthPayload` result.
 * @param {string} [locale] - App locale.
 * @returns {Record<string, unknown>} Bound data.
 */
export function goData(snapshot, locale = 'zh') {
  const w = goWords(locale)
  const status = snapshot?.status ?? {}
  const credits = snapshot?.credits ?? {}
  const totals = snapshot?.usage?.totals ?? {}
  const growth = snapshot?.growth ?? {}
  const streak = growth.supported === true ? growth.streak ?? {} : {}
  const tiers = growth.supported === true && Array.isArray(growth.tiers) ? growth.tiers : []
  const today = growth.supported === true ? growth.today ?? {} : {}

  const signedIn = status.signedIn === true
  const todayText = today.counted === true ? w.todayYes : today.counted === false ? w.todayNo : w.todayUnknown
  const nextTier = typeof streak.nextTier === 'string' && streak.nextTier !== '' ? streak.nextTier : ''
  const nextTierText =
    nextTier === ''
      ? '—'
      : `${nextTier} · ${w.daysLeft(Number.isFinite(streak.nextTierRemaining) ? streak.nextTierRemaining : 0)}`

  return {
    signedIn,
    accountName: signedIn ? (typeof status.nickname === 'string' && status.nickname !== '' ? status.nickname : (status.activeAccountId ?? '')) : w.noAccount,
    statusText: signedIn ? w.signedInYes : w.signedInNo,
    creditTotal: formatCredits(Number.isFinite(credits.total) ? credits.total : Number.NaN),
    creditExpiring: Number.isFinite(credits.expiringSoon) && credits.expiringSoon > 0 ? formatCredits(credits.expiringSoon) : '—',
    input: formatTokens(totals.promptTokens),
    cached: formatTokens(totals.cachedTokens),
    uncached: formatTokens(totals.uncachedTokens),
    output: formatTokens(totals.completionTokens),
    spent: formatCredits(totals.credits),
    streakDays: String(Number.isFinite(streak.days) ? streak.days : 0),
    todayText,
    nextTierText,
    makeup: growth.supported === true ? `${growth.cards?.balance ?? 0} / ${growth.cards?.max ?? 0}` : '—',
    tiers: tiers.map((tier) => [
      `${tier.tier} · ${tier.days}d`,
      tierReward(tier, locale),
      tier.state === 'available' ? w.tierAvailable : tier.state === 'redeemed' ? w.tierRedeemed : w.tierLocked,
    ]),
    updated: `${w.updated} ${new Date().toLocaleTimeString(locale.startsWith?.('en') ? 'en-GB' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    growthSupported: growth.supported === true,
  }
}

/**
 * Build the declarative view document (schema v2).
 *
 * @param {string} [locale] - App locale.
 * @returns {object} View document.
 */
export function goView(locale = 'zh') {
  const w = goWords(locale)
  const card = (key, children) => ({
    type: 'stack',
    style: { card: 'tinted', background: COLORS[key], padding: 'M', gap: 'S' },
    children,
  })
  const row = (label, value) => ({ label, value: { $: value } })
  const kv = (items) => ({ type: 'keyValue', items })

  return {
    v: 2,
    accent: 'app',
    type: 'stack',
    style: { gap: 'M' },
    children: [
      { type: 'text', text: w.title, style: { size: 'title', weight: 'bold' } },
      card('account', [
        kv([row(w.name, 'data.accountName'), row(w.signedIn, 'data.statusText')]),
      ]),
      card('credits', [
        { type: 'text', text: w.total, style: { size: 'caption', color: 'gray' } },
        { type: 'text', text: { $: 'data.creditTotal' }, style: { size: 'title', weight: 'bold' } },
        kv([row(w.expiring, 'data.creditExpiring')]),
      ]),
      card('usage', [
        kv([
          row(w.input, 'data.input'),
          row(w.cached, 'data.cached'),
          row(w.uncached, 'data.uncached'),
          row(w.output, 'data.output'),
          row(w.spent, 'data.spent'),
        ]),
      ]),
      card('streak', [
        kv([
          row(w.days, 'data.streakDays'),
          row(w.today, 'data.todayText'),
          row(w.nextTier, 'data.nextTierText'),
          row(w.makeup, 'data.makeup'),
        ]),
        {
          type: 'table',
          columns: [w.tierCol[0], w.tierCol[1], { label: w.tierCol[2], align: 'end' }],
          rows: { $: 'data.tiers' },
        },
      ]),
      {
        type: 'actions',
        items: [
          { label: w.refresh, action: 'refresh', icon: 'refresh' },
          { label: w.claimGift, action: 'claim-gift', icon: 'money' },
          { label: `${w.redeem} 7d`, action: 'redeem-7d', icon: 'check' },
          { label: `${w.redeem} 14d`, action: 'redeem-14d', icon: 'check' },
          { label: `${w.redeem} 28d`, action: 'redeem-28d', icon: 'check' },
        ],
      },
      { type: 'text', text: { $: 'data.updated' }, tone: 'muted', style: { size: 'caption' } },
    ],
  }
}

/**
 * Composer strip content.
 *
 * @param {object} snapshot - One snapshot (see {@link goData}).
 * @param {string} [locale] - App locale.
 * @returns {{text: string, icon: string}} Strip payload.
 */
export function goStrip(snapshot, locale = 'zh') {
  const w = goWords(locale)
  const total = snapshot?.credits?.total
  if (!Number.isFinite(total)) return { text: 'WorkBuddy —', icon: 'chart' }
  return { text: w.strip(formatCredits(total)), icon: 'chart' }
}
