import {
  ArrowUpRight,
  Github,
  Layers3,
  PackageOpen,
} from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../i18n'
import { GALLERY_EXAMPLES } from './galleryExamples'

const REPOSITORY_URL = 'https://github.com/Whiskeyi/UltimateRenderTable'
type IntroLayer = 'studio' | 'insight' | 'core'
type CapabilityGroup = 'basic' | 'advanced'

export function RepositoryIntro() {
  const { t } = useI18n()
  const [activeLayer, setActiveLayer] = useState<IntroLayer>('studio')
  const [activeCapability, setActiveCapability] = useState<CapabilityGroup>('basic')
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
      meta: t('intro.layer.package.meta'),
    },
    {
      id: 'core' as const,
      index: '03',
      name: '@ultigrid/core',
      detail: t('intro.layer.core'),
      meta: t('intro.layer.package.meta'),
    },
  ]
  const selectedLayer = layers.find((layer) => layer.id === activeLayer) ?? layers[0]!
  const selectedCapability = activeCapability === 'basic'
    ? t('intro.capabilities.basic')
    : t('intro.capabilities.advanced')

  return (
    <section className="repository-intro" aria-labelledby="repository-intro-title">
      <header className="repository-intro__hero">
        <div className="repository-intro__copy">
          <span><Layers3 size={15} /> {t('intro.eyebrow')}</span>
          <h2 id="repository-intro-title">{t('intro.title')}</h2>
          <p>{t('intro.detail')}</p>
        </div>

        <div className="repository-intro__hero-side">
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            <Github size={16} /> {t('intro.github')} <ArrowUpRight size={14} />
          </a>
          <dl className="repository-intro__stats">
            <div><dt>{t('intro.stats.scale')}</dt><dd>10¹⁰</dd></div>
            <div><dt>{t('intro.stats.examples')}</dt><dd>{GALLERY_EXAMPLES.length}</dd></div>
            <div><dt>{t('intro.stats.packages')}</dt><dd><PackageOpen size={17} /> 2</dd></div>
          </dl>
        </div>
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
