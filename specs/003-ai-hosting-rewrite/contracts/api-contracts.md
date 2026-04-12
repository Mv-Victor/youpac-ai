# Contracts: AI托管功能重写

**Branch**: `003-ai-hosting-rewrite` | **Date**: 2026-04-13

---

## 公开 Convex Mutations（前端调用）

### `autopilot.enableAutopilot`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
}
returns: void
```

**行为**:
1. 鉴权（必须是项目 owner）
2. 检查 `mediaUpload.images.length > 0`，否则抛出 `"请先上传图片"` 错误
3. 查询同 `projectId` 的已有 `autopilotJobs` 记录，若存在：取消 `pendingScheduledJobId` 并删除
4. 写 `project.autopilotEnabled=true, project.autopilotFailed=false`
5. 创建新 `AutopilotJob`（`currentNodeIndex=startIndex, retryCount=0, confirmedNodeIndices=[]`）
6. 调度 `runAutopilotStep`（delay=1000ms），写 `pendingScheduledJobId`

**幂等性**: 若项目已有活跃 `autopilotJobs` 记录（`project.autopilotEnabled === true`），忽略本次调用（无副作用）。

**错误**:
- `"Unauthorized"` — 未登录或非项目 owner
- `"请先上传图片"` — `mediaUpload.images` 为空

---

### `autopilot.disableAutopilot`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
}
returns: void
```

**行为**:
1. 鉴权
2. 查询 `autopilotJobs` by `projectId`，取消 `pendingScheduledJobId`，删除记录
3. 写 `project.autopilotEnabled=false`（`autopilotFailed` 不改动）

**注意**: 不中断正在执行的生成任务（FR-005）。

---

## 公开 Convex Queries（前端订阅）

### `autopilot.getProjectAutopilotStatus`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
}
returns: {
  enabled: boolean;
  failed: boolean;
} | null
```

返回项目当前托管状态，供 `AutopilotSwitch`、`CreditsContext` 订阅。

---

### `autopilot.getAutopilotProjects`

```typescript
args: {}
returns: Array<{
  projectId: Id<"dreamXProjects">;
  title: string;
  failed: boolean;
}>
```

返回当前用户所有托管相关的项目（`autopilotEnabled === true` 或 `autopilotFailed === true`），供 Dashboard 展示三态 badge。

---

## Internal Mutations（仅 Convex 内部调用）

### `autopilot._stopAutopilot`

```typescript
args: { projectId: v.id("dreamXProjects") }
```

成功完成时调用：写 `autopilotEnabled=false, autopilotFailed=false`，删除 `AutopilotJob`。

---

### `autopilot._markFailed`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
  reason: v.optional(v.string()),
}
```

失败/超时时调用：写 `autopilotEnabled=false, autopilotFailed=true`，删除 `AutopilotJob`。

---

### `autopilot._updateJob`

```typescript
args: {
  jobId: v.id("autopilotJobs"),
  patch: v.object({
    currentNodeIndex: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    pendingScheduledJobId: v.optional(v.union(v.id("_scheduled_functions"), v.null())),
    confirmedNodeIndices: v.optional(v.array(v.number())),
  }),
}
```

通用 job 状态更新（由 `runAutopilotStep` 在执行过程中调用）。

---

### `autopilot._scheduleNextStep`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
  jobId: v.id("autopilotJobs"),
  delayMs: v.number(),
}
```

调度下一次 `runAutopilotStep`，写 `pendingScheduledJobId` 到 job 记录。

---

## Internal Action（Convex scheduler 执行）

### `autopilotActions.runAutopilotStep`

```typescript
args: {
  projectId: v.id("dreamXProjects"),
  jobId: v.id("autopilotJobs"),
}
```

**执行流程**:
1. 读取 `project` 和 `autopilotJob`
2. 若 project 不存在 / `autopilotEnabled !== true` → 直接返回
3. 将 `job.pendingScheduledJobId` 清空（null）——防止 double-cancel
4. 遍历 PIPELINE，找到第一个 status !== "completed" 的节点作为 `currentNode`
5. 若无 `currentNode`（全部 completed）→ `_stopAutopilot`，返回
6. 若 `currentNode.status === "error"` → `_markFailed`，返回
7. 若 `job.retryCount >= 30` → `_markFailed(timeout)`，返回
8. 若 `currentNode.status === "generating"` → `retryCount++`，调度 10s 后重试，返回
9. 若 `currentNode.status === "idle"`:
   - 检查 `confirmedNodeIndices` 是否包含当前索引 → 若包含跳过，推进 `currentNodeIndex`
   - 否则执行对应 handler（handleMemeRecall 等）
   - 执行成功后追加索引到 `confirmedNodeIndices`
10. 调度下一步（delay=3000ms）

---

## 前端状态读取规则

```typescript
// CreditsContext / AutopilotSwitch
const { enabled, failed } = autopilotStatus ?? { enabled: false, failed: false };

// Dashboard badge
if (enabled) return "托管中";
if (failed) return "失败";
return null; // 普通状态，不显示 badge
```
