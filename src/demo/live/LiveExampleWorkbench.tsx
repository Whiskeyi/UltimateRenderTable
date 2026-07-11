import { RotateCcw, X } from 'lucide-react'
import {
  LiveError,
  LivePreview,
  LiveProvider,
} from 'react-live'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Locale, Translate } from '../../i18n'
import type { GalleryExampleDefinition } from '../galleryExamples'
import { createLiveScope, prepareLiveSource } from './liveRuntime'

interface LiveExampleWorkbenchProps {
  editorOpen: boolean
  example: GalleryExampleDefinition
  locale: Locale
  onRequestClose: () => void
  t: Translate
}

export default function LiveExampleWorkbench({
  editorOpen,
  example,
  locale,
  onRequestClose,
  t,
}: LiveExampleWorkbenchProps) {
  const [draft, setDraft] = useState(example.source)
  const [editorEditing, setEditorEditing] = useState(false)
  const debouncedDraft = useDebouncedValue(draft, 220)
  const scope = useMemo(() => createLiveScope(locale, t), [locale, t])
  const transformCode = useCallback((source: string) => prepareLiveSource(source), [])

  useEffect(() => {
    setDraft(example.source)
  }, [example.id, example.source])

  useEffect(() => {
    if (!editorOpen) setEditorEditing(false)
  }, [editorOpen])

  return (
    <LiveProvider
      code={debouncedDraft}
      enableTypeScript={false}
      noInline
      scope={scope}
      transformCode={transformCode}
    >
      <div className={[
        'component-gallery__workbench',
        editorOpen ? 'is-editor-open' : '',
        editorEditing ? 'is-editor-editing' : '',
      ].filter(Boolean).join(' ')}>
        <section className="component-gallery__live-surface" aria-label={t('gallery.editor.preview')}>
          <LivePreview className="component-gallery__live-preview" />
        </section>

        <aside
          id="component-gallery-editor"
          className="component-gallery__editor-panel"
          hidden={!editorOpen}
          aria-label={t('gallery.editor.title')}
        >
          <header>
            <span>
              <i aria-hidden="true" />
              <strong>{t('gallery.editor.title')}</strong>
              <small>TSX · {t('gallery.editor.live')}</small>
            </span>
            <span className="component-gallery__editor-actions">
              <button
                type="button"
                onClick={() => setDraft(example.source)}
                disabled={draft === example.source}
                aria-label={t('gallery.editor.reset')}
                title={t('gallery.editor.reset')}
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={onRequestClose}
                aria-label={t('gallery.editor.close')}
                title={t('gallery.editor.close')}
              >
                <X size={15} />
              </button>
            </span>
          </header>
          <div className="component-gallery__editor-scroll">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={t('gallery.editor.title')}
              spellCheck={false}
              className="component-gallery__editor"
              onFocus={() => setEditorEditing(true)}
            />
          </div>
          <small className="component-gallery__editor-hint">{t('gallery.editor.hint')}</small>
          <LiveError className="component-gallery__editor-error" role="alert" />
        </aside>
      </div>
    </LiveProvider>
  )
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debouncedValue
}
