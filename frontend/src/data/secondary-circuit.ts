import type { EntryRow } from '@/data/types'
import type { CircuitRecheckItem } from '@/data/extra'

/**
 * 二次回路检查的业务口径集中在这里：
 * - 回路类别、绝缘电阻合格标准沿用既有台账口径，不在页面里各写一份；
 * - 绝缘电阻做过复测时，以复测值为准（列表、册子、判定都走 effectiveResistance）。
 */

export const CIRCUIT_CATEGORIES = [
  '控制回路',
  '信号回路',
  '保护回路',
  '测量回路',
  '计量回路',
  '操作回路',
] as const

// 二次回路绝缘电阻不低于 1MΩ（沿用现场常用验收口径）。
export const INSULATION_LIMIT_MOHM = 1

export type SecondaryRow = EntryRow & {
  检查编号: string
  所属间隔: string
  回路类别: string
  端子排编号: string
  绝缘电阻: string
  检查人: string
  检查日期: string
  回路状态?: string
  复测绝缘电阻?: string
  复测人?: string
  复测日期?: string
  整改要求?: string
  整改提出日期?: string
}

/** 把登记口径里的绝缘电阻统一解析成 MΩ 数值；未测或无法识别返回 null。 */
export function parseResistanceMohm(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const text = String(raw).trim()
  if (!text) return null
  const match = text.match(/^([\d.]+)\s*(mΩ|兆欧|kΩ|k欧|Ω|欧姆)?$/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const unit = (match[2] ?? 'MΩ').toLowerCase()
  if (unit === 'kΩ' || unit === 'k欧') return value / 1000
  if (unit === 'Ω' || unit === '欧姆') return value / 1_000_000
  return value
}

/** 统一展示成 MΩ 文本，复测回填与原测同口径。 */
export function formatResistanceMohm(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${rounded}MΩ`
}

/** 有效绝缘电阻：复测过就以复测那一次为准。 */
export function effectiveResistance(row: SecondaryRow): number | null {
  const retest = parseResistanceMohm(row.复测绝缘电阻)
  if (retest !== null) return retest
  return parseResistanceMohm(row.绝缘电阻)
}

/** 列表/册子共用的绝缘电阻展示文本，保持两处同一份口径。 */
export function effectiveResistanceText(row: SecondaryRow): string {
  const value = effectiveResistance(row)
  return value === null ? '' : formatResistanceMohm(value)
}

export function isResistanceQualified(row: SecondaryRow): boolean {
  const value = effectiveResistance(row)
  return value !== null && value >= INSULATION_LIMIT_MOHM
}

/** 是否存在一次低于标准的测量结果（用来提示需要复测）。 */
export function hasBelowStandardReading(row: SecondaryRow): boolean {
  const readings = [parseResistanceMohm(row.绝缘电阻), parseResistanceMohm(row.复测绝缘电阻)]
  return readings.some((value) => value !== null && value < INSULATION_LIMIT_MOHM)
}

/** 同一段回路：所属间隔 + 回路类别 + 端子排编号 三者一致即为同一段。 */
export function circuitKey(row: Pick<SecondaryRow, '所属间隔' | '回路类别' | '端子排编号'>): string {
  return [row.所属间隔, row.回路类别, row.端子排编号].map((item) => String(item).trim()).join('/')
}

export function asSecondary(row: EntryRow): SecondaryRow {
  return row as SecondaryRow
}

/** 巡视待复查清单的种子：与二次回路种子里的需整改回路（SECO-0004）对应。 */
export const CIRCUIT_RECHECK_SEED: CircuitRecheckItem[] = [
  {
    id: 1,
    检查编号: 'SECO-0004',
    所属间隔: '110kV 出线间隔',
    回路类别: '保护回路',
    端子排编号: 'X110-04',
    绝缘电阻: '0.6MΩ',
    检查人: '王强',
    检查日期: '2026-10-01',
    整改要求: '端子排受潮，清洁烘干并复测绝缘，合格后转巡视复查',
    提出日期: '2026-10-01',
    复测绝缘电阻: '',
    复测日期: '',
    复测结论: '',
    复查状态: '待复查',
    复查人: '',
    复查日期: '',
    备注: '',
  },
]
