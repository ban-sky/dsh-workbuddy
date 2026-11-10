import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClock, parseInstant, resolvePromotion, resolveSchedule } from '../lib/promotions.js'

const shanghaiNight = {
  timezone: 'Asia/Shanghai',
  daily: [{ start: '23:00', end: '7:50' }],
}

test('parseClock accepts HH:mm and rejects impossible clocks', () => {
  assert.equal(parseClock('23:00'), 1380)
  assert.equal(parseClock('7:50'), 470)
  assert.equal(parseClock('24:00'), undefined)
  assert.equal(parseClock('12:60'), undefined)
  assert.equal(parseClock(1200), undefined)
})

test('resolveSchedule treats a night window as active across midnight', () => {
  const late = resolveSchedule(shanghaiNight, Date.parse('2026-11-10T23:30:00+08:00'))
  assert.equal(late.status, 'active')
  assert.deepEqual(late.daily, ['23:00–07:50'])
  const early = resolveSchedule(shanghaiNight, Date.parse('2026-11-10T02:00:00+08:00'))
  assert.equal(early.status, 'active')
  const morning = resolveSchedule(shanghaiNight, Date.parse('2026-11-10T08:00:00+08:00'))
  assert.equal(morning.status, 'outside')
})

test('resolveSchedule reports upcoming and ended absolute windows', () => {
  const schedule = { validFrom: '2026-11-12T00:00:00+08:00', validUntil: '2026-11-16T00:00:00+08:00' }
  assert.equal(resolveSchedule(schedule, Date.parse('2026-11-10T00:00:00+08:00')).status, 'upcoming')
  assert.equal(resolveSchedule(schedule, Date.parse('2026-11-17T00:00:00+08:00')).status, 'ended')
  assert.equal(resolveSchedule(schedule, Date.parse('2026-11-13T00:00:00+08:00')).status, 'active')
})

test('resolvePromotion prefers an active badge over an upcoming one', () => {
  const now = Date.parse('2026-11-10T00:00:00+08:00')
  const promotions = [
    { id: 'future', modelIds: ['glm-5.3'], badge: { label: '即将开始' }, schedule: { validFrom: '2026-12-01T00:00:00+08:00' } },
    { id: 'active', modelIds: ['glm-5.3'], badge: { label: '限时免费' }, schedule: { validUntil: '2026-11-16T00:00:00+08:00' } },
    { id: 'other', modelIds: ['kimi-k2.8'], badge: { label: '夜间折扣' } },
    { id: 'disabled', modelIds: ['glm-5.3'], badge: { label: '隐藏' }, enabled: false },
  ]
  const chosen = resolvePromotion(promotions, 'glm-5.3', now)
  assert.equal(chosen.promotion.id, 'active')
  assert.equal(chosen.state.status, 'active')
  assert.equal(resolvePromotion(promotions, 'unknown', now), undefined)
})
