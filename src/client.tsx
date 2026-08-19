// ============================================================
// dsh-indexbookmark — 浏览器端插件源码
//
// 功能：侧边栏底部放一个触发器按钮，点开浮层列出当前会话里
// 你提过的所有问题（user/message），点击某条 → 对话滚动定位
// 到那条消息并短暂高亮。
//
// 构建：npm run build  →  lib/client.js（加载器格式）
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// 每页拉取的消息数（maxMessages 按 user/assistant 消息计数；页边界对齐消息）
// 调小以加快首次打开；更早的历史由"加载更早"按需拉取
const FETCH_PAGE_SIZE = 200

// ── 会话级内存缓存（浏览器生命周期内有效） ──────────────────
// 日志只追加、旧事件不可变：旧页可长期缓存；仅尾页随新消息变化，用 TTL 控制刷新。
// 缓存只存提取后的问题（小），不存原始事件（省内存）；最多缓存 MAX_CACHED_SESSIONS 个会话（LRU）。
const TAIL_TTL_MS = 60 * 1000
const MAX_CACHED_SESSIONS = 5
const sessionCache = new Map() // sessionId -> { questions, oldestLoadedSeq, hasMore, loadedAt }

function cacheGet(sessionId) {
  return sessionCache.get(sessionId) ?? null
}
function cacheSet(sessionId, entry) {
  sessionCache.delete(sessionId) // 触碰顺序实现 LRU
  sessionCache.set(sessionId, entry)
  if (sessionCache.size > MAX_CACHED_SESSIONS) {
    const oldestKey = sessionCache.keys().next().value
    sessionCache.delete(oldestKey)
  }
}

// ── 插件契约（Cordis 风格，加载器要求这三个导出） ──────────
export const name = 'dsh-indexbookmark'
// 本插件需要的运行时服务：槽位系统 / 翻译 / 连接(api)
export const inject = ['slots', 'locale', 'connection']
const NS = 'index' // 翻译字典的命名空间

// ── 从 history 事件流里提取用户问题 ────────────────────────
// api.sessions.history() 返回 { result: { ok, value: { events } } }
// ★ events 数组元素是 { event: {...} } 包装（易踩坑！）
// ★ user/message 事件：data.content 是内容块数组 [{type:'text',text}]
// ★ 消息 ID 在 data.id（不是 data.message.id）
// ★ 只收 surfaceOp === 'append'（追加来源）：与平台 isAppendSurfaceEvent 一致——
//   只有这种事件才真正渲染成对话行（可跳转）；替换副本/非追加记录会混进日志但不可跳
function contentToText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('')
  }
  return ''
}

function extractQuestions(events) {
  const out = []
  for (const item of events) {
    const e = item?.event ?? item // 解包：兼容 {event} 包装
    if (e.type !== 'user/message') continue
    if (e.surfaceOp !== 'append') continue // 只收追加来源（对话里真实存在的行）
    const text = contentToText(e.data?.content).trim()
    if (text === '') continue
    out.push({
      seq: e.seq,           // 事件序号，作为 React key
      id: e.data?.id ?? e.seq, // 消息 ID
      text,
    })
  }
  return out
}

// ── 索引面板组件 ────────────────────────────────────────────
// props 由 slots 渲染器注入：
//   useSessions — hook，useSessions(s => s.current) 拿当前会话 id
//   api         — 我们在 register 的 inject 里提供的连接 API
//   t           — 翻译函数（读 NS 命名空间的字典）
//   （owner 注入 InputZone { session, input }，v1 未使用）
function IndexPanel({ useSessions, api, t }) {
  const sessionId = useSessions((s) => s.current)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false) // 播放收起动画期间为 true
  // data: 当前会话已加载的数据（提取后的问题 + 分页前沿）；打开时优先用缓存
  const [data, setData] = useState(null)         // { questions, oldestLoadedSeq, hasMore }
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loading, setLoading] = useState(false)  // 首次加载（缓存未命中时）
  const [notice, setNotice] = useState(null)     // 面板内短暂提示（如跳转失败）
  const [query, setQuery] = useState('')         // 搜索关键词
  const [pageSize, setPageSize] = useState(30)   // 每页显示条数（10/30/50）
  const [page, setPage] = useState(1)            // 当前页码（1 起）
  const rootRef = useRef(null)
  const listRef = useRef(null) // 问题列表滚动容器（滚轮独占）

  // 收起：先播动画（160ms），动画结束后再真正卸载面板
  const closePanel = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setOpen(false)
    }, 160)
  }, [closing])

  // 打开面板：优先用缓存（TTL 内秒开）；过期则重拉尾页并与缓存按 seq 合并
  useEffect(() => {
    if (!open || sessionId === undefined) return
    let cancelled = false
    setQuery('')
    setNotice(null)
    ;(async () => {
      const cached = cacheGet(sessionId)
      if (cached !== null && Date.now() - cached.loadedAt < TAIL_TTL_MS) {
        if (!cancelled) {
          setData({ questions: cached.questions, oldestLoadedSeq: cached.oldestLoadedSeq, hasMore: cached.hasMore })
        }
        return
      }
      try {
        setLoading(true)
        const res = await api.sessions.history({ sessionId, maxMessages: FETCH_PAGE_SIZE })
        if (cancelled || !res.result?.ok || res.result.value === undefined) return
        const value = res.result.value
        const tailEvents = value.events ?? []
        const tailQuestions = extractQuestions(tailEvents)
        // ⚠️ 求最小值必须用 reduce：spread 展开大数组会 RangeError（本会话 11 万+ 事件踩过）
        const tailOldestSeq = tailEvents.reduce(
          (min, item) => Math.min(min, (item.event ?? item).seq),
          Infinity,
        )
        let questions, oldestLoadedSeq, hasMore
        if (cached !== null) {
          // 合并：缓存里比新尾页窗口更旧的问题保留（已加载的更早页），尾页问题整体替换旧尾页
          const older = cached.questions.filter((q) => q.seq < tailOldestSeq)
          questions = [...older, ...tailQuestions]
          oldestLoadedSeq = Math.min(cached.oldestLoadedSeq, tailOldestSeq)
          hasMore = cached.oldestLoadedSeq < tailOldestSeq ? cached.hasMore : value.hasMore === true
        } else {
          questions = tailQuestions
          oldestLoadedSeq = tailOldestSeq
          hasMore = value.hasMore === true
        }
        cacheSet(sessionId, { questions, oldestLoadedSeq, hasMore, loadedAt: Date.now() })
        if (!cancelled) setData({ questions, oldestLoadedSeq, hasMore })
      } catch {
        // 拉取失败就保持空列表
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, sessionId, api])

  // 加载更早的一页：beforeSeq = 当前最旧已加载事件 seq；旧页 prepend 到前面保持升序，并同步缓存
  const loadOlder = useCallback(async () => {
    if (loadingOlder || data === null || !data.hasMore || sessionId === undefined) return
    setLoadingOlder(true)
    try {
      const res = await api.sessions.history({ sessionId, beforeSeq: data.oldestLoadedSeq, maxMessages: FETCH_PAGE_SIZE })
      if (res.result?.ok && res.result.value !== undefined) {
        const value = res.result.value
        const pageEvents = value.events ?? []
        const pageQuestions = extractQuestions(pageEvents)
        // 同 tailOldestSeq：用 reduce 求最小值，避免大数组 spread 爆栈
        const pageOldestSeq = pageEvents.reduce(
          (min, item) => Math.min(min, (item.event ?? item).seq),
          Infinity,
        )
        const pageOldestSeqSafe = pageOldestSeq === Infinity ? data.oldestLoadedSeq : pageOldestSeq
        const next = {
          questions: [...pageQuestions, ...data.questions],
          oldestLoadedSeq: Math.min(data.oldestLoadedSeq, pageOldestSeqSafe),
          hasMore: value.hasMore === true,
        }
        setData(next)
        const cached = cacheGet(sessionId)
        cacheSet(sessionId, {
          questions: next.questions,
          oldestLoadedSeq: next.oldestLoadedSeq,
          hasMore: next.hasMore,
          loadedAt: cached?.loadedAt ?? Date.now(), // 旧页加载不改变尾页新鲜度
        })
      }
    } catch {
      // 保持现状
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, data, sessionId, api])

  // 滚轮独占：面板内滚轮只滚动问题列表，不外泄给页面；
  // 列表边界由 overscroll-behavior: contain 防止链条滚动
  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    const list = listRef.current
    if (root === null || list === null) return
    const onWheel = (e) => {
      if (list.contains(e.target)) return // 列表内：自然滚动（边界由 CSS contain 拦截）
      e.preventDefault()
      list.scrollTop += e.deltaY // 标题/搜索/分页区域：滚轮驱动列表滚动
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [open])

  // 点击面板外部 / 按 Esc → 收起（dsh-board 同款外部点击行为）
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (rootRef.current !== null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        closePanel()
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closePanel])

  // 滚动定位：优先手动操作对话滚动容器（[data-conversation-scroll]）——
  // 对话视图是虚拟化 + 手动滚动锚定的列表，scrollIntoView 对内部容器可能无效。
  // 行未渲染（虚拟化/更早历史未加载）时，分段向上滚动触发渲染再匹配（有界，失败给提示）。
  const jumpTo = useCallback((q) => {
    const scrollport = document.querySelector('[data-conversation-scroll]')
    const findRow = () => {
      const rows = document.querySelectorAll('[data-chat-anchor-key]')
      const needle = q.text.slice(0, 40) // 前 40 字符通常足够唯一
      for (const row of rows) {
        const txt = (row.textContent ?? '').trimStart()
        if (txt.startsWith(needle) || txt.includes(needle)) return row
      }
      return null
    }
    const revealRow = (row) => {
      if (scrollport !== null) {
        const top = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop - 12
        scrollport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      } else {
        row.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      row.classList.add('dsh-index-flash')
      setTimeout(() => row.classList.remove('dsh-index-flash'), 1600)
      closePanel()
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let target = findRow()
    if (target !== null) { revealRow(target); return }
    // 行未渲染：向上分段滚动（每次 2000px）触发虚拟化渲染，有界尝试
    ;(async () => {
      if (scrollport === null) {
        setNotice(t('index.jumpFailed'))
        return
      }
      for (let i = 0; i < 40; i++) {
        scrollport.scrollTop = Math.max(0, scrollport.scrollTop - 2000)
        await sleep(120)
        const found = findRow()
        if (found !== null) { revealRow(found); return }
        if (scrollport.scrollTop <= 0) break
      }
      setNotice(t('index.jumpFailed'))
      setTimeout(() => setNotice(null), 2500)
    })()
  }, [closePanel, t])

  // 派生：全部问题（已提取，缓存命中时零处理）+ 按关键词过滤
  const allQuestions = useMemo(() => data?.questions ?? [], [data])
  const visibleQuestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return allQuestions
    return allQuestions.filter((x) => x.text.toLowerCase().includes(q))
  }, [allQuestions, query])

  // 视图分页：按 pageSize 切页；页码钳制在有效范围（加载更早/搜索变化时自动收拢）
  const totalPages = Math.max(1, Math.ceil(visibleQuestions.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageQuestions = useMemo(
    () => visibleQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [visibleQuestions, currentPage, pageSize],
  )

  return (
    <div className="dsh-index" ref={rootRef}>
      <button
        type="button"
        className="dsh-index-trigger"
        onClick={() => (open ? closePanel() : setOpen(true))}
        title={t('index.title')}
      >
        {open && !closing ? '✕' : '☰'}
      </button>

      {open ? (
        <div className={closing ? 'dsh-index-panel dsh-index-panel-closing' : 'dsh-index-panel'}>
          <div className="dsh-index-head">
            {t('index.title')} · {visibleQuestions.length}/{allQuestions.length}
          </div>

          {notice ? <div className="dsh-index-notice">{notice}</div> : null}

          <input
            type="text"
            className="dsh-index-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder={t('index.search')}
          />

          <div className="dsh-index-list" ref={listRef}>
            {data === null ? (
              <div className="dsh-index-empty">{loading ? t('index.loading') : t('index.empty')}</div>
            ) : allQuestions.length === 0 ? (
              <div className="dsh-index-empty">{t('index.empty')}</div>
            ) : visibleQuestions.length === 0 ? (
              <div className="dsh-index-empty">{t('index.noMatch')}</div>
            ) : (
              pageQuestions.map((q, i) => (
                <button
                  key={q.seq}
                  type="button"
                  className="dsh-index-item"
                  onClick={() => jumpTo(q)}
                >
                  <span className="dsh-index-num">{(currentPage - 1) * pageSize + i + 1}</span>
                  <span className="dsh-index-text">{q.text}</span>
                </button>
              ))
            )}
          </div>

          {visibleQuestions.length > 0 ? (
            <div className="dsh-index-pager">
              <button
                type="button"
                className="dsh-index-pager-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                title={t('index.prev')}
              >
                ‹
              </button>
              <span className="dsh-index-pager-info">
                {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                className="dsh-index-pager-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                title={t('index.next')}
              >
                ›
              </button>
              <span className="dsh-index-pager-size">
                {[10, 30, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={pageSize === n ? 'dsh-index-pager-size-btn active' : 'dsh-index-pager-size-btn'}
                    onClick={() => { setPageSize(n); setPage(1) }}
                  >
                    {n}
                  </button>
                ))}
              </span>
            </div>
          ) : null}

          {data !== null && data.hasMore ? (
            <button
              type="button"
              className="dsh-index-more"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? t('index.loading') : t('index.loadOlder')}
            </button>
          ) : null}
        </div>
      ) : null}

      <style data-plugin="dsh-indexbookmark">{CSS}</style>
    </div>
  )
}

// ── apply：插件激活入口 ─────────────────────────────────────
function apply(ctx) {
  // 1) 注册翻译字典（zh / en）
  ctx.effect(
    () =>
      ctx.locale.register(NS, {
        zh: {
          'index.title': '问题索引',
          'index.empty': '这个会话还没有提问记录',
          'index.noMatch': '没有匹配的问题',
          'index.search': '搜索问题…',
          'index.loadOlder': '加载更早的问题',
          'index.loading': '加载中…',
          'index.prev': '上一页',
          'index.next': '下一页',
          'index.jumpFailed': '未找到该消息（可能需要先滚动加载更早的历史）',
        },
        en: {
          'index.title': 'Questions',
          'index.empty': 'No questions in this session yet',
          'index.noMatch': 'No matching questions',
          'index.search': 'Search questions…',
          'index.loadOlder': 'Load older questions',
          'index.loading': 'Loading…',
          'index.prev': 'Previous page',
          'index.next': 'Next page',
          'index.jumpFailed': 'Message not found (may need to load older history first)',
        },
      }),
    'dsh-indexbookmark: dictionaries',
  )

  // 2) 注册输入框右侧工具按钮（小图标，避免与 dsh-board 等插件挤占侧边栏底部）
  //    槽位契约：conversation.input.right（list, scope: session, owner: InputZone）
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.right',
        id: 'dsh-indexbookmark',
        order: 10,
        locale: NS,
        inject: () => ({ api: ctx.connection.api, locale: ctx.locale }),
      },
      IndexPanel,
    ),
  )
}

// ── 样式（加载器约定：以 <style data-plugin> 注入） ─────────
const CSS = `
/* 外层容器必须随按钮收缩（inline-flex），否则在输入框的 flex 行里
   width:100% 会把其他组件挤走 */
.dsh-index { position: relative; display: inline-flex; }

.dsh-index-trigger {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.dsh-index-trigger:hover {
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
}

.dsh-index-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 60;
  box-sizing: border-box;
  width: 260px;
  max-height: min(60vh, 480px);
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 12px;
}

.dsh-index-head {
  padding: 2px 4px 8px;
  font-weight: 600;
}

/* 展开动画：淡入 + 轻微上滑 */
.dsh-index-panel {
  animation: dsh-index-pop 0.16s ease;
}
@keyframes dsh-index-pop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* 收起动画：淡出 + 轻微下滑（closing 期间播放，结束后卸载） */
.dsh-index-panel-closing {
  animation: dsh-index-fade 0.16s ease forwards;
}
@keyframes dsh-index-fade {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(6px); }
}

.dsh-index-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overscroll-behavior: contain; /* 列表滚到边界时不让外层页面跟着滚（防链条滚动） */
}

/* 搜索框 */
.dsh-index-search {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 6px;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font-size: 12px;
}
.dsh-index-search:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
}

/* 短暂提示（如跳转失败） */
.dsh-index-notice {
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 193, 7, 0.12);
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}

/* 加载更早 */
.dsh-index-more {
  margin-top: 6px;
  padding: 6px;
  border: 0;
  border-radius: 6px;
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 12px;
  cursor: pointer;
}
.dsh-index-more:hover:not(:disabled) {
  background: var(--dsw-alias-bg-hover, rgba(0, 0, 0, 0.1));
}
.dsh-index-more:disabled {
  opacity: 0.6;
  cursor: default;
}

/* 视图分页条：翻页 + 每页条数 */
.dsh-index-pager {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.dsh-index-pager-btn {
  min-width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.dsh-index-pager-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-hover, rgba(0, 0, 0, 0.1));
}
.dsh-index-pager-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.dsh-index-pager-info {
  min-width: 34px;
  text-align: center;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-index-pager-size {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.dsh-index-pager-size-btn {
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  cursor: pointer;
}
.dsh-index-pager-size-btn:hover {
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
}
.dsh-index-pager-size-btn.active {
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
  color: #ffffff;
}

.dsh-index-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dsh-index-item:hover {
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
}

.dsh-index-num {
  flex: none;
  min-width: 18px;
  text-align: center;
  border-radius: 999px;
  background: var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
  line-height: 18px;
}

.dsh-index-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.dsh-index-empty {
  padding: 12px 4px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

/* 点击定位后的高亮闪烁 */
.dsh-index-flash {
  animation: dsh-index-flash 1.6s ease;
}
@keyframes dsh-index-flash {
  0%, 60% { background: rgba(77, 107, 254, 0.18); }
  100% { background: transparent; }
}
`

// ── 模块导出（banner 里已定义 module/exports，加载器要求） ─
module.exports = { name, inject, apply }
