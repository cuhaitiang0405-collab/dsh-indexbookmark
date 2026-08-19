# dsh-indexbookmark

DSH（DeepSeek Harness）Web 界面插件：**对话问题索引**。在输入框右侧加一个 ☰ 按钮，点开就能看到当前会话里你提过的所有问题，点击任意一条，对话直接滚动定位到那条消息并高亮。

> 解决长对话的痛点：几十上百轮之后，翻找"我之前问过什么、那条讨论在哪"很痛苦。dsh-indexbookmark 把这个问题变成一次点击。

## 功能特性

- 📋 **问题索引**：列出当前会话所有 `user/message`，按时间顺序带全局序号
- 🎯 **点击定位**：滚动到对应消息 + 1.6s 高亮闪烁
- 🔍 **搜索过滤**：大小写不敏感子串匹配，标题实时显示 `命中数/总数`
- 📄 **视图分页**：每页 10 / 30 / 50 条可调，`‹ 1/3 ›` 翻页，全局编号
- ⏳ **懒加载 + 分页**：打开面板才拉取，每次最多 200 条消息，更早的按需"加载更早的问题"
- ⚡ **会话级内存缓存**：同一会话 60 秒内重复打开秒开（零请求零处理），LRU 上限 5 个会话
- 🪄 **顺滑交互**：展开/收起淡入淡出动画；点击外部 / 按 Esc 收起；面板内滚轮独占不外泄
- 🌗 **主题适配**：全部使用 DSH 主题变量（`--dsw-alias-*`），亮暗色自动适配
- 🌐 **中英文案**：zh / en 字典随界面语言切换

## 安装

### 方式一：从 GitHub 安装（推荐）

```powershell
# 前提：全局 dsh 与 pnpm（`dsh plugin` 依赖 pnpm）
dsh plugin --profile web add github:<你的用户名>/dsh-indexbookmark
```

`dsh plugin` 会：
1. 通过 pnpm 拉取仓库（打包产物 `lib/client.js` 已随仓库发布，**无需构建**）；
2. 检测到包声明了 `dsh.bundle`，**自动**加入 `dsh.profile.bundles`；
3. 无需手动改 `cordis.patch.yml`。

安装完成后**重启网页版**生效：

```powershell
# 停掉当前 dsh web，然后
dsh web
```

### 方式二：本地开发安装（软链，改码即生效）

```powershell
cd dsh-indexbookmark   # 插件源码目录的父目录
dsh plugin --profile web add ./dsh-indexbookmark
```

软链方式下，修改 `src/client.tsx` → `node build.mjs` → 浏览器硬刷新（Ctrl+Shift+R）即可，无需重新安装。

### 卸载

```powershell
dsh plugin --profile web remove dsh-indexbookmark
```

## 使用

1. 打开任意有历史的会话；
2. 点击输入框右侧的 **☰** 按钮；
3. 面板向上弹出：搜索框过滤问题，点击条目直接跳到对话对应位置；
4. 面板底部可切换每页条数（10/30/50），长会话可"加载更早的问题"；
5. 点击面板外部或按 `Esc` 收起。

## 目录结构

```
dsh-indexbookmark/
├── package.json      # 插件清单：dsh.bundle + dsh.client 声明
├── cordis.patch.yml  # bundle 补丁层（插入插件行）
├── build.mjs         # esbuild 构建脚本（JSX → 加载器格式 bundle）
├── lib/
│   ├── index.js      # host 端（最小实现，让 Loader 挂载）
│   └── client.js     # 浏览器端 bundle（构建产物，随仓库发布）
└── src/
    └── client.tsx    # 浏览器端源码（唯一需要手写的部分）
```

## 开发

```powershell
# 环境：Node.js 24+，pnpm（dsh plugin 用）

cd dsh-indexbookmark
# 首次：安装构建工具
& "C:\Program Files\nodejs\npm.cmd" install --save-dev esbuild
& "C:\Program Files\nodejs\npm.cmd" approve-scripts esbuild   # npm 新版需批准安装脚本

# 构建（产出 lib/client.js）
node build.mjs        # 或 npm run build
```

开发循环：改 `src/client.tsx` → `node build.mjs` → 浏览器硬刷新。

> Windows 提示：若 `npm` 命令无效，可能是被系统残留的 0 字节假文件遮蔽，请用完整路径 `C:\Program Files\nodejs\npm.cmd`。

## 架构要点

- **双面插件**：host 端极简（仅让 Cordis Loader 挂载），浏览器端承载全部功能；
- **加载器格式**：`window.__ModuleLoader__.load({id, factory})`，模块导出 `{name, inject, apply}`；
- **挂载槽位**：`conversation.input.right`（输入框右侧工具位，避免与侧边栏插件挤占）；
- **数据源**：`api.sessions.history({sessionId, beforeSeq?, maxMessages?})`，过滤 `user/message`（仅 `surfaceOp === 'append'`）；
- **缓存**：模块级 `Map`，只存提取后的问题，尾页 TTL 60s + 按 seq 增量合并，LRU 5 会话。

## 已知限制

- 定位使用文本前缀匹配（前 40 字符），前缀完全相同的问题可能定位到较早一条；目标行未渲染（极长会话）时会自动分段滚动加载后定位，加载不出则提示；
- 索引仅收录**追加来源**（`surfaceOp: append`）的问题——与对话实际渲染一致，保证每条都可跳转；
- 搜索仅覆盖已加载页的问题；
- 缓存为浏览器内存级，刷新页面（F5）后清空。

## 路线图（未实现）

- 工作区级 md 缓存（持久化，F5 不丢）+ MD5 校验
- 节点 key 精确锚定（替代文本匹配）
- 问题分组 / 按轮次归并
- 会话事件流实时增量订阅

## 许可

[MIT](LICENSE)
