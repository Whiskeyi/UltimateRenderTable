const DEFAULT_CLIPBOARD_TIMEOUT_MS = 800

export async function writeClipboard(
  text: string,
  timeoutMs = DEFAULT_CLIPBOARD_TIMEOUT_MS,
): Promise<void> {
  if (navigator.clipboard?.writeText) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Clipboard write timed out')), timeoutMs)
        }),
      ])
      return
    } catch {
      // Sandboxed embeds may expose the API but reject it; use the DOM fallback.
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
  const previousFocus = document.activeElement as HTMLElement | null
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  textarea.tabIndex = -1
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
    if (previousFocus && previousFocus !== textarea) {
      try {
        previousFocus.focus({ preventScroll: true })
      } catch {
        try {
          previousFocus.focus()
        } catch {
          // Focus restoration is best effort after the clipboard operation.
        }
      }
    }
  }
  if (!copied) throw new Error('Clipboard copy was rejected')
}
