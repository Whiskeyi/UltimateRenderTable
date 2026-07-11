import {
  Braces,
  ChevronRight,
  Code2,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useI18n } from '../i18n'
import {
  GALLERY_EXAMPLES,
  type GalleryExampleId,
} from './galleryExamples'

const LiveExampleWorkbench = lazy(() => import('./live/LiveExampleWorkbench'))

export function ComponentGallery() {
  const { locale, t } = useI18n()
  const [activeId, setActiveId] = useState<GalleryExampleId>('virtualization')
  const [editorOpen, setEditorOpen] = useState(false)
  const [liveWorkbenchMounted, setLiveWorkbenchMounted] = useState(false)
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

  useEffect(() => {
    setEditorOpen(false)
    setLiveWorkbenchMounted(false)
  }, [activeId])

  useEffect(() => {
    const activeIndex = GALLERY_EXAMPLES.findIndex((example) => example.id === activeId)
    if (activeIndex < 0) return
    tabRefs.current[activeIndex]?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  }, [activeId])

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
        <header className="component-gallery__stage-head">
          <div>
            <span className="component-gallery__package">{active.packageName}</span>
            <h3>{t(active.titleKey)}</h3>
            <p>{t(active.detailKey)}</p>
          </div>
          <button
            type="button"
            className="component-gallery__source"
            data-testid={`gallery-editor-toggle-${active.id}`}
            aria-expanded={editorOpen}
            aria-controls="component-gallery-editor"
            onClick={() => {
              setLiveWorkbenchMounted(true)
              setEditorOpen((open) => !open)
            }}
          >
            <Code2 size={15} /> {t(editorOpen ? 'gallery.editor.close' : 'gallery.editor.open')}
          </button>
        </header>

        <div className="component-gallery__preview" data-example={active.id}>
          {liveWorkbenchMounted ? (
            <Suspense fallback={<Example locale={locale} t={t} />}>
              <LiveExampleWorkbench
                key={active.id}
                editorOpen={editorOpen}
                example={active}
                locale={locale}
                onRequestClose={() => setEditorOpen(false)}
                t={t}
              />
            </Suspense>
          ) : (
            <Example locale={locale} t={t} />
          )}
        </div>
      </article>
    </section>
  )
}
