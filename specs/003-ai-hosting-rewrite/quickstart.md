# Quickstart: AI托管功能重写

**Branch**: `003-ai-hosting-rewrite` | **Date**: 2026-04-13

---

## 开发环境

```bash
# 启动 Convex 开发服务器
npx convex dev

# 启动前端
npm run dev

# 类型检查
npm run typecheck
```

---

## 实现顺序

### Step 1: Schema 变更

修改 `convex/schema.ts`：

1. 在 `dreamXProjects` 表新增字段：
   ```typescript
   autopilotFailed: v.optional(v.boolean()),
   ```

2. 新增 `autopilotJobs` 表：
   ```typescript
   autopilotJobs: defineTable({
     projectId: v.id("dreamXProjects"),
     currentNodeIndex: v.number(),
     retryCount: v.number(),
     pendingScheduledJobId: v.optional(v.id("_scheduled_functions")),
     confirmedNodeIndices: v.array(v.number()),
     createdAt: v.number(),
     updatedAt: v.number(),
   }).index("by_project", ["projectId"]),
   ```

验证：`npx convex dev` 无报错。

---

### Step 2: 重写 `convex/autopilot.ts`

替换现有文件，实现：
- `enableAutopilot` mutation（公开）
- `disableAutopilot` mutation（公开）
- `getProjectAutopilotStatus` query（公开）
- `getAutopilotProjects` query（公开，扩展返回 `failed` 字段）
- `_stopAutopilot` internalMutation
- `_markFailed` internalMutation
- `_updateJob` internalMutation
- `_scheduleNextStep` internalMutation

详见 `specs/003-ai-hosting-rewrite/contracts/api-contracts.md`。

---

### Step 3: 重写 `convex/autopilotActions.ts`

替换现有文件，实现 `runAutopilotStep` internalAction：
- 接收 `{ projectId, jobId }` 参数
- 执行节点检测 + 确认逻辑
- 管理 `retryCount` 和 `confirmedNodeIndices`

---

### Step 4: 前端更新

#### 4a. `app/contexts/CreditsContext.tsx`

- 将 `getProjectAutopilot` 替换为 `getProjectAutopilotStatus`（返回 `{ enabled, failed }`）
- 检测 `failed` 从 false → true 时弹 Toast 通知

#### 4b. `app/components/dreamx-canvas/AutopilotSwitch.tsx`

- 调用 `enableAutopilot` / `disableAutopilot`（替换 `setAutopilot`）
- 展示 `failed` 状态 badge

#### 4c. `app/routes/dashboard/index.tsx`

- 订阅 `getAutopilotProjects`（现已返回 `failed` 字段）
- 项目卡片展示三态 badge

---

## 测试流程

### 测试 User Story 1（全流程自动完成）

1. 创建项目，上传图片，等待 AI 分析完成
2. 点击"开启AI托管"
3. 验证：系统依次完成所有 6 个节点，期间无需手动干预
4. 验证：完成后 Dashboard 无托管标识

### 测试 User Story 2（后台继续托管）

1. 开启 AI 托管
2. 立即切换到 Dashboard
3. 验证：Dashboard 显示"托管中"标识
4. 等待全部完成，验证标识消失

### 测试 User Story 3（重置后继续托管）

1. 全流程完成后，重置分镜脚本节点
2. 重新开启 AI 托管
3. 验证：从分镜脚本节点开始，前序节点不重复执行

### 测试重试上限（SC-008）

1. 开启托管
2. 模拟某节点长时间停在 generating 状态
3. 验证：30 次重试（约 5 分钟）后托管停止，Dashboard 显示"失败"

### 测试幂等性（SC-003）

1. 开启托管后，快速多次调用 `enableAutopilot`
2. 验证：同一节点确认操作只执行一次

---

## 关键约束

- 所有 Convex 代码修改后必须通过 `npm run typecheck`
- `autopilotJobs` 表每个 `projectId` 只允许一条记录（通过查询+删除旧记录保证，非 DB 唯一约束）
- `runAutopilotStep` 必须接收 `jobId` 参数，避免读取已删除的旧 job
- 前端 `enableAutopilot` 按钮在 `autopilotEnabled === true` 时置灰/禁用
