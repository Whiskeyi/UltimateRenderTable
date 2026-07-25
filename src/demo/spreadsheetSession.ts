const DIRTY_STORAGE_KEY = 'ultigrid.spreadsheet-dirty.v1'
let dirtyInMemory = false

export function setSpreadsheetSessionDirty(dirty: boolean): void {
  dirtyInMemory = dirty
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(DIRTY_STORAGE_KEY, dirty ? '1' : '0')
  } catch {
    // The in-memory marker still protects the current document.
  }
}

export function hasDirtySpreadsheetSession(): boolean {
  if (dirtyInMemory) return true
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(DIRTY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
