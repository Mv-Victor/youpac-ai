# Research: DreamX AI 托管模式 + 计费系统

**Phase**: 0 - Research  
**Feature Branch**: `002-dreamx-billing-credits`  
**Date**: 2026-04-07

---

## 1. AI 托管模式 (Autopilot Mode) 实现方案

### 决策

**选择方案**: 在 DreamXCanvas 层维护一个全局 React state `autopilotEnabled`，通过 React Context 传递给所有子节点。开关位于 Dashboard Header 右上角，使用 shadcn/ui `Switch` 组件。

**实现机制**:
- `autopilotEnabled` 状态存储在 `DreamXCanvas` 父组件中（或 `CreditsContext` 扩展）
- 各节点通过 `useAutopilot()` 或 `useCredits()` 访问该标志
- 节点在 `status === "idle"` 时检查 `autopilotEnabled`，若为 true 则跳过用户确认自动执行
- 托管执行顺序沿 pipeline 链：mediaUpload → memeRecall → bgmRecall → storyboard → ttsSelection → capcutBuild
- 当前节点完成后（`status === "completed"`），下一节点自动触发（已有机制，额外只需在节点层跳过确认）

**理由**:
- 现有 auto-trigger 机制（storyboard 已有 `StoryboardAutoTriggeredRef`）证明了该模式可行
- React Context 方式无需修改 Convex schema，最轻量
- 不需要服务端存储 autopilot 状态（属于临时会话偏好，刷新即可重置）
- 每个节点的 `useEffect` 监听 `status === "idle" && autopilotEnabled` 即可自动触发

**替代方案**:
- 存储在 Convex 项目中：过度设计，用户设置没必要持久化到服务端
- 用 URL query param：不直观，影响分享链接

**自动执行策略**（每节点）:

| 节点 | 需要自动决策的内容 | 托管默认策略 |
|------|-----------------|------------|
| mediaUpload | 分析完成后自动确认 | 自动调用 `confirmAnalysis`（使用第一张图和已填写的 eventDescription） |
| memeRecall | 自动选择推荐的 memes | 自动使用 AI 推荐结果（suggestedMemes 前 3 个），自动确认 |
| bgmRecall | 自动选择推荐的 BGM | 自动选第一个推荐 BGM，自动确认 |
| storyboard | 已有 auto-trigger | 生成完成后自动 `completeStoryboard` |
| ttsSelection | 自动选择推荐声音并生成 | 自动选第一个推荐声音，自动触发 TTS 生成 |
| capcutBuild | 自动触发构建 | 自动调用 `buildCapcutProject` |

**前置条件约束**: autopilot 只在 mediaUpload 节点 `status === "idle"` 时生效（即用户已上传图片并填写描述，手动触发分析之后）。不允许空白状态下全自动（需要有 eventDescription 输入）。

---

## 2. Dashboard Header 右上角 UI 设计

### 决策

**位置**: DreamX Canvas 页面 (`/dashboard/dreamx/:id`) 的页面内顶部工具栏（而非全局 dashboard header），与现有节点操作工具（如 ReactFlow controls）分区放置。

**实现方案**: 在 `DreamXCanvas.tsx` 内部的顶部 bar 区域（现已有项目标题区域），添加一个 `Switch` + `Label` 组合，显示 "AI 托管模式"，开启时显示 `Badge` 提示 "自动运行中..."。

**理由**:
- DreamX 专属功能，不应污染全局 sidebar/header
- 与现有 Canvas 布局保持一致（Canvas 页面有自己的顶部控制区）

---

## 3. 积分系统 (Credits System)

### 3.1 Convex Schema 决策

**现有 schema 已包含**:
- `userCredits` - 余额表
- `creditsTransactions` - 流水表
- `redeemCodes` - 兑换码表
- `nodeCreditConfigs` - 节点配置表

**新需求**: 无需新增表，schema 已满足所有功能需求。

### 3.2 积分消耗计算规则

**公式**: `totalCost = baseCost + ceil(imageCount / 3)`（imageCount=0 时附加为 0）

**节点基础积分配置**（`nodeCreditConfigs` 表初始值）:

| nodeType | baseCost |
|----------|---------|
| mediaUpload | 2 |
| memeRecall | 1 |
| bgmRecall | 1 |
| storyboard | 3 |
| ttsSelection | 2 |
| capcutBuild | 1 |

### 3.3 积分扣减时序

**已确认**: 先发起 LLM 调用，调用成功后扣减，失败不扣减。

**具体扣减点**:
- `analyzeMediaBatch` → 成功后扣 mediaUpload 成本
- `generateStoryboard` → 成功后扣 storyboard 成本
- `generateTTSPerSegment` → 成功后扣 ttsSelection 成本
- `buildCapcutProject` → 成功后扣 capcutBuild 成本
- memeRecall/bgmRecall → 无 LLM 调用（查询推荐），不扣积分（baseCost=1 但实际不扣，可根据产品需求调整）

### 3.4 兑换码格式

**格式**: 大写字母+数字，16位，`XXXX-XXXX-XXXX-XXXX`（存储时去连字符）
**校验**: 不区分大小写，输入时自动转大写

---

## 4. 前端组件设计

### 4.1 CreditsBadge 组件

**位置**: 每个节点中需要 LLM 调用的按钮旁
**内容**: `{cost} 积分` + tooltip 说明
**样式**: shadcn/ui `Badge` variant="secondary"

### 4.2 兑换码页面

**路由**: `/dashboard/credits`（已存在）
**内容**:
- 当前积分余额（大号数字）
- 兑换码输入框（支持粘贴，自动格式化）
- 兑换按钮
- 积分流水列表（变动类型、积分数量、时间）

### 4.3 AutopilotContext / 扩展 CreditsContext

**决策**: 将 `autopilotEnabled` 合并到现有 `CreditsContext` 中扩展（避免多层 Context）。
- 新增 `autopilotEnabled: boolean`
- 新增 `setAutopilotEnabled: (v: boolean) => void`

---

## 5. 技术风险与缓解

| 风险 | 严重度 | 缓解方案 |
|------|--------|---------|
| 托管模式下用户误操作无法撤回 | 中 | 提供明显的 "停止托管" 按钮，任意节点错误时自动暂停托管 |
| 积分并发重复兑换 | 高 | Convex mutation 内部使用乐观锁（`v.check()` 或唯一索引）防重 |
| 托管模式下积分不足导致中途停止 | 中 | 进入托管前检查估算总积分是否足够，不足时给出提示（不强制阻止） |
| TTS 生成时间较长影响托管流程 | 低 | 已有 `status === "generating"` 动画，托管中等待即可 |
| 节点执行失败托管无限重试 | 高 | 节点进入 `error` 状态时自动关闭托管模式，防止无限循环 |

---

## 6. 实现顺序（按 Priority）

1. **P1**: 积分兑换码页面（FR-001 ~ FR-007）
2. **P2**: 节点积分标签 + 扣减逻辑（FR-008 ~ FR-013）
3. **P3**: 管理员脚本（已有 `scripts/generate-redeem-codes.mjs`）
4. **P4**: AI 托管模式开关（用户输入的新功能）
