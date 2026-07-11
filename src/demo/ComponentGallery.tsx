import {
  Braces,
  Check,
  ChevronRight,
  Code2,
  Keyboard,
  Layers3,
  MousePointer2,
  PackageOpen,
} from 'lucide-react'
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react'
import { useI18n } from '../i18n'
import type { DemoSnippetKey } from './demoSnippets'
import {
  GALLERY_EXAMPLES,
  type GalleryExampleId,
} from './galleryExamples'

export interface ComponentGalleryProps {
  onViewSource: (
    sourceKey: DemoSnippetKey,
    title: string,
    trigger: HTMLButtonElement,
  ) => void
}

export function ComponentGallery({ onViewSource }: ComponentGalleryProps) {
  const { locale, t } = useI18n()
  const [activeId, setActiveId] = useState<GalleryExampleId>('virtualization')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const active = useMemo(
    () => GALLERY_EXAMPLES.find((example) => example.id === activeId) ?? GALLERY_EXAMPLES[0]!,
    [activeId],
  )
  const Example = active.component
  const groups = [
    { level: 'basic', label: t('gallery.group.basic') },
    { level: 'advanced', label: t('gallery.group.advanced') },
  ] as const

  const openSource = (event: MouseEvent<HTMLButtonElement>) => {
    onViewSource(active.sourceKey, t(active.titleKey), event.currentTarget)
  }

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % GALLERY_EXAMPLES.length
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + GALLERY_EXAMPLES.length) % GALLERY_EXAMPLES.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = GALLERY_EXAMPLES.length - 1
    }
    if (nextIndex === undefined) return
    event.preventDefault()
    setActiveId(GALLERY_EXAMPLES[nextIndex]!.id)
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  return (
    <section className="component-gallery" aria-labelledby="component-gallery-title">
      <aside className="component-gallery__rail">
        <header>
          <span><Braces size={14} /> {t('gallery.eyebrow')}</span>
          <h2 id="component-gallery-title">{t('gallery.title')}</h2>
          <p>{t('gallery.intro')}</p>
        </header>
        <div className="component-gallery__tabs" role="tablist" aria-label={t('gallery.title')}>
          {groups.map((group) => (
            <section className="component-gallery__group" role="presentation" key={group.level}>
              <h3>{group.label}</h3>
              {GALLERY_EXAMPLES.map((example, index) => example.level === group.level ? (
                <button
                  key={example.id}
                  type="button"
                  role="tab"
                  id={`component-gallery-tab-${example.id}`}
                  aria-controls="component-gallery-panel"
                  aria-selected={example.id === active.id}
                  tabIndex={example.id === active.id ? 0 : -1}
                  className={example.id === active.id ? 'is-active' : undefined}
                  ref={(element) => { tabRefs.current[index] = element }}
                  onClick={() => setActiveId(example.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <i>{String(index + 1).padStart(2, '0')}</i>
                  <span>
                    <strong>{t(example.titleKey)}</strong>
                    <small>{example.packageName}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ) : null)}
            </section>
          ))}
        </div>
      </aside>

      <article
        id="component-gallery-panel"
        className="component-gallery__stage"
        role="tabpanel"
        aria-labelledby={`component-gallery-tab-${active.id}`}
      >
        <section className="component-gallery__overview" aria-label={t('gallery.summary.title')}>
          <div className="component-gallery__overview-copy">
            <span><Layers3 size={14} /> {t('gallery.summary.eyebrow')}</span>
            <strong>{t('gallery.summary.title')}</strong>
            <p>{t('gallery.summary.detail')}</p>
          </div>
          <ol className="component-gallery__layers">
            <li><span>Studio</span><small>{t('gallery.summary.studio')}</small></li>
            <li><span>@ultigrid/insight</span><small>{t('gallery.summary.insight')}</small></li>
            <li><span>@ultigrid/core</span><small>{t('gallery.summary.core')}</small></li>
          </ol>
          <dl className="component-gallery__overview-stats">
            <div><dt>{t('gallery.summary.scale')}</dt><dd>10¹⁰</dd></div>
            <div><dt>{t('gallery.summary.examples')}</dt><dd>{GALLERY_EXAMPLES.length}</dd></div>
            <div><dt>{t('gallery.summary.packages')}</dt><dd><PackageOpen size={15} /> 2</dd></div>
          </dl>
        </section>

        <header className="component-gallery__stage-head">
          <div>
            <span className="component-gallery__package">{active.packageName}</span>
            <h3>{t(active.titleKey)}</h3>
            <p>{t(active.detailKey)}</p>
          </div>
          <button
            type="button"
            className="component-gallery__source"
            data-testid={`gallery-source-${active.id}`}
            onClick={openSource}
          >
            <Code2 size={15} /> {t('gallery.source')}
          </button>
        </header>

        <div className="component-gallery__preview" data-example={active.id}>
          <Example locale={locale} t={t} />
        </div>

        <footer className="component-gallery__hint">
          <span><MousePointer2 size={14} /> {t('gallery.interact.pointer')}</span>
          <span><Keyboard size={14} /> {t('gallery.interact.keyboard')}</span>
          <span><Check size={14} /> {t(active.hintKey)}</span>
        </footer>
      </article>
    </section>
  )
}
