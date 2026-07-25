import type { StudioScenario } from './types'

const STUDIO_SCENARIOS = new Set<StudioScenario>([
  'intro',
  'gallery',
  'analysis',
  'spreadsheet',
])

export function readStudioScenario(search: string): StudioScenario | undefined {
  const candidate = new URLSearchParams(search).get('scenario')
  return candidate && STUDIO_SCENARIOS.has(candidate as StudioScenario)
    ? candidate as StudioScenario
    : undefined
}

export function writeStudioScenario(search: string, scenario: StudioScenario): string {
  const parameters = new URLSearchParams(search)
  if (scenario === 'intro') parameters.delete('scenario')
  else parameters.set('scenario', scenario)
  const serialized = parameters.toString()
  return serialized ? `?${serialized}` : ''
}
