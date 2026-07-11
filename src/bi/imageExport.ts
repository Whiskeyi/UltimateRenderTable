import { downloadBlob } from './excelExport.js'

export interface TableImageExportOptions {
  fileName?: string
  format?: 'png' | 'jpeg'
  quality?: number
  pixelRatio?: number
  backgroundColor?: string
  width?: number
  height?: number
  cacheBust?: boolean
  skipFonts?: boolean
  filter?: (node: HTMLElement) => boolean
  download?: boolean
}

export interface TableImageExportArtifact {
  blob: Blob
  dataUrl: string
  format: 'png' | 'jpeg'
}

/** Captures the supplied table shell; callers decide whether that is viewport-only or fully laid out. */
export async function createTableImageExport(
  element: HTMLElement,
  options: TableImageExportOptions = {},
): Promise<TableImageExportArtifact> {
  const image = await import('html-to-image')
  const format = options.format ?? 'png'
  const renderOptions = {
    quality: options.quality,
    pixelRatio: options.pixelRatio,
    backgroundColor: options.backgroundColor,
    width: options.width,
    height: options.height,
    cacheBust: options.cacheBust,
    skipFonts: options.skipFonts,
    filter: options.filter,
  }
  const dataUrl =
    format === 'jpeg'
      ? await image.toJpeg(element, renderOptions)
      : await image.toPng(element, renderOptions)
  const blob = dataUrlToBlob(dataUrl)
  return { blob, dataUrl, format }
}

export async function exportTableToImage(
  element: HTMLElement,
  options: TableImageExportOptions = {},
): Promise<TableImageExportArtifact> {
  const artifact = await createTableImageExport(element, options)
  if (options.download !== false) {
    const extension = artifact.format === 'jpeg' ? '.jpg' : '.png'
    const baseName = options.fileName ?? 'table-export'
    const fileName = /\.(?:png|jpe?g)$/i.test(baseName) ? baseName : `${baseName}${extension}`
    downloadBlob(artifact.blob, fileName)
  }
  return artifact
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('Image encoder returned an invalid data URL')
  const metadata = dataUrl.slice(0, separator)
  const payload = dataUrl.slice(separator + 1)
  const mime = /^data:([^;,]+)/.exec(metadata)?.[1] ?? 'image/png'
  const binary = metadata.includes(';base64') ? decodeBase64(payload) : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') return atob(value)
  throw new Error('Base64 decoding is unavailable in this environment')
}
