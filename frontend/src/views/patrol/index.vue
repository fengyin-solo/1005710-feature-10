<template>
  <section class="page" data-module="patrol">
    <header class="page-head">
      <div>
        <h2>设备巡视管理</h2>
        <p class="page-desc">维护巡视记录，围绕巡视编号、巡视变电站、巡视路线、巡视人做登记、筛选与状态流转；二次回路检查提出整改的回路在此形成待复查清单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记巡视记录</button>
        <button class="btn" type="button" @click="exportRows">导出设备巡视清单</button>
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
    </p>

    <section class="linked-panel">
      <header class="linked-head">
        <h3>二次回路整改 · 待复查清单</h3>
        <span class="export-hint">来自二次回路检查「提出整改」的结论；绝缘电阻与检查记录同一份，复测后以复测值为准。</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>检查编号</th>
            <th>所属间隔</th>
            <th>回路类别</th>
            <th>端子排编号</th>
            <th>绝缘电阻</th>
            <th>整改要求</th>
            <th>提出日期</th>
            <th>回路当前状态</th>
            <th>复查状态</th>
            <th>复查人/日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in recheckRows" :key="String(item.id)">
            <td>{{ item.检查编号 }}</td>
            <td>{{ item.所属间隔 }}</td>
            <td>{{ item.回路类别 }}</td>
            <td>{{ item.端子排编号 }}</td>
            <td>
              {{ item.有效绝缘电阻 || '未测量' }}
              <em v-if="item.已复测" class="tag tag-retest">复测</em>
            </td>
            <td>{{ item.整改要求 || '—' }}</td>
            <td>{{ item.提出日期 }}</td>
            <td>{{ item.当前回路状态 }}</td>
            <td>
              <em :class="item.复查状态 === '待复查' ? 'tag tag-warn' : 'tag tag-done'">{{ item.复查状态 }}</em>
            </td>
            <td>{{ item.复查人 ? `${item.复查人} / ${item.复查日期}` : '—' }}</td>
            <td>
              <button
                v-if="item.复查状态 === '待复查'"
                class="link"
                type="button"
                @click="openRecheck(item)"
              >
                完成复查
              </button>
              <span v-else class="muted-text">—</span>
            </td>
          </tr>
          <tr v-if="!recheckRows.length">
            <td colspan="11" class="empty-state">暂无二次回路整改待复查记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

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
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无设备巡视数据，可先登记巡视记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条设备巡视记录；待复查 {{ recheckPending }} 项，已复查 {{ recheckDone }} 项</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="reviewTarget" class="modal-mask" @click.self="closeRecheck">
      <div class="modal-card">
        <header class="modal-head">
          <h3>完成二次回路复查 · {{ reviewTarget.检查编号 }}</h3>
          <button class="link" type="button" @click="closeRecheck">关闭</button>
        </header>
        <div class="modal-body">
          <p class="modal-tip">
            {{ reviewTarget.所属间隔 }} · {{ reviewTarget.回路类别 }} · 端子排 {{ reviewTarget.端子排编号 }}
            ；当前有效绝缘电阻 {{ reviewTarget.有效绝缘电阻 || '未测量' }}
          </p>
          <p class="modal-tip">整改要求：{{ reviewTarget.整改要求 }}</p>
          <div class="form-grid">
            <label class="form-field">
              <span>复查人</span>
              <input v-model="reviewForm.reviewer" :placeholder="`当前值班：${store.operator}`" />
            </label>
            <label class="form-field">
              <span>复查备注</span>
              <input v-model="reviewForm.note" placeholder="如 现场复查绝缘合格，端子排已处理" />
            </label>
          </div>
        </div>
        <footer class="modal-foot">
          <button class="btn ghost" type="button" @click="closeRecheck">取消</button>
          <button class="btn primary" type="button" @click="confirmRecheck">确认复查完成</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'
import {
  completeRecheck,
  listRechecks,
} from '@/services/secondary-circuit-service'
import type { RecheckViewRow } from '@/services/secondary-circuit-service'

const store = useSessionStore()
const meta = moduleMeta('patrol')
const columns = ['巡视编号', '巡视变电站', '巡视路线', '巡视人', '巡视日期', '发现缺陷数', '处理情况', '巡视状态']
const actions = ['提交巡视', '确认完成', '上报问题']
const statuses = ['待巡视', '巡视中', '已完成', '已上报']
const stats = computed(() => [
  { label: '待巡视站点', value: rows.value.filter((row) => String(row.status) === '待巡视').length },
  { label: '已完成巡视', value: rows.value.filter((row) => String(row.status) === '已完成').length },
  { label: '回路待复查', value: recheckPending.value },
])

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const recheckRows = ref<RecheckViewRow[]>([])
const recheckPending = computed(() => recheckRows.value.filter((item) => item.复查状态 === '待复查').length)
const recheckDone = computed(() => recheckRows.value.filter((item) => item.复查状态 === '已复查').length)
const reviewTarget = ref<RecheckViewRow | null>(null)
const reviewForm = reactive({ reviewer: '', note: '' })

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function openRecheck(item: RecheckViewRow) {
  reviewTarget.value = item
  reviewForm.reviewer = store.operator
  reviewForm.note = ''
}

function closeRecheck() {
  reviewTarget.value = null
}

function confirmRecheck() {
  if (!reviewTarget.value) return
  const result = completeRecheck(Number(reviewTarget.value.id), reviewForm.reviewer, reviewForm.note)
  errorMessage.value = result.ok ? '' : result.message
  if (result.ok) {
    closeRecheck()
    reload()
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '巡视记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    recheckRows.value = listRechecks()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '设备巡视列表读取失败'
  }
}

onMounted(reload)
</script>
