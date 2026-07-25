import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const kibibyte = 1024
const budgets = [
  {
    label: '@ultigrid/core JavaScript',
    files: [join(root, 'packages/core/dist/index.js')],
    maximum: 26 * kibibyte,
  },
  {
    label: '@ultigrid/insight JavaScript',
    files: [join(root, 'packages/insight/dist/index.js')],
    maximum: 21 * kibibyte,
  },
]

const demoAssetsDirectory = join(root, 'dist/assets')
const demoAssets = await readdir(demoAssetsDirectory)
const demoJavaScript = demoAssets
  .filter((file) => file.endsWith('.js'))
  .map((file) => join(demoAssetsDirectory, file))
const demoStyles = demoAssets
  .filter((file) => file.endsWith('.css'))
  .map((file) => join(demoAssetsDirectory, file))

budgets.push(
  {
    label: 'Studio total JavaScript',
    files: demoJavaScript,
    maximum: 310 * kibibyte,
  },
  {
    label: 'Studio styles',
    files: demoStyles,
    maximum: 26 * kibibyte,
  },
)

let failed = false
for (const budget of budgets) {
  const sizes = await Promise.all(budget.files.map(async (file) => ({
    file,
    gzip: gzipSync(await readFile(file), { level: 9 }).byteLength,
  })))
  const total = sizes.reduce((sum, entry) => sum + entry.gzip, 0)
  const summary = `${formatSize(total)} / ${formatSize(budget.maximum)}`
  if (total > budget.maximum) {
    failed = true
    console.error(`Bundle budget exceeded: ${budget.label} (${summary})`)
    for (const entry of sizes.sort((left, right) => right.gzip - left.gzip)) {
      console.error(`  ${basename(entry.file)}: ${formatSize(entry.gzip)}`)
    }
  } else {
    console.log(`Bundle budget passed: ${budget.label} (${summary})`)
  }
}

const largestDemoChunk = Math.max(
  0,
  ...(await Promise.all(demoJavaScript.map(async (file) => (
    gzipSync(await readFile(file), { level: 9 }).byteLength
  )))),
)
const maximumDemoChunk = 150 * kibibyte
if (largestDemoChunk > maximumDemoChunk) {
  failed = true
  console.error(
    `Bundle budget exceeded: largest Studio chunk `
    + `(${formatSize(largestDemoChunk)} / ${formatSize(maximumDemoChunk)})`,
  )
} else {
  console.log(
    `Bundle budget passed: largest Studio chunk `
    + `(${formatSize(largestDemoChunk)} / ${formatSize(maximumDemoChunk)})`,
  )
}

if (failed) process.exitCode = 1

function formatSize(bytes) {
  return `${(bytes / kibibyte).toFixed(1)} KiB gzip`
}
