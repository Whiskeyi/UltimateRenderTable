import type { MessageKey } from '../i18n'
import ConditionalExample from './examples/ConditionalExample'
import conditionalSource from './examples/ConditionalExample.tsx?raw'
import ExportExample from './examples/ExportExample'
import exportSource from './examples/ExportExample.tsx?raw'
import FrozenExample from './examples/FrozenExample'
import frozenSource from './examples/FrozenExample.tsx?raw'
import ImperativeApiExample from './examples/ImperativeApiExample'
import imperativeApiSource from './examples/ImperativeApiExample.tsx?raw'
import LazyDataExample from './examples/LazyDataExample'
import lazyDataSource from './examples/LazyDataExample.tsx?raw'
import MergingExample from './examples/MergingExample'
import mergingSource from './examples/MergingExample.tsx?raw'
import MobileInteractionExample from './examples/MobileInteractionExample'
import mobileInteractionSource from './examples/MobileInteractionExample.tsx?raw'
import RendererExample from './examples/RendererExample'
import rendererSource from './examples/RendererExample.tsx?raw'
import SelectionExample from './examples/SelectionExample'
import selectionSource from './examples/SelectionExample.tsx?raw'
import SizingExample from './examples/SizingExample'
import sizingSource from './examples/SizingExample.tsx?raw'
import TreeExample from './examples/TreeExample'
import treeSource from './examples/TreeExample.tsx?raw'
import VirtualizationExample from './examples/VirtualizationExample'
import virtualizationSource from './examples/VirtualizationExample.tsx?raw'
import type { GalleryExampleComponent } from './galleryExampleTypes'

export type GalleryExampleId =
  | 'virtualization'
  | 'frozen'
  | 'sizing'
  | 'merging'
  | 'mobile'
  | 'selection'
  | 'renderer'
  | 'tree'
  | 'conditional'
  | 'lazy'
  | 'api'
  | 'export'

export interface GalleryExampleDefinition {
  id: GalleryExampleId
  level: 'basic' | 'advanced'
  packageName: '@ultigrid/core' | '@ultigrid/insight'
  titleKey: MessageKey
  detailKey: MessageKey
  component: GalleryExampleComponent
  source: string
}

export const GALLERY_EXAMPLES: readonly GalleryExampleDefinition[] = [
  {
    id: 'virtualization',
    level: 'basic',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.virtualization.title',
    detailKey: 'gallery.virtualization.detail',
    component: VirtualizationExample,
    source: virtualizationSource,
  },
  {
    id: 'frozen',
    level: 'basic',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.frozen.title',
    detailKey: 'gallery.frozen.detail',
    component: FrozenExample,
    source: frozenSource,
  },
  {
    id: 'sizing',
    level: 'basic',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.sizing.title',
    detailKey: 'gallery.sizing.detail',
    component: SizingExample,
    source: sizingSource,
  },
  {
    id: 'selection',
    level: 'basic',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.selection.title',
    detailKey: 'gallery.selection.detail',
    component: SelectionExample,
    source: selectionSource,
  },
  {
    id: 'renderer',
    level: 'basic',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.renderer.title',
    detailKey: 'gallery.renderer.detail',
    component: RendererExample,
    source: rendererSource,
  },
  {
    id: 'merging',
    level: 'advanced',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.merging.title',
    detailKey: 'gallery.merging.detail',
    component: MergingExample,
    source: mergingSource,
  },
  {
    id: 'tree',
    level: 'advanced',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.tree.title',
    detailKey: 'gallery.tree.detail',
    component: TreeExample,
    source: treeSource,
  },
  {
    id: 'conditional',
    level: 'advanced',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.conditional.title',
    detailKey: 'gallery.conditional.detail',
    component: ConditionalExample,
    source: conditionalSource,
  },
  {
    id: 'lazy',
    level: 'advanced',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.lazy.title',
    detailKey: 'gallery.lazy.detail',
    component: LazyDataExample,
    source: lazyDataSource,
  },
  {
    id: 'api',
    level: 'advanced',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.api.title',
    detailKey: 'gallery.api.detail',
    component: ImperativeApiExample,
    source: imperativeApiSource,
  },
  {
    id: 'mobile',
    level: 'advanced',
    packageName: '@ultigrid/core',
    titleKey: 'gallery.mobile.title',
    detailKey: 'gallery.mobile.detail',
    component: MobileInteractionExample,
    source: mobileInteractionSource,
  },
  {
    id: 'export',
    level: 'advanced',
    packageName: '@ultigrid/insight',
    titleKey: 'gallery.export.title',
    detailKey: 'gallery.export.detail',
    component: ExportExample,
    source: exportSource,
  },
]
