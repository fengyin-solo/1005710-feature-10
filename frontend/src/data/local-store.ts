import { SEED_ROWS } from './seed'
import { SEED_EXTRA } from './seed-extra'
import type { ExtraKey, ExtraMap } from './extra'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// 末尾版本号随种子/结构调整而抬升，抬升后旧浏览器里的缓存整体让位于新种子。
const STORAGE_KEY = 'substation-protection:entries:v2'
const EXTRA_STORAGE_KEY = 'substation-protection:extra:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

function readExtraStorage(): ExtraMap {
  const fallback = clone(SEED_EXTRA)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(EXTRA_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ExtraMap>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null
let extraCache: ExtraMap | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 附加数据不属于任何一张业务表，例如跨模块联动生成的待复查清单。
export function getExtra<T>(key: ExtraKey): T[] {
  if (extraCache === null) {
    extraCache = readExtraStorage()
  }
  return (extraCache[key] ?? []) as unknown as T[]
}

export function saveExtra<T>(key: ExtraKey, rows: T[]): void {
  if (extraCache === null) {
    extraCache = readExtraStorage()
  }
  const next = { ...extraCache, [key]: rows } as ExtraMap
  extraCache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(next))
  }
}
