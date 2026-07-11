import { useMemo } from 'react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightCellComponentProps,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface RendererRow {
  id: number
  owner: string
  team: 'growth' | 'platform' | 'commerce' | 'data' | 'ai' | 'cloud'
  score: number
  status: 'healthy' | 'watch' | 'risk'
}

const RENDERER_ROWS: readonly RendererRow[] = [
  { id: 1, owner: 'Avery', team: 'growth', score: 92, status: 'healthy' },
  { id: 2, owner: 'Blake', team: 'platform', score: 76, status: 'watch' },
  { id: 3, owner: 'Casey', team: 'commerce', score: 64, status: 'risk' },
  { id: 4, owner: 'Devon', team: 'data', score: 87, status: 'healthy' },
  { id: 5, owner: 'Emery', team: 'ai', score: 71, status: 'watch' },
  { id: 6, owner: 'Flynn', team: 'cloud', score: 96, status: 'healthy' },
]

function GalleryStatusCell({ displayValue, value }: InsightCellComponentProps<RendererRow, RendererRow['status']>) {
  return <span className={`component-gallery__status component-gallery__status--${value}`}>{displayValue}</span>
}

export default function RendererExample({ locale, t }: GalleryExampleProps) {
  const columns = useMemo<readonly InsightColumnDefinition<RendererRow>[]>(() => [
    defineInsightColumn<RendererRow, string>({
      id: 'owner',
      header: t('gallery.renderer.owner'),
      headerText: t('gallery.renderer.owner'),
      width: 168,
      getValue: (row) => row.owner,
      image: ({ rowIndex }) => ({
        src: avatarData(RENDERER_ROWS[rowIndex]?.owner.slice(0, 1) ?? '?', rowIndex),
        alt: '',
        width: 24,
        height: 24,
      }),
      visualStyle: { fontWeight: 700 },
    }),
    defineInsightColumn<RendererRow, RendererRow['team']>({
      id: 'team',
      header: t('gallery.renderer.team'),
      headerText: t('gallery.renderer.team'),
      getValue: (row) => row.team,
      formatValue: (value) => t(`gallery.renderer.team.${value}`),
      visualStyle: { color: '#667169', fontSize: 13 },
    }),
    defineInsightColumn<RendererRow, number>({
      id: 'score',
      header: t('gallery.renderer.score'),
      headerText: t('gallery.renderer.score'),
      getValue: (row) => row.score,
      formatValue: (value) => Intl.NumberFormat(locale).format(value),
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
      conditionalRules: [{
        id: 'gallery-score-bar',
        kind: 'dataBar',
        domain: [0, 100],
        color: 'rgba(36, 147, 95, 0.2)',
      }],
    }),
    defineInsightColumn<RendererRow, RendererRow['status']>({
      id: 'status',
      header: t('gallery.renderer.status'),
      headerText: t('gallery.renderer.status'),
      getValue: (row) => row.status,
      formatValue: (value) => t(`gallery.renderer.status.${value}`),
      component: GalleryStatusCell,
      visualStyle: { horizontalAlign: 'center' },
    }),
  ], [locale, t])

  return (
    <UltiGridInsight
      rows={RENDERER_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      fitColumns="stretch"
      stripedRows
      ariaLabel={t('gallery.renderer.title')}
      style={{ height: '100%' }}
    />
  )
}

function avatarData(label: string, index: number): string {
  const palette = [
    ['#dff3e7', '#176f49'],
    ['#f8ead8', '#8a5a1b'],
    ['#e5ebf7', '#405c92'],
  ] as const
  const [background, foreground] = palette[index % palette.length]!
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="${background}"/><text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="${foreground}">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
