# Research: AI托管功能重写

**Branch**: `003-ai-hosting-rewrite` | **Date**: 2026-04-13

---

## 1. 现有代码库状态

### Decision: 完全重写 autopilot.ts + autopilotActions.ts，保留内部 mutation 接口

**Rationale**: 现有实现缺少 `AutopilotJob` 独立表、retry 上限、idempotency 标记、`autopilotFailed` 三态字段，以及每节点最多确认一次的保证。重写后复用现有的 `_completeMemeRecall`、`_completeBgmRecall`、`_completeStoryboard`、`_completeTTSSelection` 等 internal mutation。

**Alternatives considered**: 在现有实现上打补丁（patch） — 拒绝，因为调度链状态分散在 `dreamXProjects.autopilotScheduledJobId` 中，无法支持 `retryCount`、`confirmedNodeIndices`、`pendingScheduledJobId` 的完整生命周期管理。

---

## 2. Convex Schema 决策

### Decision: 新增 `autopilotJobs` 表；在 `dreamXProjects` 增加 `autopilotFailed` 字段

**Rationale**:
- `autopilotJobs` 表通过 `by_project` 唯一索引确保每个 project 最多一条活跃记录
- `autopilotFailed: boolean` 字段配合现有 `autopilotEnabled: boolean` 实现三态 Dashboard 展示
- 从 `dreamXProjects` 移除 `autopilotScheduledJobId`（迁移到 `autopilotJobs.pendingScheduledJobId`）

**Alternatives considered**: 继续用 `dreamXProjects` 存 scheduledJobId — 拒绝，无法存 `retryCount`、`confirmedNodeIndices`。

### Decision: 保留 `autopilotScheduledJobId` 为 optional 兼容旧数据，重写后不再写入

**Rationale**: Convex schema 改动需要向后兼容，旧字段保持 optional 即可，迁移无需 backfill。

---

## 3. Reactive 调度链设计

### Decision: 采用 Convex `ctx.scheduler.runAfter()` + `AutopilotJob.pendingScheduledJobId` 实现 reactive 调度链

**Rationale**:
- Convex scheduler 是项目 Convex-first 原则的标准工具
- `pendingScheduledJobId` 持久化支持精准取消（FR-016）
- 固定 10 秒间隔 × 30 次上限 = 最大 5 分钟等待（FR-002, SC-008）

**Pattern**:
1. `enableAutopilot` mutation → 创建 `AutopilotJob`，调度 `runAutopilotStep`（delay=1s）
2. `runAutopilotStep` internalAction → 检查节点状态，执行确认或重试
3. 若节点 generating → 调度下一步（delay=10s），写入 `pendingScheduledJobId`，增 `retryCount`
4. 若 `retryCount >= 30` → 标记失败，删 job
5. 每次执行前清空 `pendingScheduledJobId`（设 null），执行后写新值

---

## 4. 幂等性实现

### Decision: `confirmedNodeIndices: number[]` 存于 `AutopilotJob`，每次确认前检查

**Rationale**: 防止调度链并发/重复执行时同一节点被确认两次（FR-001, SC-003）。节点索引对应 PIPELINE 数组位置（0-5）。

**Flow**:
1. 准备执行节点 i 的确认前，检查 `confirmedNodeIndices.includes(i)`
2. 若已包含 → 跳过，调度下一步
3. 若不包含 → 执行确认，然后 `confirmedNodeIndices.push(i)` 更新到 DB

---

## 5. 节点完成条件检测

### Decision: 各节点在 `runAutopilotStep` 中通过读取 `nodeStates` 判断是否就绪

| 节点 | 就绪条件 |
|------|---------|
| mediaUpload (index=0) | 所有 images 的 `aiDescription` 均非空；images.length > 0 |
| memeRecall (index=1) | status === "idle"（前序完成后自动解锁）|
| bgmRecall (index=2) | status === "idle" |
| storyboard (index=3) | bgmRecall 确认时同步触发，status 从 idle→generating 由 bgmRecall confirm 副作用完成 |
| ttsSelection (index=4) | status === "completed" 后的 storyboard 触发；等待 storyboard → completed |
| capcutBuild (index=5) | status === "idle"（ttsSelection completed 后解锁）|

**storyboard 特殊处理**: 根据 FR-009，分镜脚本在 bgmRecall 确认时同步触发，不需要额外等待 idle 状态检测。实现方式：`_completeBgmRecall` 内部在完成 bgmRecall 的同时启动 storyboard 生成（已有逻辑）。`runAutopilotStep` 对 storyboard 节点的处理等同 generating/idle 的 generating 等待逻辑。

---

## 6. 失败处理与通知

### Decision: 失败时写 `project.autopilotFailed=true`，Toast 通知由前端响应式实现

**Rationale**: 后端只负责写 `autopilotEnabled=false, autopilotFailed=true`。前端 `CreditsContext` / `AutopilotSwitch` 监听 query 响应变化，若检测到 `autopilotFailed=true` 且之前 `autopilotEnabled=true`，弹出 Toast。

---

## 7. Dashboard 三态展示

### Decision: Dashboard 读取 `dreamXProjects` 的双字段计算三态

| `autopilotEnabled` | `autopilotFailed` | 展示 |
|---|---|---|
| true | any | 托管中 |
| false | true | 失败 |
| false | false | 普通状态 |

**实现**: `getAutopilotProjects` query 改为返回 `{ projectId, title, failed: boolean }`，或 Dashboard 直接读项目列表字段。

---

## 8. 素材上传节点特殊逻辑

### Decision: mediaUpload 节点不使用 `_claimNode`，由托管轮询 `aiDescription` 完成检查后直接触发 confirm

**Rationale**: 现有 `completeMediaUpload` mutation 是用户操作，autopilot 调用 internal 版本。mediaUpload 节点在 autopilot 开启时已处于 idle 或 generating 状态，需等待所有图片 AI 分析完成（所有 images[].aiDescription 非空）再触发确认，不得提前。

---

## 9. 积分扣除

### Decision: 积分扣除逻辑不变，由各节点现有内部 mutation/action 处理

**Rationale**: FR 规格明确"积分消耗逻辑保持不变"，托管层不额外管理积分。

---

## 10. 文件结构决策

### Decision: 拆分为 3 个 Convex 文件

| 文件 | 职责 |
|------|------|
| `convex/autopilot.ts` | 公开 mutations（enableAutopilot, disableAutopilot）+ queries（getProjectAutopilotStatus）+ internal mutations（_stopAutopilot, _markFailed, _scheduleNextStep, _claimNode, _markNodeConfirmed） |
| `convex/autopilotActions.ts` | `runAutopilotStep` internalAction + 各节点 handler 函数 |
| `convex/schema.ts` | 新增 `autopilotJobs` 表；`dreamXProjects` 增加 `autopilotFailed` |

**Rationale**: 保持与现有结构一致，mutation/query 与 action 分离（action 需 "use node" 环境）。

**Alternatives considered**: 合并为单文件 — 拒绝，Convex 要求 mutation 和 "use node" action 不能同文件（或需显式声明运行环境）。

---

## 11. PIPELINE 常量

```typescript
const PIPELINE = [
  "mediaUpload",   // index 0
  "memeRecall",    // index 1
  "bgmRecall",     // index 2
  "storyboard",    // index 3
  "ttsSelection",  // index 4
  "capcutBuild",   // index 5
] as const;
```

---

## 12. 前端改动范围

| 组件 | 改动 |
|------|------|
| `app/contexts/CreditsContext.tsx` | 订阅 `autopilotFailed` 状态，检测 failed 变化触发 Toast |
| `app/components/dreamx-canvas/AutopilotSwitch.tsx` | 展示失败状态 badge |
| `app/routes/dashboard/index.tsx` | 项目卡片展示三态 badge（托管中 / 失败 / 普通）|
| Convex query `getAutopilotProjects` | 扩展返回 `autopilotFailed` 字段 |

---

## 结论

所有 NEEDS CLARIFICATION 已解决。可进入 Phase 1 设计。
