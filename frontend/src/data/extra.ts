/** 二次回路检查与设备巡视联动用的跨模块数据结构。 */

export const PATROL_RECHECK_KEY = 'patrol-circuit-recheck'

export type CircuitRecheckItem = {
  id: number
  检查编号: string
  所属间隔: string
  回路类别: string
  端子排编号: string
  绝缘电阻: string
  检查人: string
  检查日期: string
  整改要求: string
  提出日期: string
  复测绝缘电阻: string
  复测日期: string
  复测结论: string
  复查状态: string
  复查人: string
  复查日期: string
  备注: string
}

export type ExtraMap = {
  [PATROL_RECHECK_KEY]: CircuitRecheckItem[]
}

export type ExtraKey = keyof ExtraMap
