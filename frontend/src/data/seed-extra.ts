import { PATROL_RECHECK_KEY } from './extra'
import { CIRCUIT_RECHECK_SEED } from './secondary-circuit'
import type { ExtraMap } from './extra'

// 附加种子：不属于业务表、但跨模块联动要用到的数据（设备巡视的二次回路待复查清单）。
export const SEED_EXTRA: ExtraMap = {
  [PATROL_RECHECK_KEY]: CIRCUIT_RECHECK_SEED,
}
