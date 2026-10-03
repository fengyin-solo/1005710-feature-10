<template>
  <section class="page" data-module="secondarycircuit">
    <header class="page-head">
      <div>
        <h2>二次回路检查管理</h2>
        <p class="page-desc">围绕检查编号、所属间隔、回路类别、端子排编号、绝缘电阻做登记、复测回填与按类别成册导出；整改回路同步挂到设备巡视待复查清单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openRegister">登记回路检查记录</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item legend-tip">绝缘电阻标准：不低于 {{ INSULATION_LIMIT_MOHM }}MΩ，复测后以复测值为准</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <section class="export-bar">
      <span class="export-title">按回路类别成册打包</span>
      <label class="filter-item">
        <span>检查日期起</span>
        <input v-model="bookletRange.dateFrom" type="date" />
      </label>
      <label class="filter-item">
        <span>检查日期止</span>
        <input v-model="bookletRange.dateTo" type="date" />
      </label>
      <button class="btn primary" type="button" @click="downloadBooklets">下载分册（ZIP）</button>
      <button class="btn" type="button" @click="downloadFlat">导出本期清单（CSV）</button>
      <span class="export-hint">每个回路类别一册，需整改回路单独一册；当期无记录的类别册内写明说明，不空册。</span>
    </section>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <template v-if="column === '绝缘电阻'">
              <span>{{ row.有效绝缘电阻 || '未测量' }}</span>
              <em v-if="row.已复测" class="tag tag-retest">复测</em>
            </template>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>
            {{ row.status }}
            <em v-if="row.status === '检查合格' && row.pending" class="tag tag-wait">待巡视复查</em>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actionsFor(row)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <span v-if="actionsFor(row).length === 0" class="muted-text">—</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无二次回路检查数据，可先登记回路检查记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条二次回路检查记录；同一段回路（间隔+类别+端子排）当期重复提交只记一次</span>
      <span v-if="message" :class="messageOk ? 'success-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="dialog.type" class="modal-mask" @click.self="closeDialog">
      <div class="modal-card">
        <header class="modal-head">
          <h3>{{ dialogTitle }}</h3>
          <button class="link" type="button" @click="closeDialog">关闭</button>
        </header>

        <div v-if="dialog.type === 'register'" class="modal-body">
          <p class="modal-tip">同一段回路（所属间隔＋回路类别＋端子排编号）当期已登记的，不重复记录。</p>
          <div class="form-grid">
            <label class="form-field">
              <span>所属间隔</span>
              <input v-model="form.所属间隔" placeholder="如 10kV Ⅰ段母线间隔" />
            </label>
            <label class="form-field">
              <span>回路类别</span>
              <select v-model="form.回路类别">
                <option value="" disabled>请选择</option>
                <option v-for="category in CIRCUIT_CATEGORIES" :key="category" :value="category">{{ category }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>端子排编号</span>
              <input v-model="form.端子排编号" placeholder="如 X101-01" />
            </label>
            <label class="form-field">
              <span>检查人</span>
              <input v-model="form.检查人" :placeholder="`当前值班：${store.operator}`" />
            </label>
            <label class="form-field">
              <span>检查日期</span>
              <input v-model="form.检查日期" type="date" />
            </label>
          </div>
        </div>

        <div v-else-if="dialog.type === 'submit'" class="modal-body">
          <p class="modal-tip">
            {{ activeRow?.检查编号 }} · {{ activeRow?.所属间隔 }} · {{ activeRow?.回路类别 }} · 端子排 {{ activeRow?.端子排编号 }}
          </p>
          <label class="form-field">
            <span>本次绝缘电阻（低于 {{ INSULATION_LIMIT_MOHM }}MΩ 须由检查人复测后回填）</span>
            <input v-model="form.resistance" placeholder="如 12.5MΩ / 0.8兆欧" />
          </label>
        </div>

        <div v-else-if="dialog.type === 'retest'" class="modal-body">
          <p class="modal-tip">
            {{ activeRow?.检查编号 }} · 当前有效绝缘电阻：{{ activeRow?.有效绝缘电阻 || '未测量' }}；复测值回填后以复测那一次为准。
          </p>
          <div class="form-grid">
            <label class="form-field">
              <span>复测绝缘电阻</span>
              <input v-model="form.resistance" placeholder="如 15MΩ" />
            </label>
            <label class="form-field">
              <span>复测人（检查人）</span>
              <input v-model="form.复测人" />
            </label>
            <label class="form-field">
              <span>复测日期</span>
              <input v-model="form.复测日期" type="date" />
            </label>
          </div>
        </div>

        <div v-else-if="dialog.type === 'rectify'" class="modal-body">
          <p class="modal-tip">{{ activeRow?.检查编号 }} · 有效绝缘电阻 {{ activeRow?.有效绝缘电阻 }}，整改要求将同步到设备巡视待复查清单。</p>
          <label class="form-field">
            <span>整改要求</span>
            <textarea v-model="form.整改要求" rows="3" placeholder="如 端子排受潮，清洁烘干并复测绝缘"></textarea>
          </label>
          <label class="form-field">
            <span>提出日期</span>
            <input v-model="form.提出日期" type="date" />
          </label>
        </div>

        <footer class="modal-foot">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="confirmDialog">确定</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { listEntries } from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import { downloadBlob, downloadText, safeFilename } from '@/utils/download'
import { buildZip } from '@/utils/zip'
import {
  CIRCUIT_CATEGORIES,
  INSULATION_LIMIT_MOHM,
  isResistanceQualified,
} from '@/data/secondary-circuit'
import type { SecondaryRow } from '@/data/secondary-circuit'
import {
  buildCircuitBooklets,
  exportFlatCsv,
  listRechecks,
  markQualified,
  proposeRectification,
  registerEntry,
  retestFill,
  submitCheck,
  toViewRow,
} from '@/services/secondary-circuit-service'
import type { BookletFilter, SecondaryViewRow } from '@/services/secondary-circuit-service'

const store = useSessionStore()

const columns = ['检查编号', '所属间隔', '回路类别', '端子排编号', '绝缘电阻', '检查人', '检查日期']
const statuses = ['待检查', '检查中', '检查合格', '需整改']

const rows = ref<SecondaryViewRow[]>([])
const total = ref(0)
const message = ref('')
const messageOk = ref(false)
const filters = ref<Record<string, string>>({})
const filterFields = ['检查编号', '所属间隔', '回路类别']
const bookletRange = reactive<BookletFilter>({ dateFrom: '', dateTo: '' })

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

const stats = computed(() => [
  { label: '待检查回路', value: rows.value.filter((row) => row.status === '待检查').length },
  { label: '检查合格回路', value: rows.value.filter((row) => row.status === '检查合格').length },
  { label: '需整改回路', value: rows.value.filter((row) => row.status === '需整改').length },
  { label: '巡视待复查', value: listRechecks().filter((item) => item.复查状态 === '待复查').length },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function actionsFor(row: SecondaryViewRow): string[] {
  switch (row.status) {
    case '待检查':
      return ['提交检查']
    case '检查中':
      return [
        ...(isResistanceQualified(row) ? [] : ['复测回填']),
        '判定合格',
        '提出整改',
      ]
    case '需整改':
      return ['复测回填', '判定合格', '更新整改要求']
    default:
      return []
  }
}

// ---------------- 弹窗 ----------------

type DialogType = '' | 'register' | 'submit' | 'retest' | 'rectify'

const dialog = reactive<{ type: DialogType }>({ type: '' })
const activeRow = ref<SecondaryViewRow | null>(null)
const form = reactive({
  所属间隔: '',
  回路类别: '',
  端子排编号: '',
  检查人: '',
  检查日期: '',
  resistance: '',
  复测人: '',
  复测日期: '',
  整改要求: '',
  提出日期: '',
})

const dialogTitle = computed(() => {
  switch (dialog.type) {
    case 'register':
      return '登记回路检查记录'
    case 'submit':
      return '提交检查 · 录入绝缘电阻'
    case 'retest':
      return '复测绝缘电阻回填'
    case 'rectify':
      return activeRow.value?.status === '需整改' ? '更新整改要求' : '提出整改'
    default:
      return ''
  }
})

function resetForm() {
  Object.assign(form, {
    所属间隔: '',
    回路类别: '',
    端子排编号: '',
    检查人: '',
    检查日期: today(),
    resistance: '',
    复测人: '',
    复测日期: today(),
    整改要求: '',
    提出日期: today(),
  })
}

function openRegister() {
  activeRow.value = null
  resetForm()
  dialog.type = 'register'
}

function runAction(action: string, row: SecondaryViewRow) {
  activeRow.value = row
  resetForm()
  if (action === '提交检查') {
    dialog.type = 'submit'
  } else if (action === '复测回填') {
    form.resistance = row.复测绝缘电阻?.toString() ?? ''
    form.复测人 = String(row.复测人 ?? row.检查人 ?? '')
    dialog.type = 'retest'
  } else if (action === '提出整改' || action === '更新整改要求') {
    form.整改要求 = String(row.整改要求 ?? '')
    form.提出日期 = String(row.整改提出日期 ?? today())
    dialog.type = 'rectify'
  } else if (action === '判定合格') {
    handleResult(markQualified(Number(row.id)))
  }
}

function closeDialog() {
  dialog.type = ''
  activeRow.value = null
}

function confirmDialog() {
  if (!dialog.type) return
  let ok = false
  let text = ''
  if (dialog.type === 'register') {
    const result = registerEntry({
      所属间隔: form.所属间隔,
      回路类别: form.回路类别,
      端子排编号: form.端子排编号,
      检查人: form.检查人 || store.operator,
      检查日期: form.检查日期,
    })
    ;({ ok, message: text } = result)
  } else if (activeRow.value) {
    const id = Number(activeRow.value.id)
    if (dialog.type === 'submit') {
      ;({ ok, message: text } = submitCheck(id, form.resistance))
    } else if (dialog.type === 'retest') {
      ;({ ok, message: text } = retestFill(id, {
        复测绝缘电阻: form.resistance,
        复测人: form.复测人,
        复测日期: form.复测日期,
      }))
    } else if (dialog.type === 'rectify') {
      ;({ ok, message: text } = proposeRectification(id, {
        整改要求: form.整改要求,
        提出日期: form.提出日期,
      }))
    }
  }
  notify(ok, text)
  if (ok) {
    closeDialog()
    reload()
  }
}

function handleResult(result: { ok: boolean; message: string }) {
  notify(result.ok, result.message)
  if (result.ok) reload()
}

// ---------------- 导出 ----------------

function validRange(): BookletFilter | null {
  const { dateFrom, dateTo } = bookletRange
  if (dateFrom && dateTo && dateFrom > dateTo) {
    notify(false, '检查日期起不能晚于检查日期止')
    return null
  }
  return { dateFrom, dateTo }
}

function rangeSuffix(): string {
  const { dateFrom, dateTo } = bookletRange
  if (dateFrom || dateTo) return `${dateFrom || '早期'}_${dateTo || '至今'}`
  return '全部记录'
}

function downloadBooklets() {
  const range = validRange()
  if (!range) return
  try {
    const files = buildCircuitBooklets(range)
    downloadBlob(safeFilename(`二次回路检查分册打包_${rangeSuffix()}.zip`), buildZip(files))
    notify(true, `已按 ${files.length} 册打包（${files.length - 1} 个类别册 + 需整改册），开始下载`)
  } catch (error) {
    notify(false, error instanceof Error ? error.message : '成册打包失败')
  }
}

function downloadFlat() {
  const range = validRange()
  if (!range) return
  const file = exportFlatCsv(range)
  downloadText(safeFilename(file.filename), file.content)
  notify(true, '本期清单已导出，绝缘电阻与分册为同一份取值')
}

// ---------------- 数据加载 ----------------

function reload() {
  message.value = ''
  try {
    const payload = listEntries('secondarycircuit', filters.value)
    rows.value = payload.items.map((row) => toViewRow(row as SecondaryRow))
    total.value = payload.total
  } catch (error) {
    notify(false, error instanceof Error ? error.message : '二次回路检查列表读取失败')
  }
}

onMounted(reload)
</script>
