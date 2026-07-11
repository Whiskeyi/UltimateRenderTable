import * as CoreModule from '@ultigrid/core'
import * as InsightModule from '@ultigrid/insight'
import {
  ClipboardCopy,
  FileText,
  Image,
  MousePointer2,
  Table2,
  Target,
} from 'lucide-react'
import * as ReactModule from 'react'
import * as ReactJsxRuntimeModule from 'react/jsx-runtime'
import { transform } from 'sucrase'
import type { Locale, Translate } from '../../i18n'

const LIVE_MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  react: ReactModule,
  'react/jsx-runtime': ReactJsxRuntimeModule,
  'lucide-react': {
    ClipboardCopy,
    FileText,
    Image,
    MousePointer2,
    Table2,
    Target,
  },
  '@ultigrid/core': CoreModule,
  '@ultigrid/insight': InsightModule,
}

export function resolveLiveModule(moduleName: string): Record<string, unknown> {
  const module = LIVE_MODULES[moduleName]
  if (!module) throw new Error(`Module "${moduleName}" is not available in this playground.`)
  return module
}

export function createLiveScope(locale: Locale, t: Translate): Record<string, unknown> {
  return {
    React: ReactModule,
    exports: {},
    locale,
    t,
    require: resolveLiveModule,
  }
}

export function prepareLiveSource(source: string): string {
  const compiledSource = transform(source, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'automatic',
    production: true,
  }).code

  return `
exports.default = undefined
${compiledSource}
const __UltiGridEditedComponent = exports.default
if (typeof __UltiGridEditedComponent !== 'function') {
  throw new Error('The source must default-export a React component.')
}
render(React.createElement(__UltiGridEditedComponent, { locale, t }))
  `.trim()
}
