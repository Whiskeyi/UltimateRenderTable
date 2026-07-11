import {
  ArrowUpRight,
  Github,
  Layers3,
  PackageOpen,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { GALLERY_EXAMPLES } from './galleryExamples'

const REPOSITORY_URL = 'https://github.com/Whiskeyi/UltimateRenderTable'

export function RepositoryIntro() {
  const { t } = useI18n()

  return (
    <section className="repository-intro" aria-labelledby="repository-intro-title">
      <header className="repository-intro__hero">
        <div className="repository-intro__copy">
          <span><Layers3 size={15} /> {t('intro.eyebrow')}</span>
          <h2 id="repository-intro-title">{t('intro.title')}</h2>
          <p>{t('intro.detail')}</p>
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            <Github size={16} /> {t('intro.github')} <ArrowUpRight size={14} />
          </a>
        </div>

        <dl className="repository-intro__stats">
          <div><dt>{t('intro.stats.scale')}</dt><dd>10¹⁰</dd></div>
          <div><dt>{t('intro.stats.examples')}</dt><dd>{GALLERY_EXAMPLES.length}</dd></div>
          <div><dt>{t('intro.stats.packages')}</dt><dd><PackageOpen size={17} /> 2</dd></div>
        </dl>
      </header>

      <div className="repository-intro__content">
        <section className="repository-intro__section" aria-labelledby="repository-intro-layers">
          <header>
            <span>01</span>
            <h3 id="repository-intro-layers">{t('intro.layers.title')}</h3>
          </header>
          <ol className="repository-intro__layers">
            <li>
              <i>01</i>
              <div><strong>Studio</strong><p>{t('intro.layer.studio')}</p></div>
              <small>{t('intro.layer.studio.meta')}</small>
            </li>
            <li>
              <i>02</i>
              <div><strong>@ultigrid/insight</strong><p>{t('intro.layer.insight')}</p></div>
              <small>{t('intro.layer.package.meta')}</small>
            </li>
            <li>
              <i>03</i>
              <div><strong>@ultigrid/core</strong><p>{t('intro.layer.core')}</p></div>
              <small>{t('intro.layer.package.meta')}</small>
            </li>
          </ol>
        </section>

        <section className="repository-intro__section" aria-labelledby="repository-intro-capabilities">
          <header>
            <span>02</span>
            <h3 id="repository-intro-capabilities">{t('intro.capabilities.title')}</h3>
          </header>
          <dl className="repository-intro__capabilities">
            <div>
              <dt>{t('gallery.group.basic')}</dt>
              <dd>{t('intro.capabilities.basic')}</dd>
            </div>
            <div>
              <dt>{t('gallery.group.advanced')}</dt>
              <dd>{t('intro.capabilities.advanced')}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  )
}
