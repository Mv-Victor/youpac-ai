# Data Model: AI托管功能重写

**Branch**: `003-ai-hosting-rewrite` | **Date**: 2026-04-13

---

## Schema 变更

### 1. 新增表：`autopilotJobs`

```typescript
autopilotJobs: defineTable({
  projectId: v.id("dreamXProjects"),
  currentNodeIndex: v.number(),
  retryCount: v.number(),
  pendingScheduledJobId: v.optional(v.id("_scheduled_functions")),
  confirmedNodeIndices: v.array(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_project", ["projectId"])
```

**字段说明**:

| 字段 | 类型 | 描述 |
|------|------|------|
| `projectId` | `Id<"dreamXProjects">` | 绑定的项目；`by_project` 索引确保每个项目最多一条记录 |
| `currentNodeIndex` | `number` | 当前正在处理的节点在 PIPELINE 数组中的索引（0-5） |
| `retryCount` | `number` | 当前节点的已重试次数（generating 状态等待计数），初始为 0 |
| `pendingScheduledJobId` | `Id<"_scheduled_functions"> \| null` | 当前待执行的 Convex scheduler job ID；调度时写入，执行开始时清空（null），用于关闭托管时取消 |
| `confirmedNodeIndices` | `number[]` | 本次托管会话中已由托管成功确认的节点索引数组；初始为 `[]`；确认某节点后追加其索引 |
| `createdAt` | `number` | 创建时间戳（ms） |
| `updatedAt` | `number` | 最后更新时间戳（ms） |

**唯一性约束**: `by_project` 索引（`projectId`）；开启新托管前必须先删除同 `projectId` 的旧记录。

---

### 2. 修改表：`dreamXProjects`

**新增字段**:

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `autopilotFailed` | `v.optional(v.boolean())` | `undefined`（等价 false） | 上次托管是否以失败结束；配合 `autopilotEnabled` 实现三态展示 |

**现有字段（保留，兼容旧数据）**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `autopilotEnabled` | `v.optional(v.boolean())` | 是否正在托管中（保持现有） |
| `autopilotScheduledJobId` | `v.optional(v.id("_scheduled_functions"))` | 保留 optional，迁移后不再写入新值 |

---

### 3. Dashboard 三态读取规则

```
autopilotEnabled === true                          → "托管中"
autopilotEnabled !== true && autopilotFailed === true  → "失败"
autopilotEnabled !== true && autopilotFailed !== true  → 普通状态
```

---

## 状态机

### AutopilotJob 生命周期

```
[不存在]
    │ enableAutopilot()
    ▼
[创建 AutopilotJob]  currentNodeIndex=N, retryCount=0, confirmedNodeIndices=[]
    │ ctx.scheduler.runAfter(1000, runAutopilotStep)
    ▼
[待执行]  pendingScheduledJobId=<jobId>
    │ runAutopilotStep 执行
    ▼
[检查节点状态]
    │
    ├── 所有节点 completed → _stopAutopilot(success) → 删除 AutopilotJob
    │
    ├── 当前节点 error → _markFailed() → 删除 AutopilotJob
    │
    ├── retryCount >= 30 → _markFailed(timeout) → 删除 AutopilotJob
    │
    ├── 当前节点 generating → retryCount++, 调度 10s 后重试
    │
    ├── 当前节点 idle，索引已在 confirmedNodeIndices → 跳过，推进 currentNodeIndex
    │
    └── 当前节点 idle，索引未在 confirmedNodeIndices → 执行确认 → 追加索引 → 推进
```

### NodeState 状态机（每节点）

```
locked → idle → generating → completed
                           → error
```

---

## 实体关系

```
dreamXProjects
  ├── autopilotEnabled: boolean
  ├── autopilotFailed: boolean
  └── nodeStates: { mediaUpload, memeRecall, bgmRecall, storyboard, ttsSelection, capcutBuild }
       └── 每个节点: { status: locked|idle|generating|completed|error, ...data }

autopilotJobs  (1:1 with dreamXProjects when active)
  ├── projectId → dreamXProjects._id
  ├── currentNodeIndex: 0-5
  ├── retryCount: 0-30
  ├── pendingScheduledJobId → _scheduled_functions._id | null
  └── confirmedNodeIndices: number[]
```

---

## PIPELINE 常量（节点索引映射）

```typescript
const PIPELINE = [
  "mediaUpload",   // 0
  "memeRecall",    // 1
  "bgmRecall",     // 2
  "storyboard",    // 3
  "ttsSelection",  // 4
  "capcutBuild",   // 5
] as const;
```

---

## 节点就绪条件（确认前检查）

| 索引 | 节点 | 就绪条件 |
|------|------|---------|
| 0 | mediaUpload | `images.length > 0` 且所有 `images[].aiDescription` 非空；status === "idle" 或 "completed" |
| 1 | memeRecall | status === "idle" |
| 2 | bgmRecall | status === "idle" |
| 3 | storyboard | bgmRecall 确认时已同步触发生成；等待 status → completed |
| 4 | ttsSelection | status === "idle"（storyboard completed 后自动解锁）|
| 5 | capcutBuild | status === "idle"（ttsSelection completed 后自动解锁）|

---

## 验证规则

- `retryCount` 不得超过 30；超出即触发 `_markFailed`
- 同一 `projectId` 只能有一条 `autopilotJobs` 记录（通过查询+删除旧记录保证）
- `confirmedNodeIndices` 中同一索引不重复（插入前检查）
- `pendingScheduledJobId` 执行开始前清空，避免 double-cancel
- 开启托管前检查 `mediaUpload.images.length > 0`，否则拒绝并提示

---

## 迁移说明

无需 backfill：
- `autopilotFailed` 为 optional，旧记录 undefined 等价 false，Dashboard 三态规则兼容
- `autopilotScheduledJobId` 保持 optional，旧记录有值的项目在下次 enableAutopilot 时会被新逻辑覆盖
- 新 `autopilotJobs` 表初始为空，按需创建
