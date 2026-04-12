# Tasks: AI托管功能重写

**Input**: Design documents from `/specs/003-ai-hosting-rewrite/`
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓, contracts/api-contracts.md ✓, quickstart.md ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Phase 1: Setup（共享基础设施）

**Purpose**: Schema 变更和基础数据模型，所有 User Story 共同依赖

- [x] T001 修改 `convex/schema.ts`：在 `dreamXProjects` 表新增 `autopilotFailed: v.optional(v.boolean())` 字段，并新增 `autopilotJobs` 表（含 `projectId`, `currentNodeIndex`, `retryCount`, `pendingScheduledJobId`, `confirmedNodeIndices`, `createdAt`, `updatedAt` 字段及 `by_project` 索引）

**Checkpoint**: `npx convex dev` 无报错，schema 变更生效

---

## Phase 2: Foundational（阻塞型前置任务）

**Purpose**: 后端核心 mutations/queries，所有 User Story 均依赖

**⚠️ CRITICAL**: 在此 Phase 完成之前，所有 User Story 实现均无法开始

- [x] T002 重写 `convex/autopilot.ts`：实现 `enableAutopilot` public mutation（鉴权、images 非空校验、删除旧 job、创建新 AutopilotJob、调度 runAutopilotStep，幂等忽略已运行托管）
- [x] T003 在 `convex/autopilot.ts` 实现 `disableAutopilot` public mutation（鉴权、取消 pendingScheduledJobId、删除 job 记录、写 autopilotEnabled=false）
- [x] T004 [P] 在 `convex/autopilot.ts` 实现 `getProjectAutopilotStatus` public query（返回 `{ enabled, failed } | null`）
- [x] T005 [P] 在 `convex/autopilot.ts` 实现 `getAutopilotProjects` public query（返回当前用户所有 autopilotEnabled=true 或 autopilotFailed=true 的项目，含 failed 字段）
- [x] T006 [P] 在 `convex/autopilot.ts` 实现 `_stopAutopilot` internalMutation（写 autopilotEnabled=false, autopilotFailed=false，删除 AutopilotJob）
- [x] T007 [P] 在 `convex/autopilot.ts` 实现 `_markFailed` internalMutation（写 autopilotEnabled=false, autopilotFailed=true，删除 AutopilotJob）
- [x] T008 [P] 在 `convex/autopilot.ts` 实现 `_updateJob` internalMutation（通用 patch AutopilotJob 字段）
- [x] T009 [P] 在 `convex/autopilot.ts` 实现 `_scheduleNextStep` internalMutation（调度 runAutopilotStep，写 pendingScheduledJobId 到 job 记录）
- [x] T010 重写 `convex/autopilotActions.ts`：实现 `runAutopilotStep` internalAction（接收 `{ projectId, jobId }`，清空 pendingScheduledJobId，遍历 PIPELINE 执行完整调度链逻辑：全部完成→_stopAutopilot，error→_markFailed，retryCount≥30→_markFailed(timeout)，generating→retryCount++调度10s重试，idle且已在confirmedNodeIndices→跳过推进，idle未确认→执行handler追加索引）

**Checkpoint**: `npm run typecheck` 通过，后端接口全部实现

---

## Phase 3: User Story 1 - 用户开启AI托管后全流程自动完成（Priority: P1）🎯 MVP

**Goal**: 用户点击\"开启AI托管\"后，系统从当前节点逐节点自动推进，直至 CapCut 成片完成，全程无需手动干预

**Independent Test**: 素材上传节点图片分析完成后开启AI托管，验证系统依次自动完成所有6个节点并最终生成 CapCut 工程文件

### Implementation for User Story 1

- [x] T011 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleMediaUpload` handler（检查 images.length > 0 且所有 aiDescription 非空，调用 `internal.autopilot._completeMediaUpload` 或等效确认 mutation）
- [x] T012 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleMemeRecall` handler（检查 memeRecall status === idle，调用 `_completeMemeRecall` internalMutation）
- [x] T013 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleBgmRecall` handler（检查 bgmRecall status === idle，随机选取一个 BGM，调用 bgmRecall 确认 mutation，同步触发 storyboard 生成）
- [x] T014 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleStoryboard` handler（storyboard 由 bgmRecall 确认时已触发，此处检测 status：completed→推进，generating→重试，error→markFailed）
- [ ] T015 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleTtsSelection` handler（检查 ttsSelection status === idle，调用生成配音 mutation）
- [ ] T016 [US1] 在 `convex/autopilotActions.ts` 的 `runAutopilotStep` 中实现 `handleCapcutBuild` handler（检查 capcutBuild status === idle，调用生成 CapCut 工程 mutation）
- [ ] T017 [US1] 在 `convex/autopilotActions.ts` 验证 PIPELINE 常量定义（`["mediaUpload","memeRecall","bgmRecall","storyboard","ttsSelection","capcutBuild"]`）及各 handler 的 confirmedNodeIndices 幂等检查（追加前检查索引是否已存在）

**Checkpoint**: 开启AI托管后全流程6个节点自动完成，完成后 `autopilotEnabled=false, autopilotFailed=false`

---

## Phase 4: User Story 2 - 用户退出编辑页后后台继续托管（Priority: P1）

**Goal**: 用户离开编辑页到 Dashboard，后台托管继续运行，Dashboard 显示\"托管中\"标识，完成后标识消失

**Independent Test**: 开启AI托管后立即跳转到 Dashboard，验证显示\"托管中\"标识，等待完成后标识消失

### Implementation for User Story 2

- [ ] T018 [P] [US2] 修改 `app/routes/dashboard/index.tsx`：订阅 `api.autopilot.getAutopilotProjects` query，在项目卡片上根据 `failed` 字段展示三态 badge（`enabled=true`→\"托管中\"；`failed=true`→\"失败\"；否则不显示 badge），三种状态使用视觉可区分样式

**Checkpoint**: Dashboard 正确显示托管中/失败/普通三态，与后端状态100%一致

---

## Phase 5: User Story 3 - 用户从某节点重置后继续AI托管（Priority: P2）

**Goal**: 用户重置到中间节点后开启AI托管，系统从重置节点开始推进，不重复已完成的前序节点

**Independent Test**: 将分镜脚本节点重置为 idle，开启AI托管，验证从分镜脚本节点开始自动推进，前序节点不重复执行

### Implementation for User Story 3

- [ ] T019 [US3] 验证 `enableAutopilot` mutation 逻辑中：开启新托管会话时找到 PIPELINE 中第一个 status !== "completed" 的节点作为 `startIndex`，并确保新建 AutopilotJob 时 `confirmedNodeIndices=[]`（不继承旧 job 的确认记录）
- [ ] T020 [US3] 验证 `runAutopilotStep` 中对于已 completed 的节点（idnex < currentNodeIndex 或 status=completed）直接跳过不重复触发，确保前序节点不受影响

**Checkpoint**: 重置节点后开启托管，仅从重置节点起自动推进，前序已完成节点无变化

---

## Phase 6: User Story 4 - 各节点完成条件精确触发（Priority: P1）

**Goal**: 每个节点在精确满足完成条件时由托管触发一次确认，与手动点击等效，不早触发也不漏触发

**Independent Test**: 逐一验证每节点：完成条件满足前托管不触发确认，满足后恰好触发一次确认

### Implementation for User Story 4

- [ ] T021 [US4] 在 `convex/autopilotActions.ts` 完善 mediaUpload 就绪条件检查：`images.length > 0` 且所有 `images[].aiDescription` 非空，否则调度重试等待（不直接 markFailed）
- [ ] T022 [US4] 在 `convex/autopilotActions.ts` 完善 memeRecall 就绪条件：status === "idle" 时立即确认（AI 分析已在 generating 阶段完成）
- [ ] T023 [US4] 在 `convex/autopilotActions.ts` 完善 bgmRecall 就绪条件：status === "idle" 且候选 BGM 列表非空时随机选取并确认，并同步触发 storyboard 生成（无需额外 scheduling）
- [ ] T024 [US4] 在 `convex/autopilotActions.ts` 完善 ttsSelection 就绪条件：storyboard status === "completed" 后 ttsSelection 自动解锁为 idle，检测 idle 即触发生成配音
- [ ] T025 [US4] 在 `convex/autopilotActions.ts` 完善 capcutBuild 就绪条件：ttsSelection status === "completed" 后 capcutBuild 自动解锁为 idle，检测 idle 即触发生成 CapCut 工程

**Checkpoint**: 各节点完成条件精确，无提前触发或遗漏，全流程串行推进无卡死

---

## Phase 7: 前端状态展示与通知

**Purpose**: 前端订阅新接口，展示托管状态，检测失败时 Toast 通知

- [ ] T026 [P] 修改 `app/contexts/CreditsContext.tsx`：将旧 `getProjectAutopilot` 替换为 `api.autopilot.getProjectAutopilotStatus`（返回 `{ enabled, failed }`），检测 `failed` 由 false 变为 true 时弹出 Toast 通知用户托管失败
- [ ] T027 [P] 修改 `app/components/dreamx-canvas/AutopilotSwitch.tsx`：调用 `api.autopilot.enableAutopilot` / `api.autopilot.disableAutopilot`（替换旧 `setAutopilot`），`enabled=true` 时按钮置灰/禁用并显示\"托管中\"，`failed=true` 时显示失败状态 badge

---

## Phase 8: Polish & 类型检查

**Purpose**: 清理旧代码，确保类型通过，整体验收

- [ ] T028 [P] 删除或清理 `convex/autopilot.ts` 中不再使用的旧 `setAutopilot`、旧 `getProjectAutopilot` 等过时接口（若存在），确保无遗留引用
- [ ] T029 运行 `npm run typecheck`，修复所有类型错误
- [ ] T030 按照 `specs/003-ai-hosting-rewrite/quickstart.md` 测试流程，逐一验证 US1~US4 的 Independent Test 场景

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 完成，阻塞所有 User Story
- **Phase 3~6 (User Stories)**: 依赖 Phase 2 完成
  - US1 (Phase 3) 和 US4 (Phase 6) 高度耦合（均涉及 runAutopilotStep handlers），建议连续完成
  - US2 (Phase 4) 仅涉及前端 Dashboard，可独立并行
  - US3 (Phase 5) 依赖 Phase 2 的 enableAutopilot 逻辑，可在 Phase 3 后验证
- **Phase 7 (前端展示)**: 依赖 Phase 2（接口）和 Phase 4（Dashboard），可与 Phase 3 并行
- **Phase 8 (Polish)**: 依赖所有 Phase 完成

### User Story Dependencies

- **US1 (P1)**: Phase 2 完成后可开始，核心全流程 handler 实现
- **US2 (P1)**: Phase 2 完成后可开始，独立前端 Dashboard 展示
- **US3 (P2)**: Phase 3 完成后验证，依赖 enableAutopilot 正确实现 startIndex 和 confirmedNodeIndices=[]
- **US4 (P1)**: 与 US1 紧耦合，在 Phase 3 完成后补充精确就绪条件

### Parallel Opportunities

- T004, T005, T006, T007, T008, T009 均操作不同接口，可并行实现（同在 autopilot.ts 不同 export）
- T011~T016 各 handler 逻辑独立，可并行开发后组合到 runAutopilotStep
- T018 (Dashboard) 与 Phase 3 可并行（不同文件）
- T026 (CreditsContext) 与 T027 (AutopilotSwitch) 可并行（不同文件）
- T028, T029 可并行

---

## Parallel Example: Phase 2 Foundational

```
# Foundational mutations 可并行实现（同文件不同 export）：
Task T002: enableAutopilot mutation
Task T003: disableAutopilot mutation
Task T004: getProjectAutopilotStatus query
Task T005: getAutopilotProjects query
Task T006: _stopAutopilot internalMutation
Task T007: _markFailed internalMutation
Task T008: _updateJob internalMutation
Task T009: _scheduleNextStep internalMutation
```

---

## Implementation Strategy

### MVP First（User Story 1 + 2）

1. 完成 Phase 1: Schema 变更
2. 完成 Phase 2: 后端核心接口（CRITICAL）
3. 完成 Phase 3: US1 全流程 handlers
4. 完成 Phase 4: US2 Dashboard 展示
5. 完成 Phase 7: 前端 AutopilotSwitch 和 CreditsContext 更新
6. **STOP & VALIDATE**: 手动测试 US1 全流程 + US2 后台托管
7. 继续 Phase 5~6 完成 US3 和 US4 精确触发

### Incremental Delivery

1. Phase 1 + 2 → 后端接口就绪
2. Phase 3 + Phase 7 → US1 可用 + 前端联通（MVP）
3. Phase 4 → US2 Dashboard 三态展示
4. Phase 5 → US3 重置后继续托管
5. Phase 6 → US4 精确触发条件强化
6. Phase 8 → 清理 + 类型检查 + 验收
