export async function writeTextToClipboard(text: string, timeoutMs = 800): Promise<void> {
  if (navigator.clipboard?.writeText) {
    let timeout = 0
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error('clipboard-timeout')), timeoutMs)
        }),
      ])
      return
    } catch {
      // Sandboxed previews may expose Clipboard API without resolving it.
    } finally {
      if (timeout) window.clearTimeout(timeout)
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('clipboard-unavailable')
}
