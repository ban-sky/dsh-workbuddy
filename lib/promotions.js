/**
 * WorkBuddy promotion and tier badges.
 *
 * The app-channel `/v3/config` document carries `modelPromotions` and
 * `modelTiers` beside `models`. A promotion is a wall-clock window, not a
 * static flag: it can expire at an absolute instant or recur inside a daily
 * window in a named time zone. This module keeps that distinction so the
 * settings table can say "active", "starts at", or "ended" with the same data
 * the desktop app uses.
 *
 * @module @ban-sky/dsh-workbuddy/promotions
 */

/** Levels both DSH and the WorkBuddy wire use. */
export const THINKING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

const DAY_MINUTES = 24 * 60

/**
 * Parse one `HH:mm` clock for a daily window.
 *
 * @param {unknown} value - Wire value.
 * @returns {number | undefined} Minutes after midnight.
 */
export function parseClock(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return hours * 60 + minutes
}

/**
 * Normalize an absolute schedule bound.
 *
 * @param {unknown} value - ISO string or epoch milliseconds.
 * @returns {number | undefined} Epoch milliseconds.
 */
export function parseInstant(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Wall-clock minutes after midnight in one IANA zone.
 *
 * @param {number} nowMs - Epoch milliseconds.
 * @param {string} timezone - IANA zone name.
 * @returns {number} Minutes after midnight.
 */
function zonedMinutes(nowMs, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/**
 * Whether one daily window contains the wall-clock minute.
 *
 * `end <= start` crosses midnight (23:00–7:50).
 *
 * @param {number} minute - Wall-clock minute.
 * @param {number} start - Window start.
 * @param {number} end - Window end (exclusive).
 * @returns {boolean} Whether the minute is inside.
 */
function insideDaily(minute, start, end) {
  if (start === end) return true
  return end > start ? minute >= start && minute < end : minute >= start || minute < end
}

/**
 * Format one daily window for a badge hint.
 *
 * @param {{ start: number, end: number }} window - Parsed window.
 * @returns {string} `23:00–07:50`.
 */
function formatWindow(window) {
  const pad = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return `${pad(window.start)}–${pad(window.end)}`
}

/**
 * Resolve a promotion schedule against the clock.
 *
 * @param {object | undefined} schedule - Wire schedule.
 * @param {number} nowMs - Epoch milliseconds.
 * @returns {{ status: 'active' | 'upcoming' | 'ended' | 'outside' | 'unknown', startsAt?: number, endsAt?: number, daily?: string[], timezone?: string }} Resolved state.
 */
export function resolveSchedule(schedule, nowMs) {
  if (!schedule || typeof schedule !== 'object') return { status: 'active' }
  const timezone = typeof schedule.timezone === 'string' && schedule.timezone !== '' ? schedule.timezone : 'Asia/Shanghai'
  const startsAt = parseInstant(schedule.validFrom)
  const endsAt = parseInstant(schedule.validUntil)
  if (startsAt !== undefined && nowMs < startsAt) return { status: 'upcoming', startsAt, endsAt, timezone }
  if (endsAt !== undefined && nowMs >= endsAt) return { status: 'ended', startsAt, endsAt, timezone }
  const daily = Array.isArray(schedule.daily)
    ? schedule.daily
        .map((window) => ({ start: parseClock(window?.start), end: parseClock(window?.end) }))
        .filter((window) => window.start !== undefined && window.end !== undefined)
    : []
  if (daily.length === 0) return { status: 'active', startsAt, endsAt, timezone }
  let minute
  try {
    minute = zonedMinutes(nowMs, timezone)
  } catch {
    minute = undefined
  }
  if (minute === undefined) return { status: 'unknown', startsAt, endsAt, timezone }
  const active = daily.some((window) => insideDaily(minute, window.start, window.end))
  return {
    status: active ? 'active' : 'outside',
    startsAt,
    endsAt,
    daily: daily.map(formatWindow),
    timezone,
  }
}

/**
 * Pick the promotion that should label one model now.
 *
 * Active promotions beat upcoming ones; within the same state the higher
 * `priority` wins. Entries without a badge or `modelIds` are media metadata,
 * not promotions.
 *
 * @param {ReadonlyArray<object>} promotions - `modelPromotions` array.
 * @param {string} modelId - Model id.
 * @param {number} nowMs - Epoch milliseconds.
 * @returns {object | undefined} The chosen promotion with a `state`.
 */
export function resolvePromotion(promotions, modelId, nowMs) {
  if (!Array.isArray(promotions)) return undefined
  const candidates = promotions
    .filter((promotion) => promotion && promotion.enabled !== false)
    .filter((promotion) => Array.isArray(promotion.modelIds) && promotion.modelIds.includes(modelId))
    .filter((promotion) => promotion.badge && typeof promotion.badge.label === 'string')
    .map((promotion) => ({ promotion, state: resolveSchedule(promotion.schedule, nowMs) }))
    .filter((entry) => entry.state.status === 'active' || entry.state.status === 'upcoming' || entry.state.status === 'outside')
    .sort((left, right) => {
      const rank = (entry) => (entry.state.status === 'active' ? 2 : entry.state.status === 'upcoming' ? 1 : 0)
      return rank(right) - rank(left) || (right.promotion.priority ?? 0) - (left.promotion.priority ?? 0)
    })
  return candidates[0]
}
