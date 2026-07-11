import type { ReactElement } from 'react'
import type { Locale, Translate } from '../i18n'

export interface GalleryExampleProps {
  locale: Locale
  t: Translate
}

export type GalleryExampleComponent = (props: GalleryExampleProps) => ReactElement
