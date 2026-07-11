import type {
  MobileInteractionLabels,
  MobileInteractionOptions,
} from './viewportTypes.js'

export const TOUCH_CAPABLE_POINTER_QUERY = '(pointer: coarse), (any-pointer: coarse)'

export const DEFAULT_MOBILE_INTERACTION_LABELS: MobileInteractionLabels = {
  copySelection: 'Copy',
  copySuccess: 'Copied',
  copyError: 'Copy failed',
  selectionHandle: 'Drag to extend selection',
  selectionActions: 'Selection actions',
}

export interface ResolvedMobileInteractionOptions {
  mode: 'auto' | 'always' | 'off'
  tapSlop: number
  edgeAutoScrollThreshold: number
  showCopyAction: boolean
  labels: MobileInteractionLabels
}

export interface TouchTapGesture {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

export function resolveMobileInteractionOptions(
  value: boolean | MobileInteractionOptions | undefined,
): ResolvedMobileInteractionOptions {
  const options = typeof value === 'object' ? value : undefined
  return {
    mode: value === true ? 'always' : value === false ? 'off' : options?.mode ?? 'auto',
    tapSlop: clampFinite(options?.tapSlop, 10, 2, 32),
    edgeAutoScrollThreshold: clampFinite(options?.edgeAutoScrollThreshold, 36, 0, 96),
    showCopyAction: options?.showCopyAction ?? true,
    labels: {
      ...DEFAULT_MOBILE_INTERACTION_LABELS,
      ...options?.labels,
    },
  }
}

export function createTouchTapGesture(
  pointerId: number,
  x: number,
  y: number,
): TouchTapGesture {
  return { pointerId, startX: x, startY: y, moved: false }
}

export function updateTouchTapGesture(
  gesture: TouchTapGesture,
  pointerId: number,
  x: number,
  y: number,
  tapSlop: number,
): TouchTapGesture {
  if (gesture.pointerId !== pointerId || gesture.moved) return gesture
  const deltaX = x - gesture.startX
  const deltaY = y - gesture.startY
  return deltaX * deltaX + deltaY * deltaY > tapSlop * tapSlop
    ? { ...gesture, moved: true }
    : gesture
}

export function isCompletedTouchTap(
  gesture: TouchTapGesture | null,
  pointerId: number,
): boolean {
  return Boolean(gesture && gesture.pointerId === pointerId && !gesture.moved)
}

export function detectTouchFirstInput(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (window.matchMedia?.(TOUCH_CAPABLE_POINTER_QUERY).matches) return true
  return navigator.maxTouchPoints > 0
}

function clampFinite(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}
