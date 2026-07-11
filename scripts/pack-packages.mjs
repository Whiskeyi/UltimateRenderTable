import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifactsDirectory = join(root, 'package-artifacts')
const packageDirectories = ['packages/core', 'packages/insight']

const packages = await Promise.all(packageDirectories.map(async (directory) => {
  const packageRoot = join(root, directory)
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const requiredFiles = [
    manifest.exports?.['.']?.import,
    manifest.exports?.['.']?.types,
    manifest.exports?.['./style.css'],
    './LICENSE',
    './README.md',
  ]
  if (requiredFiles.some((file) => typeof file !== 'string')) {
    throw new Error(`${manifest.name}: package exports are incomplete`)
  }
  for (const file of requiredFiles) {
    await access(join(packageRoot, file.replace(/^\.\//, '')))
  }
  return { directory, packageRoot, manifest, requiredFiles }
}))

await mkdir(artifactsDirectory, { recursive: true })
for (const entry of await readdir(artifactsDirectory)) {
  if (entry === 'manifest.json' || entry.endsWith('.tgz')) {
    await rm(join(artifactsDirectory, entry), { force: true })
  }
}

const packedPackages = []
for (const definition of packages) {
  const output = runNpm([
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    artifactsDirectory,
  ], definition.packageRoot)
  const records = JSON.parse(output)
  if (!Array.isArray(records) || records.length !== 1) {
    throw new Error(`${definition.manifest.name}: npm pack returned an unexpected result`)
  }
  const record = records[0]
  if (record.name !== definition.manifest.name || record.version !== definition.manifest.version) {
    throw new Error(
      `${definition.manifest.name}: packed identity does not match package.json`,
    )
  }

  const packedFiles = new Set(record.files?.map((file) => `./${file.path}`) ?? [])
  for (const requiredFile of definition.requiredFiles) {
    if (!packedFiles.has(requiredFile)) {
      throw new Error(`${record.name}: tarball is missing ${requiredFile}`)
    }
  }

  const tarball = basename(record.filename)
  await access(join(artifactsDirectory, tarball))
  packedPackages.push({
    name: record.name,
    version: record.version,
    directory: definition.directory,
    tarball,
    integrity: record.integrity,
    shasum: record.shasum,
    size: record.size,
    unpackedSize: record.unpackedSize,
    fileCount: record.entryCount,
  })
  console.log(`Packed ${record.name}@${record.version} -> package-artifacts/${tarball}`)
}

const artifactManifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  registry: 'https://registry.npmjs.org/',
  packages: packedPackages,
}
await writeFile(
  join(artifactsDirectory, 'manifest.json'),
  `${JSON.stringify(artifactManifest, null, 2)}\n`,
)
console.log('Wrote package-artifacts/manifest.json')

function runNpm(args, cwd) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(artifactsDirectory, '.npm-cache'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `npm ${args[0]} failed for ${cwd}\n${result.stderr || result.stdout}`.trim(),
    )
  }
  if (result.stderr) process.stderr.write(result.stderr)
  return result.stdout.trim()
}
