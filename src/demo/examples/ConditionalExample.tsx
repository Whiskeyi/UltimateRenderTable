import { useMemo } from 'react'
import {
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface ConditionalRow {
  id: number
  entity: number
  revenue: number
  score: number
  variance: number
  risk: number
}

const CONDITIONAL_ROWS: readonly ConditionalRow[] = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  entity: index + 1,
  revenue: 48 + (index * 17) % 100,
  score: 42 + (index * 11) % 59,
  variance: -18 + (index * 7) % 38,
  risk: (index * 13) % 100,
}))

export default function ConditionalExample({ t }: GalleryExampleProps) {
  const columns = useMemo<readonly InsightColumnDefinition<ConditionalRow>[]>(() => [
    defineInsightColumn<ConditionalRow, number>({
      id: 'entity',
      header: t('gallery.conditional.entity'),
      headerText: t('gallery.conditional.entity'),
      getValue: (row) => row.entity,
      formatValue: (value) => t('gallery.conditional.unit', {
        index: String(value).padStart(2, '0'),
      }),
      visualStyle: { fontWeight: 700 },
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'revenue',
      header: t('gallery.conditional.bar'),
      headerText: t('gallery.conditional.bar'),
      getValue: (row) => row.revenue,
      conditionalRules: [{
        id: 'gallery-data-bar',
        kind: 'dataBar',
        domain: [0, 150],
        color: 'rgba(36, 147, 95, 0.24)',
      }],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'score',
      header: t('gallery.conditional.scale'),
      headerText: t('gallery.conditional.scale'),
      getValue: (row) => row.score,
      conditionalRules: [{
        id: 'gallery-color-scale',
        kind: 'colorScale',
        domain: [0, 100],
        midpoint: 60,
        colors: ['#f8dedb', '#fff4d0', '#dff2e7'],
      }],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'variance',
      header: t('gallery.conditional.icon'),
      headerText: t('gallery.conditional.icon'),
      getValue: (row) => row.variance,
      formatValue: (value) => `${value > 0 ? '+' : ''}${value}%`,
      conditionalRules: [
        { id: 'gallery-up', kind: 'icon', when: { operator: 'greaterThanOrEqual', value: 5 }, icon: { name: 'up', color: '#168052' } },
        { id: 'gallery-down', kind: 'icon', when: { operator: 'lessThan', value: 0 }, icon: { name: 'down', color: '#b64d46' } },
      ],
    }),
    defineInsightColumn<ConditionalRow, number>({
      id: 'risk',
      header: t('gallery.conditional.rule'),
      headerText: t('gallery.conditional.rule'),
      getValue: (row) => row.risk,
      conditionalRules: [
        { id: 'gallery-risk-bg', kind: 'background', when: { operator: 'greaterThan', value: 72 }, color: '#fff0ed' },
        { id: 'gallery-risk-text', kind: 'text', when: { operator: 'greaterThan', value: 72 }, style: { color: '#a7443e', fontWeight: 800 } },
      ],
    }),
  ], [t])

  return (
    <UltiGridInsight
      rows={CONDITIONAL_ROWS}
      getRowId={(row) => row.id}
      columns={columns}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.conditional.title')}
      style={{ height: '100%' }}
    />
  )
}
