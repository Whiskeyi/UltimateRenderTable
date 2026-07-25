import type { ReactElement } from 'react'
import type { Locale, Translate } from '../i18n'

export const GALLERY_EXAMPLE_COUNT = 14

export interface GalleryExampleProps {
  locale: Locale
  t: Translate
}

export type GalleryExampleComponent = (props: GalleryExampleProps) => ReactElement
