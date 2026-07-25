import {
  BookOpen,
  Layers3,
  PlayCircle,
  Rocket,
} from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../i18n'
import { GALLERY_EXAMPLE_COUNT } from './galleryExampleTypes'

type IntroLayer = 'studio' | 'insight' | 'core'
type CapabilityGroup = 'basic' | 'advanced'

export function RepositoryIntro() {
  const { locale, t } = useI18n()
  const [activeLayer, setActiveLayer] = useState<IntroLayer>('studio')
  const [activeCapability, setActiveCapability] = useState<CapabilityGroup>('basic')
  const ctaCopy = locale === 'zh-CN'
    ? {
        quickStart: '快速接入',
        productionCases: '生产用例',
        packageDocs: '包文档',
      }
    : {
        quickStart: 'Quick start',
        productionCases: 'Production cases',
        packageDocs: 'Package docs',
      }
  const layers = [
    {
      id: 'studio' as const,
      index: '01',
      name: 'Studio',
      detail: t('intro.layer.studio'),
      meta: t('intro.layer.studio.meta'),
    },
    {
      id: 'insight' as const,
      index: '02',
      name: '@ultigrid/insight',
      detail: t('intro.layer.insight'),
      meta: t('intro.layer.insight.meta'),
    },
    {
      id: 'core' as const,
      index: '03',
      name: '@ultigrid/core',
      detail: t('intro.layer.core'),
      meta: t('intro.layer.core.meta'),
    },
  ]
  const selectedLayer = layers.find((layer) => layer.id === activeLayer) ?? layers[0]!
  const selectedCapability = activeCapability === 'basic'
    ? t('intro.capabilities.basic')
    : t('intro.capabilities.advanced')
  const openProductionCases = () => {
    document.querySelector<HTMLButtonElement>('[data-scenario="gallery"]')?.click()
  }

  return (
    <section className="repository-intro" aria-labelledby="repository-intro-title">
      <header className="repository-intro__hero">
        <div className="repository-intro__copy">
          <span><Layers3 size={15} /> {t('intro.eyebrow')}</span>
          <h2 id="repository-intro-title">{t('intro.title')}</h2>
          <p>{t('intro.detail')}</p>
        </div>

        <div className="repository-intro__hero-side">
          <dl className="repository-intro__stats">
            <div><dt>{t('intro.stats.scale')}</dt><dd>10¹⁰</dd></div>
            <div><dt>{t('intro.stats.examples')}</dt><dd>{GALLERY_EXAMPLE_COUNT}</dd></div>
            <div><dt>{t('intro.stats.packages')}</dt><dd><Layers3 size={17} /> 3</dd></div>
          </dl>
        </div>

        <nav className="repository-intro__actions" aria-label={locale === 'zh-CN' ? '开始使用 UltiGrid' : 'Get started with UltiGrid'}>
          <a
            className="is-primary"
            href="https://www.npmjs.com/package/@ultigrid/insight"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Rocket size={14} aria-hidden="true" />
            {ctaCopy.quickStart}
          </a>
          <button type="button" onClick={openProductionCases}>
            <PlayCircle size={14} aria-hidden="true" />
            {ctaCopy.productionCases}
          </button>
          <a
            href="https://unpkg.com/@ultigrid/core/README.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen size={14} aria-hidden="true" />
            {ctaCopy.packageDocs}
          </a>
        </nav>
      </header>

      <div className="repository-intro__content">
        <section className="repository-intro__section" aria-labelledby="repository-intro-layers">
          <header>
            <span>01</span>
            <h3 id="repository-intro-layers">{t('intro.layers.title')}</h3>
          </header>
          <div className="repository-intro__architecture">
            <div className="repository-intro__layer-options" role="group" aria-label={t('intro.layers.title')}>
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={activeLayer === layer.id ? 'is-active' : undefined}
                  aria-pressed={activeLayer === layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                >
                  <i>{layer.index}</i>
                  <span><strong>{layer.name}</strong><small>{layer.meta}</small></span>
                </button>
              ))}
            </div>
            <article className="repository-intro__layer-detail" aria-live="polite">
              <span>{selectedLayer.index}</span>
              <strong>{selectedLayer.name}</strong>
              <p>{selectedLayer.detail}</p>
              <small>{selectedLayer.meta}</small>
            </article>
          </div>
        </section>

        <section className="repository-intro__section" aria-labelledby="repository-intro-capabilities">
          <header>
            <span>02</span>
            <h3 id="repository-intro-capabilities">{t('intro.capabilities.title')}</h3>
          </header>
          <div className="repository-intro__capability-workbench">
            <div className="repository-intro__capability-tabs" role="group" aria-label={t('intro.capabilities.title')}>
              {(['basic', 'advanced'] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  className={activeCapability === group ? 'is-active' : undefined}
                  aria-pressed={activeCapability === group}
                  onClick={() => setActiveCapability(group)}
                >
                  {t(`gallery.group.${group}`)}
                </button>
              ))}
            </div>
            <article className="repository-intro__capability-detail" aria-live="polite">
              <span>{activeCapability === 'basic' ? '01' : '02'}</span>
              <strong>{t(`gallery.group.${activeCapability}`)}</strong>
              <p>{selectedCapability}</p>
            </article>
          </div>
        </section>
      </div>
    </section>
  )
}
