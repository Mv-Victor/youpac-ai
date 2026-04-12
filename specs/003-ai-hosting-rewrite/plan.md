# Implementation Plan: AI托管功能重写

**Branch**: `003-ai-hosting-rewrite` | **Date**: 2026-04-13 | **Spec**: specs/003-ai-hosting-rewrite/spec.md
**Input**: Feature specification from `/specs/003-ai-hosting-rewrite/spec.md`

## Summary

重写 DreamX AI 托管（Autopilot）功能的后端调度链与前端状态展示。新增独立 `autopilotJobs` 表管理每次托管会话的完整状态（包含 `confirmedNodeIndices` 幂等标记、`retryCount` 重试计数、`pendingScheduledJobId` 取消句柄），实现每节点最多确认一次、30次重试上限、精准取消已调度任务。前端增加 Dashboard 三态 badge（托管中 / 失败 / 普通）展示。

## Technical Context

**Language/Version**: TypeScript 5.x（React 19, Node.js 18+）  
**Primary Dependencies**: Convex ^1.24.3, React Router v7, shadcn/ui + TailwindCSS v4, sonner（Toast）  
**Storage**: Convex（`autopilotJobs` 新表 + `dreamXProjects` 字段扩展）  
**Testing**: 手动集成测试（参见 quickstart.md 测试流程）；`npm run typecheck` 必须通过  
**Target Platform**: Convex serverless（后端）+ React Router v7 SSR（前端）  
**Project Type**: Full-stack web application（Convex backend + React frontend）  
**Performance Goals**: 节点确认在满足条件后 5 秒内触发（SC-002）；重试间隔 10s ±1s（SC-008）  
**Constraints**: Convex-first（无其他后端运行时）；每 projectId 最多一条活跃 AutopilotJob；重试上限 30 次  
**Scale/Scope**: 单用户单项目维度；~5 个文件修改 + 2 个文件新增

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Convex-First Backend | PASS | 所有托管逻辑在 Convex mutations/actions 中实现；调度通过 `ctx.scheduler.runAfter()` |
| II | Schema-Driven Data Modeling | PASS | 新增 `autopilotJobs` 表定义在 `convex/schema.ts`；`dreamXProjects` 字段扩展已定义 |
| III | Client-Side AI Orchestration | PASS | 托管层不写 AI 生成逻辑，复用现有 `_completeMemeRecall` 等 internal mutations |
| IV | SSR Compatibility | PASS | 无新 browser-only 组件；仅修改现有 React 组件逻辑 |
| V | Secure Credential Management | PASS | 无新 API key；无秘钥写入代码 |
| VI | Simplicity and YAGNI | PASS | 不引入新抽象层；直接复用现有 internal mutation 接口 |
| VII | Incremental Delivery by User Story | PASS | 4 个 User Story 可独立验收 |

**Post-design re-check**: PASS — 设计决策符合所有原则。

## Project Structure

### Documentation (this feature)

```text
specs/003-ai-hosting-rewrite/
├── plan.md              # This file
├── research.md          # Phase 0 output ✓
├── data-model.md        # Phase 1 output ✓
├── quickstart.md        # Phase 1 output ✓
├── contracts/
│   └── api-contracts.md # Phase 1 output ✓
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
convex/
├── schema.ts                  # 修改：新增 autopilotJobs 表；dreamXProjects 增加 autopilotFailed
├── autopilot.ts               # 重写：enableAutopilot, disableAutopilot, getProjectAutopilotStatus,
│                              #        getAutopilotProjects, _stopAutopilot, _markFailed,
│                              #        _updateJob, _scheduleNextStep
└── autopilotActions.ts        # 重写：runAutopilotStep（接收 jobId 参数，含完整调度链逻辑）

app/
├── contexts/
│   └── CreditsContext.tsx     # 修改：订阅 getProjectAutopilotStatus，检测 failed 变化触发 Toast
├── components/dreamx-canvas/
│   └── AutopilotSwitch.tsx    # 修改：调用新 mutations，展示 failed badge
└── routes/dashboard/
    └── index.tsx              # 修改：订阅 getAutopilotProjects（含 failed 字段），展示三态 badge
```

**Structure Decision**: 保持现有文件结构，只修改/重写相关文件。不引入新目录或新抽象层。

## Complexity Tracking

> 无 Constitution 违规，此节留空。

---

## Phase 0 Research Summary

详见 `specs/003-ai-hosting-rewrite/research.md`。

关键决策：
- **新增 `autopilotJobs` 表**（而非复用 `dreamXProjects` 字段）：支持 retryCount、confirmedNodeIndices、pendingScheduledJobId 完整生命周期
- **`autopilotFailed` 字段**：配合 `autopilotEnabled` 实现 Dashboard 三态
- **`runAutopilotStep` 接收 `jobId`**：确保读取当前会话的 job，避免并发歧义
- **保留现有 internal mutations**（`_completeMemeRecall` 等）：托管层通过这些接口触发节点完成，不重复实现业务逻辑

## Phase 1 Design Summary

详见：
- `specs/003-ai-hosting-rewrite/data-model.md` — Schema 定义、状态机、验证规则
- `specs/003-ai-hosting-rewrite/contracts/api-contracts.md` — 所有 Convex mutations/queries/actions 接口
- `specs/003-ai-hosting-rewrite/quickstart.md` — 实现顺序与测试流程
