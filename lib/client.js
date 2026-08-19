window.__ModuleLoader__.load({id:"dsh-indexbookmark",factory:(require)=>{const module={exports:{}};const exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/client.tsx
  var import_react = __require("react");
  var import_jsx_runtime = __require("react/jsx-runtime");
  var FETCH_PAGE_SIZE = 200;
  var TAIL_TTL_MS = 60 * 1e3;
  var MAX_CACHED_SESSIONS = 5;
  var sessionCache = /* @__PURE__ */ new Map();
  function cacheGet(sessionId) {
    return sessionCache.get(sessionId) ?? null;
  }
  function cacheSet(sessionId, entry) {
    sessionCache.delete(sessionId);
    sessionCache.set(sessionId, entry);
    if (sessionCache.size > MAX_CACHED_SESSIONS) {
      const oldestKey = sessionCache.keys().next().value;
      sessionCache.delete(oldestKey);
    }
  }
  var name = "dsh-indexbookmark";
  var inject = ["slots", "locale", "connection"];
  var NS = "index";
  function contentToText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((b) => b && typeof b.text === "string" ? b.text : "").join("");
    }
    return "";
  }
  function extractQuestions(events) {
    const out = [];
    for (const item of events) {
      const e = item?.event ?? item;
      if (e.type !== "user/message") continue;
      if (e.surfaceOp !== "append") continue;
      const text = contentToText(e.data?.content).trim();
      if (text === "") continue;
      out.push({
        seq: e.seq,
        // 事件序号，作为 React key
        id: e.data?.id ?? e.seq,
        // 消息 ID
        text
      });
    }
    return out;
  }
  function IndexPanel({ useSessions, api, t }) {
    const sessionId = useSessions((s) => s.current);
    const [open, setOpen] = (0, import_react.useState)(false);
    const [closing, setClosing] = (0, import_react.useState)(false);
    const [data, setData] = (0, import_react.useState)(null);
    const [loadingOlder, setLoadingOlder] = (0, import_react.useState)(false);
    const [loading, setLoading] = (0, import_react.useState)(false);
    const [notice, setNotice] = (0, import_react.useState)(null);
    const [query, setQuery] = (0, import_react.useState)("");
    const [pageSize, setPageSize] = (0, import_react.useState)(30);
    const [page, setPage] = (0, import_react.useState)(1);
    const rootRef = (0, import_react.useRef)(null);
    const listRef = (0, import_react.useRef)(null);
    const closePanel = (0, import_react.useCallback)(() => {
      if (closing) return;
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        setOpen(false);
      }, 160);
    }, [closing]);
    (0, import_react.useEffect)(() => {
      if (!open || sessionId === void 0) return;
      let cancelled = false;
      setQuery("");
      setNotice(null);
      (async () => {
        const cached = cacheGet(sessionId);
        if (cached !== null && Date.now() - cached.loadedAt < TAIL_TTL_MS) {
          if (!cancelled) {
            setData({ questions: cached.questions, oldestLoadedSeq: cached.oldestLoadedSeq, hasMore: cached.hasMore });
          }
          return;
        }
        try {
          setLoading(true);
          const res = await api.sessions.history({ sessionId, maxMessages: FETCH_PAGE_SIZE });
          if (cancelled || !res.result?.ok || res.result.value === void 0) return;
          const value = res.result.value;
          const tailEvents = value.events ?? [];
          const tailQuestions = extractQuestions(tailEvents);
          const tailOldestSeq = tailEvents.reduce(
            (min, item) => Math.min(min, (item.event ?? item).seq),
            Infinity
          );
          let questions, oldestLoadedSeq, hasMore;
          if (cached !== null) {
            const older = cached.questions.filter((q) => q.seq < tailOldestSeq);
            questions = [...older, ...tailQuestions];
            oldestLoadedSeq = Math.min(cached.oldestLoadedSeq, tailOldestSeq);
            hasMore = cached.oldestLoadedSeq < tailOldestSeq ? cached.hasMore : value.hasMore === true;
          } else {
            questions = tailQuestions;
            oldestLoadedSeq = tailOldestSeq;
            hasMore = value.hasMore === true;
          }
          cacheSet(sessionId, { questions, oldestLoadedSeq, hasMore, loadedAt: Date.now() });
          if (!cancelled) setData({ questions, oldestLoadedSeq, hasMore });
        } catch {
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [open, sessionId, api]);
    const loadOlder = (0, import_react.useCallback)(async () => {
      if (loadingOlder || data === null || !data.hasMore || sessionId === void 0) return;
      setLoadingOlder(true);
      try {
        const res = await api.sessions.history({ sessionId, beforeSeq: data.oldestLoadedSeq, maxMessages: FETCH_PAGE_SIZE });
        if (res.result?.ok && res.result.value !== void 0) {
          const value = res.result.value;
          const pageEvents = value.events ?? [];
          const pageQuestions2 = extractQuestions(pageEvents);
          const pageOldestSeq = pageEvents.reduce(
            (min, item) => Math.min(min, (item.event ?? item).seq),
            Infinity
          );
          const pageOldestSeqSafe = pageOldestSeq === Infinity ? data.oldestLoadedSeq : pageOldestSeq;
          const next = {
            questions: [...pageQuestions2, ...data.questions],
            oldestLoadedSeq: Math.min(data.oldestLoadedSeq, pageOldestSeqSafe),
            hasMore: value.hasMore === true
          };
          setData(next);
          const cached = cacheGet(sessionId);
          cacheSet(sessionId, {
            questions: next.questions,
            oldestLoadedSeq: next.oldestLoadedSeq,
            hasMore: next.hasMore,
            loadedAt: cached?.loadedAt ?? Date.now()
            // 旧页加载不改变尾页新鲜度
          });
        }
      } catch {
      } finally {
        setLoadingOlder(false);
      }
    }, [loadingOlder, data, sessionId, api]);
    (0, import_react.useEffect)(() => {
      if (!open) return;
      const root = rootRef.current;
      const list = listRef.current;
      if (root === null || list === null) return;
      const onWheel = (e) => {
        if (list.contains(e.target)) return;
        e.preventDefault();
        list.scrollTop += e.deltaY;
      };
      root.addEventListener("wheel", onWheel, { passive: false });
      return () => root.removeEventListener("wheel", onWheel);
    }, [open]);
    (0, import_react.useEffect)(() => {
      if (!open) return;
      const onPointerDown = (e) => {
        if (rootRef.current !== null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
          closePanel();
        }
      };
      const onKeyDown = (e) => {
        if (e.key === "Escape") closePanel();
      };
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open, closePanel]);
    const jumpTo = (0, import_react.useCallback)((q) => {
      const scrollport = document.querySelector("[data-conversation-scroll]");
      const findRow = () => {
        const rows = document.querySelectorAll("[data-chat-anchor-key]");
        const needle = q.text.slice(0, 40);
        for (const row of rows) {
          const txt = (row.textContent ?? "").trimStart();
          if (txt.startsWith(needle) || txt.includes(needle)) return row;
        }
        return null;
      };
      const revealRow = (row) => {
        if (scrollport !== null) {
          const top = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop - 12;
          scrollport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          row.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        row.classList.add("dsh-index-flash");
        setTimeout(() => row.classList.remove("dsh-index-flash"), 1600);
        closePanel();
      };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let target = findRow();
      if (target !== null) {
        revealRow(target);
        return;
      }
      ;
      (async () => {
        if (scrollport === null) {
          setNotice(t("index.jumpFailed"));
          return;
        }
        for (let i = 0; i < 40; i++) {
          scrollport.scrollTop = Math.max(0, scrollport.scrollTop - 2e3);
          await sleep(120);
          const found = findRow();
          if (found !== null) {
            revealRow(found);
            return;
          }
          if (scrollport.scrollTop <= 0) break;
        }
        setNotice(t("index.jumpFailed"));
        setTimeout(() => setNotice(null), 2500);
      })();
    }, [closePanel, t]);
    const allQuestions = (0, import_react.useMemo)(() => data?.questions ?? [], [data]);
    const visibleQuestions = (0, import_react.useMemo)(() => {
      const q = query.trim().toLowerCase();
      if (q === "") return allQuestions;
      return allQuestions.filter((x) => x.text.toLowerCase().includes(q));
    }, [allQuestions, query]);
    const totalPages = Math.max(1, Math.ceil(visibleQuestions.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageQuestions = (0, import_react.useMemo)(
      () => visibleQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      [visibleQuestions, currentPage, pageSize]
    );
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-index", ref: rootRef, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-index-trigger",
          onClick: () => open ? closePanel() : setOpen(true),
          title: t("index.title"),
          children: open && !closing ? "\u2715" : "\u2630"
        }
      ),
      open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: closing ? "dsh-index-panel dsh-index-panel-closing" : "dsh-index-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-index-head", children: [
          t("index.title"),
          " \xB7 ",
          visibleQuestions.length,
          "/",
          allQuestions.length
        ] }),
        notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-index-notice", children: notice }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "text",
            className: "dsh-index-search",
            value: query,
            onChange: (e) => {
              setQuery(e.target.value);
              setPage(1);
            },
            placeholder: t("index.search")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-index-list", ref: listRef, children: data === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-index-empty", children: loading ? t("index.loading") : t("index.empty") }) : allQuestions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-index-empty", children: t("index.empty") }) : visibleQuestions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-index-empty", children: t("index.noMatch") }) : pageQuestions.map((q, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-index-item",
            onClick: () => jumpTo(q),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-index-num", children: (currentPage - 1) * pageSize + i + 1 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-index-text", children: q.text })
            ]
          },
          q.seq
        )) }),
        visibleQuestions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-index-pager", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-index-pager-btn",
              disabled: currentPage <= 1,
              onClick: () => setPage(currentPage - 1),
              title: t("index.prev"),
              children: "\u2039"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-index-pager-info", children: [
            currentPage,
            "/",
            totalPages
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-index-pager-btn",
              disabled: currentPage >= totalPages,
              onClick: () => setPage(currentPage + 1),
              title: t("index.next"),
              children: "\u203A"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-index-pager-size", children: [10, 30, 50].map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: pageSize === n ? "dsh-index-pager-size-btn active" : "dsh-index-pager-size-btn",
              onClick: () => {
                setPageSize(n);
                setPage(1);
              },
              children: n
            },
            n
          )) })
        ] }) : null,
        data !== null && data.hasMore ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-index-more",
            onClick: loadOlder,
            disabled: loadingOlder,
            children: loadingOlder ? t("index.loading") : t("index.loadOlder")
          }
        ) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { "data-plugin": "dsh-indexbookmark", children: CSS })
    ] });
  }
  function apply(ctx) {
    ctx.effect(
      () => ctx.locale.register(NS, {
        zh: {
          "index.title": "\u95EE\u9898\u7D22\u5F15",
          "index.empty": "\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u63D0\u95EE\u8BB0\u5F55",
          "index.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u95EE\u9898",
          "index.search": "\u641C\u7D22\u95EE\u9898\u2026",
          "index.loadOlder": "\u52A0\u8F7D\u66F4\u65E9\u7684\u95EE\u9898",
          "index.loading": "\u52A0\u8F7D\u4E2D\u2026",
          "index.prev": "\u4E0A\u4E00\u9875",
          "index.next": "\u4E0B\u4E00\u9875",
          "index.jumpFailed": "\u672A\u627E\u5230\u8BE5\u6D88\u606F\uFF08\u53EF\u80FD\u9700\u8981\u5148\u6EDA\u52A8\u52A0\u8F7D\u66F4\u65E9\u7684\u5386\u53F2\uFF09"
        },
        en: {
          "index.title": "Questions",
          "index.empty": "No questions in this session yet",
          "index.noMatch": "No matching questions",
          "index.search": "Search questions\u2026",
          "index.loadOlder": "Load older questions",
          "index.loading": "Loading\u2026",
          "index.prev": "Previous page",
          "index.next": "Next page",
          "index.jumpFailed": "Message not found (may need to load older history first)"
        }
      }),
      "dsh-indexbookmark: dictionaries"
    );
    ctx.slots.inject(
      "conversation.input.right",
      () => ctx.slots.register(
        {
          name: "conversation.input.right",
          id: "dsh-indexbookmark",
          order: 10,
          locale: NS,
          inject: () => ({ api: ctx.connection.api, locale: ctx.locale })
        },
        IndexPanel
      )
    );
  }
  var CSS = `
/* \u5916\u5C42\u5BB9\u5668\u5FC5\u987B\u968F\u6309\u94AE\u6536\u7F29\uFF08inline-flex\uFF09\uFF0C\u5426\u5219\u5728\u8F93\u5165\u6846\u7684 flex \u884C\u91CC
   width:100% \u4F1A\u628A\u5176\u4ED6\u7EC4\u4EF6\u6324\u8D70 */
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

/* \u5C55\u5F00\u52A8\u753B\uFF1A\u6DE1\u5165 + \u8F7B\u5FAE\u4E0A\u6ED1 */
.dsh-index-panel {
  animation: dsh-index-pop 0.16s ease;
}
@keyframes dsh-index-pop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* \u6536\u8D77\u52A8\u753B\uFF1A\u6DE1\u51FA + \u8F7B\u5FAE\u4E0B\u6ED1\uFF08closing \u671F\u95F4\u64AD\u653E\uFF0C\u7ED3\u675F\u540E\u5378\u8F7D\uFF09 */
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
  overscroll-behavior: contain; /* \u5217\u8868\u6EDA\u5230\u8FB9\u754C\u65F6\u4E0D\u8BA9\u5916\u5C42\u9875\u9762\u8DDF\u7740\u6EDA\uFF08\u9632\u94FE\u6761\u6EDA\u52A8\uFF09 */
}

/* \u641C\u7D22\u6846 */
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

/* \u77ED\u6682\u63D0\u793A\uFF08\u5982\u8DF3\u8F6C\u5931\u8D25\uFF09 */
.dsh-index-notice {
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 193, 7, 0.12);
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
}

/* \u52A0\u8F7D\u66F4\u65E9 */
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

/* \u89C6\u56FE\u5206\u9875\u6761\uFF1A\u7FFB\u9875 + \u6BCF\u9875\u6761\u6570 */
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

/* \u70B9\u51FB\u5B9A\u4F4D\u540E\u7684\u9AD8\u4EAE\u95EA\u70C1 */
.dsh-index-flash {
  animation: dsh-index-flash 1.6s ease;
}
@keyframes dsh-index-flash {
  0%, 60% { background: rgba(77, 107, 254, 0.18); }
  100% { background: transparent; }
}
`;
  module.exports = { name, inject, apply };
})();
return module.exports;}});
