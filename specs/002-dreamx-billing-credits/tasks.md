# Tasks: DreamX 站内计费 + AI 托管模式

**Input**: Design documents from `/specs/002-dreamx-billing-credits/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api-contracts.md ✓, quickstart.md ✓

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1=用户兑换积分, US2=节点积分消耗, US3=管理员脚本, US4=查看积分流水, US5=AI 托管模式

---

## Phase 1: Setup (共享基础设施)

**Purpose**: Convex schema + HTTP 路由 + 管理接口，所有 User Story 的前提

- [X] T001 在 `convex/schema.ts` 中确认并补全 `userCredits`、`creditsTransactions`、`redeemCodes`、`nodeCreditConfigs` 四张表的完整定义（含所有索引）
- [X] T002 在 `convex/credits.ts` 中实现 `seedNodeCreditConfigs` internalMutation，写入 6 种节点初始积分配置（mediaUpload/memeRecall/bgmRecall/storyboard/ttsSelection/capcutBuild）
- [X] T003 在 `convex/http.ts` 中新增 `POST /admin/seed-node-credit-configs` 和 `POST /admin/insert-redeem-codes` 两个 HTTP Action 路由（需 `ADMIN_SECRET_KEY` header 鉴权）

**Checkpoint**: Schema 部署完成，HTTP 管理接口可用

---

## Phase 2: Foundational (阻塞性前置任务)

**Purpose**: CreditsContext + 核心 Convex 查询/变更函数，所有 User Story 依赖此阶段

**⚠️ CRITICAL**: Phase 3+ 所有 User Story 必须等待此阶段完成

- [X] T004 在 `convex/credits.ts` 中实现 `getMyBalance` query（返回 balance/totalRedeemed/totalConsumed，不存在时返回全 0）
- [X] T005 [P] 在 `convex/credits.ts` 中实现 `getAllNodeCreditConfigs` query（返回所有节点配置列表）
- [X] T006 [P] 在 `convex/credits.ts` 中实现 `internal.credits.deductCreditsInternal` internalMutation（原子性扣减余额 + 插入流水，余额不足抛 ConvexError("INSUFFICIENT_CREDITS")）
- [X] T007 在 `app/contexts/CreditsContext.tsx` 中创建 CreditsContext，提供 `balance`、`nodeCosts: Record<string, number>`、`isLoading`、`autopilotEnabled`、`setAutopilotEnabled`、`autopilotError`、`clearAutopilotError` 字段
- [X] T008 在 `app/components/credits/CreditsBadge.tsx` 中创建 CreditsBadge 组件，接受 `nodeType: string, imageCount?: number` props，渲染 `<Badge>{N} 积分</Badge>`（含 ceil(imageCount/3) 附加积分计算，nodeCosts 不含该节点时不渲染）
- [X] T009 在 `app/components/dreamx-canvas/DreamXCanvas.tsx` 中用 `<CreditsProvider>` 包裹 Canvas 内容，并将 `CreditsContext` 提供给所有子节点

**Checkpoint**: CreditsContext 可用，积分余额可查，节点成本已加载

---

## Phase 3: User Story 1 - 用户兑换积分 (Priority: P1) 🎯 MVP

**Goal**: 用户在 Dashboard 侧边栏找到「兑换码」入口，输入兑换码成功后积分余额立即增加

**Independent Test**: 在 `/dashboard/credits` 页面输入有效兑换码，点击兑换后积分余额增加对应数值

### Implementation for User Story 1

- [X] T010 [US1] 在 `convex/credits.ts` 中实现 `redeemCode` mutation：标准化输入（转大写、去连字符）→ 查询 by_code 索引 → 校验存在且未使用 → 事务内更新 isUsed/usedBy/usedAt → upsert userCredits balance → insert creditsTransactions（type=redeem）→ 返回 creditsAdded/newBalance/codeType；错误时抛 ConvexError("CODE_NOT_FOUND") 或 ConvexError("CODE_ALREADY_USED")
- [X] T011 [P] [US1] 在 `app/components/credits/RedeemCodeForm.tsx` 中创建兑换码表单组件（已内联在 credits.tsx 页面中）
- [X] T012 [P] [US1] 在 `app/components/credits/CreditsBalanceBadge.tsx` 中创建积分余额展示组件，显示当前余额大号数字 + 累计兑换/消耗小字
- [X] T013 [US1] 在 `app/routes/dashboard/credits.tsx` 中创建兑换码页面，包含积分余额卡片（使用 CreditsBalanceBadge）+ 兑换码输入区（使用 RedeemCodeForm）；布局参考现有 settings 页面样式
- [X] T014 [US1] 在 `app/components/dashboard/app-sidebar.tsx` 的 navMain 数组中添加「兑换码」入口，指向 `/dashboard/credits`，图标使用 `Coins`
- [X] T015 [US1] 在 `app/routes.ts` 中注册 `/dashboard/credits` 路由

**Checkpoint**: 用户可进入兑换码页面、输入兑换码、看到余额变化

---

## Phase 4: User Story 2 - 积分消耗与节点交互 (Priority: P2)

**Goal**: 节点 LLM 调用按钮显示积分消耗标签，调用成功后原子性扣减积分，积分不足时按钮 disabled

**Independent Test**: 找到 DreamX 项目的「分析素材」按钮，确认显示积分标签，点击后余额减少对应数值

### Implementation for User Story 2

- [X] T016 [US2] 在 `convex/dreamXAI.ts` 的 `analyzeMediaBatch` action 中，LLM 调用成功后调用 `ctx.runMutation(internal.credits.deductCreditsInternal, { nodeType: "mediaUpload", imageCount: images.length, projectId, description: "消耗积分：mediaUpload 节点" })`；LLM 失败则不扣减
- [X] T017 [P] [US2] 在 `convex/dreamXAI.ts` 的 `generateStoryboard` action 中，LLM 调用成功后调用 `ctx.runMutation(internal.credits.deductCreditsInternal, { nodeType: "storyboard", imageCount: 0, projectId, description: "消耗积分：storyboard 节点" })`
- [X] T018 [P] [US2] 在 `convex/dreamXAI.ts` 的 `generateTTSPerSegment` action 中，调用成功后扣减 ttsSelection 节点积分
- [X] T019 [P] [US2] 在 `convex/dreamXAI.ts` 的 `buildCapcutProject` action（或 `convex/capcutBuilder.ts`）中，构建成功后扣减 capcutBuild 节点积分
- [X] T020 [US2] 在 `app/components/dreamx-canvas/nodes/MediaUploadNode.tsx` 中：为「分析素材」按钮添加 `<CreditsBadge nodeType="mediaUpload" imageCount={images.length} />`；当 `balance < cost` 时按钮 disabled，hover 显示 tooltip「积分不足，前往兑换码页面」
- [X] T021 [P] [US2] 在 `app/components/dreamx-canvas/nodes/StoryboardNode.tsx` 中为「生成分镜」按钮添加 `<CreditsBadge nodeType="storyboard" />`，并添加积分不足 disabled 逻辑
- [X] T022 [P] [US2] 在 `app/components/dreamx-canvas/nodes/TTSSelectionNode.tsx` 中为「生成配音」按钮添加 `<CreditsBadge nodeType="ttsSelection" />`，并添加积分不足 disabled 逻辑
- [X] T023 [P] [US2] 在 `app/components/dreamx-canvas/nodes/CapcutBuildNode.tsx` 中为「构建剪映工程」按钮添加 `<CreditsBadge nodeType="capcutBuild" />`，并添加积分不足 disabled 逻辑
- [X] T024 [P] [US2] 在 `app/components/dreamx-canvas/nodes/MemeRecallNode.tsx` 中为主操作按钮添加 `<CreditsBadge nodeType="memeRecall" />`（当 isEnabled=true 时显示）
- [X] T025 [P] [US2] 在 `app/components/dreamx-canvas/nodes/BgmRecallNode.tsx` 中为主操作按钮添加 `<CreditsBadge nodeType="bgmRecall" />`（当 isEnabled=true 时显示）

**Checkpoint**: 所有 6 个节点 LLM 按钮均显示积分标签；积分足时正常扣减，不足时按钮 disabled

---

## Phase 5: User Story 3 - 管理员批量生成兑换码 (Priority: P3)

**Goal**: 管理员运行离线脚本生成兑换码并写入数据库，输出到文件

**Independent Test**: 运行 `node scripts/generate-redeem-codes.mjs --type trial --count 10`，控制台输出 10 条兑换码，并可在系统中成功兑换

### Implementation for User Story 3

- [X] T026 [US3] 在 `scripts/generate-redeem-codes.mjs` 中实现完整脚本：解析 `--type (trial|vip|svip)`、`--count N`、`--output path`、`--all` 参数；生成 16 位大写字母+数字随机码（批内去重）；以 `XXXX-XXXX-XXXX-XXXX` 格式写入文件；调用 `POST /admin/insert-redeem-codes` HTTP Action 批量写入 Convex；支持 `--all`（每种类型各生成 10 个）

**Checkpoint**: 管理员可生成兑换码文件，生成的码在系统中可被用户兑换

---

## Phase 6: User Story 4 - 查看积分流水 (Priority: P4)

**Goal**: 用户在兑换码页面查看积分变动记录（兑换和消耗两类），按时间倒序排列

**Independent Test**: 兑换一次兑换码后，流水列表新增一条兑换记录，类型/积分数量/时间正确

### Implementation for User Story 4

- [X] T027 [US4] 在 `convex/credits.ts` 中实现 `getMyTransactions` query（按 by_userId_createdAt 索引倒序查询，支持 limit 参数，默认 20，最大 100）
- [X] T028 [US4] 在 `app/routes/dashboard/credits.tsx` 中添加积分流水列表区域：使用 `useQuery(api.credits.getMyTransactions)` 获取数据，按时间倒序渲染列表（类型图标 +/−、积分数量、描述、时间）

**Checkpoint**: 兑换码页面完整展示余额 + 兑换表单 + 流水列表

---

## Phase 7: User Story 5 - AI 托管模式 (Priority: P5)

**Goal**: Canvas 页面右上角提供「AI 托管」开关，开启后节点依次自动执行，无需用户确认

**Independent Test**: 开启托管开关，等待所有节点自动完成至 capcutBuild 导出，期间无需手动点击任何按钮

### Implementation for User Story 5

- [X] T029 [US5] 在 `app/components/dreamx-canvas/AutopilotSwitch.tsx` 中创建 AutopilotSwitch 组件：使用 shadcn/ui `Switch` + `Label` 显示「AI 托管」，开启时显示 `Badge` 提示「自动运行中...」，`autopilotError` 非空时通过 toast 提示错误并自动关闭；从 CreditsContext 获取状态
- [X] T030 [US5] 在 `app/components/dreamx-canvas/DreamXCanvas.tsx` 中将 `AutopilotSwitch` 添加到顶部工具栏右侧区域
- [X] T031 [US5] 在 `app/components/dreamx-canvas/nodes/MediaUploadNode.tsx` 中添加 autopilot useEffect：分析完成后自动 confirmAnalysis
- [X] T032 [P] [US5] 在 `app/components/dreamx-canvas/nodes/MemeRecallNode.tsx` 中添加 autopilot useEffect：自动选择前 min(3, suggestedMemes.length) 个 meme 并确认
- [X] T033 [P] [US5] 在 `app/components/dreamx-canvas/nodes/BgmRecallNode.tsx` 中添加 autopilot useEffect：自动选第一个推荐 BGM 并确认（或 skip）
- [X] T034 [P] [US5] 在 `app/components/dreamx-canvas/nodes/StoryboardNode.tsx` 中添加 autopilot useEffect：storyboard 生成完成后自动调用 `completeStoryboard`
- [X] T035 [P] [US5] 在 `app/components/dreamx-canvas/nodes/TTSSelectionNode.tsx` 中添加 autopilot useEffect：自动选第一个推荐声音并触发 TTS 生成
- [X] T036 [P] [US5] 在 `app/components/dreamx-canvas/nodes/CapcutBuildNode.tsx` 中添加 autopilot useEffect：直接触发 `buildCapcutProject`
- [X] T037 [US5] 在所有节点的 autopilot 错误处理中统一调用 `setAutopilotEnabled(false)` 并传入 `autopilotError` 原因字符串

**Checkpoint**: 开启托管后所有节点自动完成，任意节点报错时托管自动暂停

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 侧边栏余额徽章、路由注册、整体联调收尾

- [X] T038 [P] 在 `app/components/dashboard/nav-main.tsx` 中于「兑换码」导航项旁添加 `<CreditsBalanceBadge>` 显示余额（需在 nav-main 中访问 CreditsContext，确认 Provider 覆盖范围）
- [ ] T039 运行 quickstart.md 中的完整验证清单：生成兑换码 → 兑换 → 节点积分扣减 → 积分不足拦截 → 流水记录 → 托管模式
- [ ] T040 [P] 调用 `POST /admin/seed-node-credit-configs` 初始化生产环境节点积分配置

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 完成，阻塞所有 User Story
- **Phase 3–7 (User Stories)**: 均依赖 Phase 2 完成；User Story 之间相互独立，可并行
- **Phase 8 (Polish)**: 依赖 Phase 3–7 按需完成后进行

### User Story Dependencies

- **US1 (P1)**: Phase 2 完成后即可开始，无其他依赖
- **US2 (P2)**: Phase 2 + US1 T010（deductCreditsInternal 内部 mutation）完成后开始
- **US3 (P3)**: Phase 1 T003（HTTP 路由）完成后即可开始
- **US4 (P4)**: US1 完成后开始（依赖兑换码页面骨架）
- **US5 (P5)**: Phase 2 T007（CreditsContext）完成后即可开始，与 US2 独立

### Within Each User Story

- Convex 后端函数先于前端组件
- Context/共享组件先于页面组件
- 页面组件先于路由注册

### Parallel Opportunities

- T004, T005, T006 可在 Phase 2 内并行
- T011, T012 可并行（不同文件）
- T016–T019 可并行（不同 action）
- T020–T025 可并行（不同节点文件）
- T032–T036 可并行（不同节点文件）

---

## Parallel Example: User Story 2

```bash
# 后端 action 积分扣减（并行）:
Task: T017 generateStoryboard 积分扣减
Task: T018 generateTTSPerSegment 积分扣减
Task: T019 buildCapcutProject 积分扣减

# 节点 UI 积分标签（并行）:
Task: T021 StoryboardNode CreditsBadge
Task: T022 TTSSelectionNode CreditsBadge
Task: T023 CapcutBuildNode CreditsBadge
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup（T001–T003）
2. 完成 Phase 2: Foundational（T004–T009，**阻塞**）
3. 完成 Phase 3: User Story 1（T010–T015）
4. **停止并验证**: 兑换码页面完整闭环可用
5. 部署/演示

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. **+US1** → 兑换码完整闭环（MVP）
3. **+US2** → 节点积分消耗上线
4. **+US3** → 管理员脚本上线
5. **+US4** → 流水记录可见
6. **+US5** → AI 托管模式上线

---

## Notes

- [P] 标记 = 不同文件、无依赖，可并行执行
- [Story] 标签对应 spec.md 中各用户故事，便于追踪
- `deductCreditsInternal` 是 internalMutation，仅供 Convex action 内部调用；`deductCredits` 是前端可调用的 mutation（如需要）
- 兑换码存储时去除连字符（纯 16 位），展示/生成时带连字符格式
- 积分扣减时序：先 LLM 调用，成功后扣减，失败不扣
- autopilot 开关为 React state（非持久化），刷新即重置
