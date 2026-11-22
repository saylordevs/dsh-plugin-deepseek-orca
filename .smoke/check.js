// Packaging guard for a DSH bundle. Run with `npm test`.
//
// It checks the things that make a bundle installable by someone else: a public
// package name, a bundle patch that names it, declared compatibility, display
// metadata and its exports, the files that ship, the icon, and — when a plugin
// index exists — an entry for this version with a commit that can be pinned.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const at = (p) => path.join(root, p)
const read = (p) => fs.readFileSync(at(p), 'utf8')
const has = (p) => fs.existsSync(at(p))
const manifest = JSON.parse(read('package.json'))

assert.match(
  manifest.name,
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?dsh-plugin-[a-z0-9._~-]+$/u,
  'name must be a public dsh-plugin-* package name, not @local/*',
)
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, 'version must be SemVer')
assert.equal(manifest.private, undefined, 'a published bundle must not be private')
assert.equal(manifest.type, 'module', 'package must be ESM ("type": "module")')

const patchPath = manifest.dsh?.bundle?.patch
assert.ok(patchPath, 'package.json must declare dsh.bundle.patch')
const patch = read(patchPath)
const quoted = [`'${manifest.name}'`, `"${manifest.name}"`]
assert.ok(
  quoted.some((name) => patch.includes(name)),
  `the bundle patch must insert a row named ${manifest.name}`,
)
const rowId = /-\s+id:\s*['"]?([a-z0-9-]+)['"]?/u.exec(patch)?.[1]
assert.ok(rowId, 'the bundle patch must give its row a kebab-case id')

assert.ok(manifest.engines?.dsh, 'package.json must declare engines.dsh: the DSH range you support')
assert.ok(
  manifest.exports?.['./locale/*.json'],
  'export ./locale/*.json so the plugin page can read meta.title and meta.description',
)
assert.ok(manifest.exports?.['./icon'], 'export ./icon so the plugin page can show the icon')

const shipped = manifest.files ?? []
for (const entry of ['index.js', path.basename(patchPath), 'locale/*.json', 'icon.svg', 'README.md', 'LICENSE']) {
  assert.ok(shipped.includes(entry), `files must include ${entry}`)
}

for (const required of ['index.js', patchPath.replace(/^\.\//u, ''), 'icon.svg', 'README.md', 'LICENSE', 'locale/en.json']) {
  assert.ok(has(required), `missing ${required}`)
}

const iconSize = fs.statSync(at('icon.svg')).size
assert.ok(iconSize <= 256 * 1024, `icon.svg is ${iconSize} bytes; the limit is 256 KiB`)

for (const language of ['en', 'ru']) {
  const file = `locale/${language}.json`
  if (!has(file)) {
    assert.equal(language, 'ru', 'locale/en.json is required')
    continue
  }
  const meta = JSON.parse(read(file)).meta ?? {}
  assert.ok(String(meta.title ?? '').trim(), `${file} needs meta.title`)
  assert.ok(String(meta.description ?? '').trim(), `${file} needs meta.description`)
}

const module = await import(pathToFileURL(at('index.js')).href)
assert.equal(typeof module.apply, 'function', 'index.js must export apply(ctx, config)')

if (has('client.js')) {
  const client = read('client.js')
  const loaderAt = client.indexOf('__ModuleLoader__.load(')
  assert.ok(loaderAt >= 0, 'client.js must register through window.__ModuleLoader__.load')
  const idMatch = /id:\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))/u.exec(client.slice(loaderAt))
  assert.ok(idMatch, 'the client module must register with an id')
  let clientId = idMatch[1] ?? idMatch[2] ?? idMatch[3]
  if (clientId === idMatch[3]) {
    const declaration = new RegExp(`(?:const|let|var)\\s+${clientId}\\s*=\\s*['"]([^'"]+)['"]`, 'u').exec(client)
    assert.ok(declaration, `the id constant ${clientId} must hold a string literal`)
    clientId = declaration[1]
  }
  assert.equal(clientId, manifest.name, 'the client module id must equal the package name')
  assert.ok(manifest.exports?.['./client'], 'export ./client when client.js exists')
  assert.ok(manifest.dsh?.client, 'declare dsh.client when client.js exists')
}

if (has('site/index.json')) {
  const index = JSON.parse(read('site/index.json'))
  assert.equal(index.format, 1, 'the plugin index must use format 1')
  const entry = index.plugins?.find((plugin) => plugin.name === manifest.name)
  assert.ok(entry, `site/index.json must list ${manifest.name}`)
  assert.ok(
    entry.versions.some((version) => version.version === manifest.version),
    `site/index.json must publish ${manifest.version}`,
  )
  for (const version of entry.versions) {
    assert.match(version.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, 'index versions must be SemVer')
    assert.ok(Number.isSafeInteger(version.publishTimestamp), 'index versions need publishTimestamp')
    if (version.source?.type === 'git') {
      assert.match(version.source.commit, /^[0-9a-f]{40}$/u, 'a git index entry needs the full 40-hex commit')
      assert.ok(version.source.url.startsWith('https://'), 'a git index entry needs an https URL')
    }
  }
}

console.log(`ok — ${manifest.name}@${manifest.version} is packaged for publication`)
