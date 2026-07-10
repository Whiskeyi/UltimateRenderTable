import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageNames = ['core', 'insight']

for (const packageName of packageNames) {
  const packageRoot = join(root, 'packages', packageName)
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const requiredFiles = [
    manifest.exports['.'].import,
    manifest.exports['.'].types,
    manifest.exports['./style.css'],
    './LICENSE',
    './README.md',
  ]
  for (const relativeFile of requiredFiles) {
    const absoluteFile = join(packageRoot, relativeFile.replace(/^\.\//, ''))
    if (!existsSync(absoluteFile)) throw new Error(`${manifest.name}: missing ${relativeFile}`)
  }

  const declarations = collectFiles(join(packageRoot, 'dist', 'types'), '.d.ts')
  for (const declaration of declarations) {
    const source = readFileSync(declaration, 'utf8')
    if (/import\s+['"][^'"]+\.css['"]/.test(source)) {
      throw new Error(`${manifest.name}: declaration imports unpublished source CSS`)
    }
    if (source.includes('/src/') || source.includes('..\/..\/..\/src')) {
      throw new Error(`${manifest.name}: declaration leaks repository source paths`)
    }
  }
}

const insightRoot = join(root, 'packages', 'insight', 'dist')
const insightChunks = readdirSync(insightRoot).filter((file) => /^index-.+\.js$/.test(file))
if (insightChunks.length > 0) throw new Error('@ultigrid/insight: unexpected bundled dependency chunk')

const insightCss = readFileSync(join(insightRoot, 'style.css'), 'utf8')
if (!insightCss.includes('.ultigrid-root') || !insightCss.includes('.ultigrid-insight')) {
  throw new Error('@ultigrid/insight: style.css must include both core and insight styles')
}

console.log('Package contracts verified: @ultigrid/core, @ultigrid/insight')

function collectFiles(directory, suffix) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? collectFiles(path, suffix)
      : path.endsWith(suffix) ? [path] : []
  })
}
