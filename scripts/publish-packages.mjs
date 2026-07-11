import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifactsDirectory = join(root, 'package-artifacts')
const registry = 'https://registry.npmjs.org/'
const expectedPackages = [
  { name: '@ultigrid/core', directory: 'packages/core' },
  { name: '@ultigrid/insight', directory: 'packages/insight' },
]

const args = new Set(process.argv.slice(2))
for (const arg of args) {
  if (arg !== '--dry-run') throw new Error(`Unknown option: ${arg}`)
}
const dryRun = args.has('--dry-run')
const artifactManifest = JSON.parse(
  await readFile(join(artifactsDirectory, 'manifest.json'), 'utf8'),
)
if (artifactManifest.schemaVersion !== 1 || artifactManifest.registry !== registry) {
  throw new Error('package-artifacts/manifest.json has an unsupported schema or registry')
}

const recordsByName = new Map()
for (const record of artifactManifest.packages ?? []) {
  if (recordsByName.has(record.name)) throw new Error(`Duplicate artifact: ${record.name}`)
  recordsByName.set(record.name, record)
}

for (const expected of expectedPackages) {
  const record = recordsByName.get(expected.name)
  if (!record) throw new Error(`Missing artifact: ${expected.name}`)
  const localManifest = JSON.parse(
    await readFile(join(root, expected.directory, 'package.json'), 'utf8'),
  )
  if (
    record.version !== localManifest.version
    || record.directory !== expected.directory
    || localManifest.name !== expected.name
  ) {
    throw new Error(`${expected.name}: artifact manifest is stale or mismatched`)
  }

  const tarballPath = resolve(artifactsDirectory, record.tarball)
  if (dirname(tarballPath) !== artifactsDirectory) {
    throw new Error(`${expected.name}: tarball must stay inside package-artifacts`)
  }
  const tarball = await readFile(tarballPath)
  if (record.integrity) {
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
    if (integrity !== record.integrity) {
      throw new Error(`${expected.name}: tarball integrity does not match manifest.json`)
    }
  }

  const spec = `${record.name}@${record.version}`
  const view = runNpm([
    'view',
    spec,
    'version',
    '--json',
    '--registry',
    registry,
  ], root)
  if (view.status === 0) {
    console.log(`Skipped ${spec}: version already exists on npm`)
    continue
  }
  if (!isExplicitE404(view)) {
    throw new Error(`npm view failed for ${spec}\n${commandOutput(view)}`.trim())
  }

  const publishArgs = [
    'publish',
    tarballPath,
    '--ignore-scripts',
    '--registry',
    registry,
  ]
  if (dryRun) publishArgs.push('--dry-run')
  const published = runNpm(publishArgs, root)
  if (published.status !== 0) {
    throw new Error(`npm publish failed for ${spec}\n${commandOutput(published)}`.trim())
  }
  if (published.stdout) process.stdout.write(published.stdout)
  if (published.stderr) process.stderr.write(published.stderr)
  console.log(`${dryRun ? 'Dry-run validated' : 'Published'} ${spec}`)
}

function runNpm(commandArgs, cwd) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(artifactsDirectory, '.npm-cache'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  return result
}

function isExplicitE404(result) {
  const output = commandOutput(result)
  return output.split(/\r?\n/).some((line) => (
    /^npm\s+(?:ERR!|error)\s+code\s+E404$/i.test(line.trim())
  )) || /"code"\s*:\s*"E404"/.test(output)
}

function commandOutput(result) {
  return [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
}
