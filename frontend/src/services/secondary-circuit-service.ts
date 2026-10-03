import { getExtra, listRows, saveExtra, saveRows } from '@/data/local-store'
import { PATROL_RECHECK_KEY } from '@/data/extra'
import type { ActionResult } from '@/data/types'
import type { CircuitRecheckItem } from '@/data/extra'
import {
  CIRCUIT_CATEGORIES,
  INSULATION_LIMIT_MOHM,
  asSecondary,
  circuitKey,
  effectiveResistance,
  effectiveResistanceText,
  formatResistanceMohm,
  isResistanceQualified,
  parseResistanceMohm,
} from '@/data/secondary-circuit'
import type { SecondaryRow } from '@/data/secondary-circuit'

const MODULE_KEY = 'secondarycircuit'
const RECHECK_STATUS_DONE = '已复查'
const RECHECK_STATUS_PENDING = '待复查'

function load(): SecondaryRow[] {
  return listRows(MODULE_KEY).map(asSecondary)
}

function persist(rows: SecondaryRow[]): void {
  saveRows(MODULE_KEY, rows)
}

function loadRechecks(): CircuitRecheckItem[] {
  return getExtra<CircuitRecheckItem>(PATROL_RECHECK_KEY)
}

function persistRechecks(rows: CircuitRecheckItem[]): void {
  saveExtra(PATROL_RECHECK_KEY, rows)
}

function nextCheckNo(rows: SecondaryRow[]): string {
  const max = rows.reduce((acc, row) => {
    const match = String(row.检查编号).match(/(\d+)$/)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `SECO-${String(max + 1).padStart(4, '0')}`
}

function syncRecheckFromRow(rows: CircuitRecheckItem[], row: SecondaryRow): void {
  const index = rows.findIndex((item) => item.检查编号 === row.检查编号)
  if (index < 0) return
  rows[index] = {
    ...rows[index],
    所属间隔: row.所属间隔,
    回路类别: row.回路类别,
    端子排编号: row.端子排编号,
    绝缘电阻: row.绝缘电阻,
    检查人: row.检查人,
    检查日期: row.检查日期,
    复测绝缘电阻: effectiveResistanceText(row),
    复测日期: String(row.复测日期 ?? ''),
    复测结论:
      effectiveResistance(row) === null
        ? rows[index].复测结论
        : isResistanceQualified(row)
          ? `复测绝缘电阻${effectiveResistanceText(row)}，满足不低于${INSULATION_LIMIT_MOHM}MΩ标准，待巡视复查`
          : `复测绝缘电阻${effectiveResistanceText(row)}，仍低于${INSULATION_LIMIT_MOHM}MΩ标准，继续整改`,
  }
}

export type RegisterInput = {
  所属间隔: string
  回路类别: string
  端子排编号: string
  检查人: string
  检查日期: string
}

export type RetestInput = {
  复测绝缘电阻: string
  复测人: string
  复测日期: string
}

export type RectifyInput = {
  整改要求: string
  提出日期: string
}

export type SecondaryViewRow = SecondaryRow & {
  有效绝缘电阻: string
  已复测: boolean
}

export function toViewRow(row: SecondaryRow): SecondaryViewRow {
  return {
    ...row,
    有效绝缘电阻: effectiveResistanceText(row),
    已复测: parseResistanceMohm(row.复测绝缘电阻) !== null,
  }
}

/** 同一段回路（间隔+类别+端子排）当期已有未闭环记录或同检查日期记录的，重复提交只记一次。 */
export function registerEntry(input: RegisterInput): ActionResult {
  const trimmed = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, String(value).trim()]),
  ) as RegisterInput
  for (const field of ['所属间隔', '回路类别', '端子排编号', '检查人', '检查日期'] as const) {
    if (!trimmed[field]) {
      return { ok: false, message: `请填写${field}后再登记` }
    }
  }
  if (!CIRCUIT_CATEGORIES.includes(trimmed.回路类别 as (typeof CIRCUIT_CATEGORIES)[number])) {
    return { ok: false, message: '回路类别须从既有类别中选择' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed.检查日期)) {
    return { ok: false, message: '检查日期格式应为 YYYY-MM-DD' }
  }

  const rows = load()
  const duplicate = rows.find((row) => {
    if (circuitKey(row) !== circuitKey(trimmed)) return false
    if (row.检查日期 === trimmed.检查日期) return true
    return row.status !== '检查合格'
  })
  if (duplicate) {
    return {
      ok: false,
      message: `该段回路${duplicate.检查日期}已登记检查（编号${duplicate.检查编号}，状态「${duplicate.status}」），同一段回路不重复记录`,
    }
  }

  const now: SecondaryRow = {
    id: rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1,
    status: '待检查',
    pending: true,
    abnormal: false,
    检查编号: nextCheckNo(rows),
    所属间隔: trimmed.所属间隔,
    回路类别: trimmed.回路类别,
    端子排编号: trimmed.端子排编号,
    绝缘电阻: '',
    检查人: trimmed.检查人,
    检查日期: trimmed.检查日期,
    回路状态: '待检查',
    复测绝缘电阻: '',
    复测人: '',
    复测日期: '',
    整改要求: '',
    整改提出日期: '',
  }
  persist([...rows, now])
  return { ok: true, message: `已登记检查记录 ${now.检查编号}，提交检查时回填绝缘电阻` }
}

/** 提交检查：录入本次绝缘电阻，沿用既有字段口径。 */
export function submitCheck(id: number, resistanceText: string): ActionResult {
  const value = parseResistanceMohm(resistanceText)
  if (value === null) {
    return { ok: false, message: '绝缘电阻无法识别，请按「12.5MΩ」或「0.8兆欧」格式填写' }
  }
  const rows = load()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条检查记录' }
  if (rows[index].status !== '待检查') {
    return { ok: false, message: `当前状态「${rows[index].status}」不能提交检查` }
  }
  rows[index] = {
    ...rows[index],
    绝缘电阻: formatResistanceMohm(value),
    status: '检查中',
    pending: true,
    abnormal: false,
    回路状态:
      value < INSULATION_LIMIT_MOHM ? `绝缘低于${INSULATION_LIMIT_MOHM}MΩ，待检查人复测` : '已测绝缘，待判定',
  }
  persist(rows)
  return {
    ok: true,
    message:
      value < INSULATION_LIMIT_MOHM
        ? `绝缘电阻${formatResistanceMohm(value)}低于${INSULATION_LIMIT_MOHM}MΩ标准，须由检查人复测后回填`
        : `绝缘电阻${formatResistanceMohm(value)}，可判定合格`,
  }
}

/** 复测回填：复测值成为有效绝缘电阻（冲突时以复测那一次为准）。 */
export function retestFill(id: number, input: RetestInput): ActionResult {
  const value = parseResistanceMohm(input.复测绝缘电阻)
  if (value === null) {
    return { ok: false, message: '复测绝缘电阻无法识别，请按「12.5MΩ」格式填写' }
  }
  const person = input.复测人.trim()
  const date = input.复测日期.trim()
  if (!person) return { ok: false, message: '请填写复测人（即执行复测的检查人）' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: '复测日期格式应为 YYYY-MM-DD' }
  }

  const rows = load()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条检查记录' }
  if (!['检查中', '需整改'].includes(rows[index].status)) {
    return { ok: false, message: `当前状态「${rows[index].status}」没有待回填的复测结果` }
  }

  rows[index] = {
    ...rows[index],
    复测绝缘电阻: formatResistanceMohm(value),
    复测人: person,
    复测日期: date,
    回路状态:
      value >= INSULATION_LIMIT_MOHM
        ? `复测合格（复测人${person}）`
        : `复测${formatResistanceMohm(value)}仍低于标准，继续整改`,
  }
  persist(rows)

  const rechecks = loadRechecks()
  syncRecheckFromRow(rechecks, rows[index])
  persistRechecks(rechecks)

  return {
    ok: true,
    message:
      value >= INSULATION_LIMIT_MOHM
        ? `复测绝缘电阻${formatResistanceMohm(value)}已回填，满足标准，可判定合格`
        : `复测绝缘电阻${formatResistanceMohm(value)}已回填，仍低于${INSULATION_LIMIT_MOHM}MΩ，须继续整改`,
  }
}

/** 判定合格：以有效绝缘电阻（复测优先）对照标准。 */
export function markQualified(id: number): ActionResult {
  const rows = load()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条检查记录' }
  const row = rows[index]
  if (!['检查中', '需整改'].includes(row.status)) {
    return { ok: false, message: `当前状态「${row.status}」不能判定合格` }
  }
  const value = effectiveResistance(row)
  if (value === null) {
    return { ok: false, message: '还没有绝缘电阻记录，请先提交检查或由检查人复测回填' }
  }
  if (value < INSULATION_LIMIT_MOHM) {
    return {
      ok: false,
      message: `有效绝缘电阻${formatResistanceMohm(value)}低于${INSULATION_LIMIT_MOHM}MΩ标准，不能判定合格`,
    }
  }

  const wasRectification = row.status === '需整改'
  rows[index] = {
    ...row,
    status: '检查合格',
    pending: wasRectification, // 整改后仍等巡视复查闭环
    abnormal: false,
    回路状态: wasRectification ? '整改复测合格，待巡视复查' : '合格',
  }
  persist(rows)

  // 整改要求的结论一并反映到设备巡视那边的待复查清单。
  const rechecks = loadRechecks()
  syncRecheckFromRow(rechecks, rows[index])
  persistRechecks(rechecks)

  return {
    ok: true,
    message: wasRectification
      ? '已判定合格，整改结论已同步至设备巡视待复查清单'
      : '该回路检查合格',
  }
}

/** 提出整改：结论同步进设备巡视的待复查清单（同一检查编号不重复挂账）。 */
export function proposeRectification(id: number, input: RectifyInput): ActionResult {
  const requirement = input.整改要求.trim()
  const date = input.提出日期.trim()
  if (!requirement) return { ok: false, message: '请填写整改要求后再提出整改' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: '提出日期格式应为 YYYY-MM-DD' }
  }

  const rows = load()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条检查记录' }
  const row = rows[index]
  if (row.status === '检查合格') {
    return { ok: false, message: '该回路已检查合格，不能提出整改' }
  }
  if (effectiveResistance(row) === null) {
    return { ok: false, message: '还没有绝缘电阻记录，请先提交检查' }
  }

  rows[index] = {
    ...row,
    status: '需整改',
    pending: true,
    abnormal: true,
    整改要求: requirement,
    整改提出日期: date,
    回路状态: '绝缘不合格，待整改',
  }
  persist(rows)

  const rechecks = loadRechecks()
  const existing = rechecks.find((item) => item.检查编号 === row.检查编号)
  if (existing) {
    syncRecheckFromRow(rechecks, rows[index])
    const at = rechecks.findIndex((item) => item.检查编号 === row.检查编号)
    rechecks[at] = {
      ...rechecks[at],
      整改要求: requirement,
      提出日期: date,
      复查状态: RECHECK_STATUS_PENDING,
      复查人: '',
      复查日期: '',
    }
  } else {
    rechecks.push({
      id: rechecks.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1,
      检查编号: row.检查编号,
      所属间隔: row.所属间隔,
      回路类别: row.回路类别,
      端子排编号: row.端子排编号,
      绝缘电阻: row.绝缘电阻,
      检查人: row.检查人,
      检查日期: row.检查日期,
      整改要求: requirement,
      提出日期: date,
      复测绝缘电阻: effectiveResistanceText(row),
      复测日期: String(row.复测日期 ?? ''),
      复测结论: '',
      复查状态: RECHECK_STATUS_PENDING,
      复查人: '',
      复查日期: '',
      备注: '',
    })
  }
  persistRechecks(rechecks)

  return { ok: true, message: '已提出整改，整改要求已挂到设备巡视的待复查清单' }
}

// ---------------------------------------------------------------------------
// 成册导出
// ---------------------------------------------------------------------------

export type BookletFilter = {
  dateFrom: string
  dateTo: string
}

export type BookletFile = {
  filename: string
  content: string
}

const BOOKLET_COLUMNS = [
  '检查编号',
  '所属间隔',
  '回路类别',
  '端子排编号',
  '绝缘电阻',
  '检查人',
  '检查日期',
  '复测标记',
  '当前状态',
  '整改要求',
]

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(lines: string[][]): string {
  return `﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`
}

function inPeriod(date: string, filter: BookletFilter): boolean {
  if (filter.dateFrom && date < filter.dateFrom) return false
  if (filter.dateTo && date > filter.dateTo) return false
  return true
}

function periodLabel(filter: BookletFilter): string {
  if (filter.dateFrom && filter.dateTo) return `${filter.dateFrom} 至 ${filter.dateTo}`
  if (filter.dateFrom) return `${filter.dateFrom} 起`
  if (filter.dateTo) return `截至 ${filter.dateTo}`
  return '全部检查记录'
}

function dataLines(row: SecondaryRow): string[] {
  return [
    row.检查编号,
    row.所属间隔,
    row.回路类别,
    row.端子排编号,
    effectiveResistanceText(row),
    row.检查人,
    row.检查日期,
    parseResistanceMohm(row.复测绝缘电阻) !== null ? `复测（${row.复测日期 ?? ''}）` : '原测',
    row.status,
    row.整改要求 ?? '',
  ]
}

/**
 * 按回路类别打包成册：每个固定类别一册，需整改回路单独一册；
 * 某册当期无记录时写一行说明，不产生空册。
 */
export function buildCircuitBooklets(filter: BookletFilter): BookletFile[] {
  const periodRows = load().filter((row) => inPeriod(row.检查日期, filter))
  const range = periodLabel(filter)
  const files: BookletFile[] = []

  for (const category of CIRCUIT_CATEGORIES) {
    const rows = periodRows.filter((row) => row.回路类别 === category)
    const lines: string[][] = [
      [`二次回路检查分册（回路类别：${category}）`],
      ['回路类别', category],
      ['检查日期范围', range],
      ['绝缘电阻标准', `不低于${INSULATION_LIMIT_MOHM}MΩ；做过复测的以复测值为准`],
      [],
      BOOKLET_COLUMNS,
    ]
    if (rows.length === 0) {
      lines.push([`说明：本期（${range}）该回路类别无检查记录。`])
    } else {
      rows.forEach((row) => lines.push(dataLines(row)))
    }
    files.push({ filename: `二次回路检查册-${category}.csv`, content: toCsv(lines) })
  }

  const rectifyRows = periodRows.filter((row) => row.status === '需整改')
  const rectifyLines: string[][] = [
    ['二次回路检查分册（需整改回路）'],
    ['回路类别', '需整改回路（跨类别汇总）'],
    ['检查日期范围', range],
    ['绝缘电阻标准', `不低于${INSULATION_LIMIT_MOHM}MΩ；低于标准的由检查人复测后回填，以复测值为准`],
    [],
    BOOKLET_COLUMNS,
  ]
  if (rectifyRows.length === 0) {
    rectifyLines.push([`说明：本期（${range}）无需要整改的二次回路。`])
  } else {
    rectifyRows.forEach((row) => rectifyLines.push(dataLines(row)))
  }
  files.push({ filename: '二次回路检查册-需整改回路.csv', content: toCsv(rectifyLines) })

  return files
}

/** 平面清单导出：绝缘电阻同样取复测优先的有效值，保证与册子同一份。 */
export function exportFlatCsv(filter: BookletFilter): BookletFile {
  const rows = load().filter((row) => inPeriod(row.检查日期, filter))
  const lines: string[][] = [
    ['检查编号', '所属间隔', '回路类别', '端子排编号', '绝缘电阻', '检查人', '检查日期', '复测标记', '当前状态'],
  ]
  rows.forEach((row) => lines.push(dataLines(row).slice(0, 9)))
  return {
    filename: `二次回路检查清单-${periodLabel(filter).replace(/\s/g, '')}.csv`,
    content: toCsv(lines),
  }
}

// ---------------------------------------------------------------------------
// 设备巡视侧：待复查清单
// ---------------------------------------------------------------------------

export type RecheckViewRow = CircuitRecheckItem & {
  有效绝缘电阻: string
  已复测: boolean
  当前回路状态: string
}

/** 巡视待复查清单：以检查编号关联检查记录，绝缘电阻实时取同一份有效值。 */
export function listRechecks(): RecheckViewRow[] {
  const rows = load()
  return loadRechecks().map((item) => {
    const linked = rows.find((row) => row.检查编号 === item.检查编号)
    return {
      ...item,
      绝缘电阻: linked ? linked.绝缘电阻 : item.绝缘电阻,
      整改要求: linked?.整改要求 || item.整改要求,
      有效绝缘电阻: linked ? effectiveResistanceText(linked) : item.复测绝缘电阻,
      已复测: linked ? parseResistanceMohm(linked.复测绝缘电阻) !== null : item.复测绝缘电阻 !== '',
      当前回路状态: linked ? linked.status : '记录缺失',
      复测绝缘电阻: linked ? effectiveResistanceText(linked) : item.复测绝缘电阻,
    }
  })
}

export function completeRecheck(id: number, reviewer: string, note: string): ActionResult {
  const person = reviewer.trim()
  if (!person) return { ok: false, message: '请填写复查人' }
  const rows = loadRechecks()
  const index = rows.findIndex((item) => Number(item.id) === id)
  if (index < 0) return { ok: false, message: '没有找到这条待复查记录' }
  if (rows[index].复查状态 === RECHECK_STATUS_DONE) {
    return { ok: false, message: '该回路已完成复查，不用重复操作' }
  }
  const today = new Date().toISOString().slice(0, 10)
  rows[index] = {
    ...rows[index],
    复查状态: RECHECK_STATUS_DONE,
    复查人: person,
    复查日期: today,
    备注: note.trim(),
  }
  persistRechecks(rows)

  // 复查通过后把检查记录从待闭环状态收尾。
  const circuitRows = load()
  const at = circuitRows.findIndex((row) => row.检查编号 === rows[index].检查编号)
  if (at >= 0 && circuitRows[at].status === '检查合格') {
    circuitRows[at] = { ...circuitRows[at], pending: false }
    persist(circuitRows)
  }
  return { ok: true, message: `已完成复查（复查人：${person}）` }
}

export const RECHECK_PENDING_STATUS = RECHECK_STATUS_PENDING
export const RECHECK_DONE_STATUS = RECHECK_STATUS_DONE
