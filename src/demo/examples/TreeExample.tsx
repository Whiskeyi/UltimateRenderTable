import { useMemo } from 'react'
import {
  TreeRowModel,
  UltiGridInsight,
  defineInsightColumn,
  type InsightColumnDefinition,
} from '@ultigrid/insight'
import type { MessageKey } from '../../i18n'
import type { GalleryExampleProps } from '../galleryExampleTypes'

interface GalleryTreeRow {
  id: string
  labelKey: MessageKey
  value: number
  children?: readonly GalleryTreeRow[]
}

const TREE_ROOTS: readonly GalleryTreeRow[] = [
  {
    id: 'commercial',
    labelKey: 'gallery.tree.commercial',
    value: 284,
    children: [
      {
        id: 'direct',
        labelKey: 'gallery.tree.direct',
        value: 168,
        children: [
          { id: 'enterprise', labelKey: 'gallery.tree.enterprise', value: 104 },
          { id: 'midmarket', labelKey: 'gallery.tree.midmarket', value: 64 },
        ],
      },
      {
        id: 'partners',
        labelKey: 'gallery.tree.partners',
        value: 116,
        children: [
          { id: 'partner-platform', labelKey: 'gallery.tree.platform', value: 72 },
          { id: 'partner-applications', labelKey: 'gallery.tree.applications', value: 44 },
        ],
      },
    ],
  },
  {
    id: 'product',
    labelKey: 'gallery.tree.product',
    value: 231,
    children: [
      {
        id: 'cloud',
        labelKey: 'gallery.tree.cloud',
        value: 142,
        children: [
          { id: 'cloud-platform', labelKey: 'gallery.tree.platform', value: 88 },
          { id: 'cloud-applications', labelKey: 'gallery.tree.applications', value: 54 },
        ],
      },
      {
        id: 'data',
        labelKey: 'gallery.tree.data',
        value: 89,
        children: [
          { id: 'analytics', labelKey: 'gallery.tree.analytics', value: 53 },
          { id: 'governance', labelKey: 'gallery.tree.governance', value: 36 },
        ],
      },
    ],
  },
]

export default function TreeExample({ locale, t }: GalleryExampleProps) {
  const model = useMemo(() => new TreeRowModel(TREE_ROOTS, {
    getRowId: (row) => row.id,
    hasChildren: (row) => Boolean(row.children?.length),
    getChildren: (row) => row.children,
    defaultExpanded: (_row, depth) => depth < 2,
  }), [])
  const columns = useMemo<readonly InsightColumnDefinition<GalleryTreeRow>[]>(() => [
    defineInsightColumn<GalleryTreeRow, string>({
      id: 'name',
      header: t('gallery.tree.dimension'),
      headerText: t('gallery.tree.dimension'),
      width: 248,
      getValue: (row) => t(row.labelKey),
      visualStyle: { fontWeight: 650 },
    }),
    defineInsightColumn<GalleryTreeRow, number>({
      id: 'value',
      header: t('gallery.tree.value'),
      headerText: t('gallery.tree.value'),
      getValue: (row) => row.value,
      formatValue: (value) => Intl.NumberFormat(locale).format(value),
      visualStyle: { horizontalAlign: 'right', fontWeight: 700 },
    }),
  ], [locale, t])

  return (
    <UltiGridInsight
      rowModel={model}
      columns={columns}
      treeColumnId="name"
      onToggleRow={(rowId) => { void model.toggle(rowId) }}
      showRowNumbers={false}
      fitColumns="stretch"
      ariaLabel={t('gallery.tree.title')}
      style={{ height: '100%' }}
    />
  )
}
