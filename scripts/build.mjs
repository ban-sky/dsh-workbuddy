#!/usr/bin/env node
/**
 * Build the installable plugin tarball.
 *
 * This project ships plain ESM, so "building" means: validate every source
 * file, validate the manifest/locales/icon, then pack the exact `files` list
 * into a tarball plus a SHA-256 sidecar. GitHub Actions runs this same command,
 * and the resulting files are what a release publishes.
 *
 * @module scripts/build
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')

/**
 * Fail the build with one clear message.
 *
 * @param {string} message - Diagnostic.
 * @returns {never} Never returns.
 */
function fail(message) {
  console.error(`build: ${message}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const sources = [
  'index.js',
  'client.js',
  'lib/catalog.js',
  'lib/credentials.js',
  'lib/http.js',
  'lib/jwt.js',
  'lib/oauth.js',
  'lib/shim.js',
  'lib/adapter.js',
  'lib/token-store.js',
]
for (const file of sources) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' })
}

for (const file of readdirSync(join(root, 'locale'))) {
  if (!file.endsWith('.json')) fail(`locale/${file} is not JSON`)
  const document = JSON.parse(readFileSync(join(root, 'locale', file), 'utf8'))
  if (typeof document?.meta?.title !== 'string' || document.meta.title === '') {
    fail(`locale/${file} has no meta.title`)
  }
  if (typeof document?.meta?.description !== 'string' || document.meta.description === '') {
    fail(`locale/${file} has no meta.description`)
  }
}

const iconPath = join(root, 'icon.svg')
if (!existsSync(iconPath)) fail('icon.svg is missing')
if (!readFileSync(iconPath, 'utf8').includes('<svg')) fail('icon.svg is not an SVG document')
if (statSync(iconPath).size > 256 * 1024) fail('icon.svg exceeds the 256 KiB display limit')

if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') fail('package.json does not declare the bundle patch')
if (manifest.dsh?.client?.platform !== 'web') fail('package.json does not declare the web client half')
if (!existsSync(join(root, 'cordis.patch.yml'))) fail('cordis.patch.yml is missing')
const shipped = (path) =>
  manifest.files.some((entry) => {
    if (entry === path) return true
    const glob = /^(.*)\/\*\.(js|json)$/.exec(entry)
    return glob !== null && path.startsWith(`${glob[1]}/`)
  })

for (const required of [...sources, 'locale/zh.json', 'icon.svg', 'README.md', 'LICENSE']) {
  if (!shipped(required)) fail(`package.json "files" does not ship ${required}`)
}

mkdirSync(dist, { recursive: true })
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--pack-destination', dist], { cwd: root, stdio: 'inherit' })

const tarball = readdirSync(dist)
  .filter((name) => name.endsWith('.tgz'))
  .map((name) => join(dist, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
if (tarball === undefined) fail('npm pack produced no tarball')

const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex')
writeFileSync(`${tarball}.sha256`, `${digest}  ${tarball.split('/').pop()}\n`)
console.log(`build: ${tarball}`)
console.log(`build: sha256 ${digest}`)
