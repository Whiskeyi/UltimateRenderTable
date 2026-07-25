import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifactsDirectory = join(root, 'package-artifacts')
const artifactManifest = JSON.parse(
  await readFile(join(artifactsDirectory, 'manifest.json'), 'utf8'),
)
const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const consumerDirectory = await mkdtemp(join(tmpdir(), 'ultigrid-packed-consumer-'))
const reactVersion = process.env.REACT_VERSION ?? rootManifest.dependencies.react

try {
  const dependencies = Object.fromEntries(
    artifactManifest.packages.map((definition) => [
      definition.name,
      `file:${join(artifactsDirectory, definition.tarball)}`,
    ]),
  )
  dependencies.react = reactVersion
  dependencies['react-dom'] = reactVersion

  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({
      name: 'ultigrid-packed-consumer',
      private: true,
      type: 'module',
      dependencies,
    }, null, 2)}\n`,
  )
  await writeFile(
    join(consumerDirectory, 'index.html'),
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src.js"></script></body></html>\n',
  )
  await writeFile(
    join(consumerDirectory, 'src.js'),
    [
      "import React from 'react'",
      "import { createRoot } from 'react-dom/client'",
      "import { UltiGridViewport } from '@ultigrid/core'",
      "import { UltiGridInsight } from '@ultigrid/insight'",
      "import '@ultigrid/core/style.css'",
      "import '@ultigrid/insight/style.css'",
      '',
      'const root = createRoot(document.getElementById(\'root\'))',
      'root.render(React.createElement(\'div\', null,',
      '  React.createElement(UltiGridViewport, { rowCount: 1, columnCount: 1, getCell: () => ({ value: \'core\' }) }),',
      '  React.createElement(UltiGridInsight, { rows: [{ id: 1 }], columns: [{ id: \'id\', header: \'ID\', getValue: (row) => row.id }] }),',
      '))',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(consumerDirectory, 'runtime-check.mjs'),
    [
      "import React from 'react'",
      "import { renderToStaticMarkup } from 'react-dom/server'",
      "const core = await import('@ultigrid/core')",
      "const insight = await import('@ultigrid/insight')",
      "if (typeof core.UltiGridViewport !== 'object' && typeof core.UltiGridViewport !== 'function') throw new Error('Core runtime export is missing')",
      "if (typeof insight.UltiGridInsight !== 'object' && typeof insight.UltiGridInsight !== 'function') throw new Error('Insight runtime export is missing')",
      'const ssrWarnings = []',
      'const originalConsoleError = console.error',
      'console.error = (...args) => ssrWarnings.push(args.map(String).join(\' \'))',
      'let coreMarkup',
      'let insightMarkup',
      'try {',
      "  coreMarkup = renderToStaticMarkup(React.createElement(core.UltiGridViewport, { rowCount: 1, columnCount: 1, getCell: () => ({ value: 'core' }) }))",
      "  insightMarkup = renderToStaticMarkup(React.createElement(insight.UltiGridInsight, { rows: [{ id: 1 }], columns: [{ id: 'id', getValue: (row) => row.id }] }))",
      '} finally {',
      '  console.error = originalConsoleError',
      '}',
      "if (ssrWarnings.length > 0) throw new Error(`SSR emitted warnings:\\n${ssrWarnings.join('\\n')}`)",
      "if (!coreMarkup.includes('ultigrid-root')) throw new Error('Core SSR smoke failed')",
      "if (!insightMarkup.includes('ultigrid-insight')) throw new Error('Insight SSR smoke failed')",
      '',
    ].join('\n'),
  )

  if (process.env.PACKED_CONSUMER_ALLOW_NETWORK === 'true') {
    run(
      npmExecutable(),
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
      consumerDirectory,
    )
  } else {
    await prepareExtractedConsumer(consumerDirectory, artifactManifest.packages)
  }
  run(process.execPath, ['runtime-check.mjs'], consumerDirectory)
  run(
    process.execPath,
    [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    consumerDirectory,
  )

  console.log(
    `Packed consumer verified with React ${reactVersion}: `
    + 'runtime imports, SSR render, CSS exports, and Vite build',
  )
} finally {
  await rm(consumerDirectory, { recursive: true, force: true })
}

function run(executable, args, cwd) {
  execFileSync(executable, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

async function prepareExtractedConsumer(consumerRoot, packageDefinitions) {
  const modulesDirectory = join(consumerRoot, 'node_modules')
  const scopeDirectory = join(modulesDirectory, '@ultigrid')
  await mkdir(scopeDirectory, { recursive: true })

  for (const definition of packageDefinitions) {
    const extractionDirectory = await mkdtemp(join(consumerRoot, 'extract-'))
    run(
      'tar',
      ['-xzf', join(artifactsDirectory, definition.tarball), '-C', extractionDirectory],
      consumerRoot,
    )
    const target = join(scopeDirectory, definition.name.split('/').at(-1))
    await rename(join(extractionDirectory, 'package'), target)
    await rm(extractionDirectory, { recursive: true, force: true })
  }

  for (const dependency of [
    'html-to-image',
    'lucide-react',
    'react',
    'react-dom',
    'write-excel-file',
  ]) {
    await symlink(
      join(root, 'node_modules', dependency),
      join(modulesDirectory, dependency),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
}
