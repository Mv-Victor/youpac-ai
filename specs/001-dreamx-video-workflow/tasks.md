# Tasks: DreamX AI 营销视频自动化生成工作流

**Input**: Design documents from `/specs/001-dreamx-video-workflow/`  
**Branch**: `001-dreamx-video-workflow`  
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Organization**: 按用户故事分阶段，每个故事可独立实现和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无未完成依赖）
- **[Story]**: 对应 spec.md 中的用户故事（US1-US5）

---

## Phase 1: Setup（基础设施初始化）

**Purpose**: Convex Schema 更新、内置素材 Seeder、capcutBuilder 重命名

- [X] T001 读取 `convex/_generated/ai/guidelines.md` 确认 Convex API 规范后，更新 `convex/schema.ts` 中 `dreamXProjects` 表的 `nodeStates`：将 `jianyingBuild` 重命名为 `capcutBuild`，在 `bgmRecall` 后新增 `ttsSelection` 节点字段（含 recommendedVoices、selectedVoiceType、audioStorageId 等，参见 data-model.md 完整定义）
- [X] T002 新建 `convex/capcutBuilder.ts`，将 `convex/jianyingBuilder.ts` 全部逻辑复制过来，将所有 `jianyingBuild` 字段引用改为 `capcutBuild`，将导出函数 `buildJianyingProject` 重命名为 `buildCapcutProject`
- [X] T003 新建 `convex/dreamXSeeder.ts`，实现 `seedBuiltinMedia` internal action（`"use node"`），读取 `/Users/huangzhidong/work/dreamX/doc/memes/` 和 `/Users/huangzhidong/work/dreamX/doc/bgm/` 下的内置素材（8张表情包 + 7首BGM，参见 data-model.md 素材清单），通过 `ctx.storage.store()` 上传到 Convex Storage 并写入 `dreamXMedia` 表（幂等，按 name 去重）

**Checkpoint**: `npx convex dev` 无 schema 错误，执行 `npx convex run dreamXSeeder:seedBuiltinMedia` 后 dreamXMedia 表有15条内置记录

---

## Phase 2: Foundational（后端核心 Mutations 更新）

**Purpose**: 更新 dreamXCanvas.ts 的 PIPELINE 和 Mutations，添加 TTS Action；阻塞所有前端用户故事

**⚠️ CRITICAL**: 所有前端节点组件依赖此阶段的后端接口

- [X] T004 更新 `convex/dreamXCanvas.ts`：将 `PIPELINE` 常量改为7节点顺序 `["mediaUpload","copywriting","memeRecall","storyboard","bgmRecall","ttsSelection","capcutBuild"]`，更新 `createProject` 初始 nodeStates（新增 `ttsSelection:{status:"locked"}`，`jianyingBuild` → `capcutBuild`），更新所有引用 `jianyingBuild` 的字段改为 `capcutBuild`
- [X] T005 更新 `convex/dreamXCanvas.ts` 中的 `completeBgmRecall` mutation：将解锁下一节点的副作用从 `jianyingBuild` 改为 `ttsSelection`
- [X] T006 在 `convex/dreamXCanvas.ts` 新增 `completeTTSSelection` mutation：接收 selectedVoiceType、selectedVoiceName、audioStorageId、audioUrl、audioDurationMs，更新 `ttsSelection` 为 completed，解锁 `capcutBuild`（参见 contracts/convex-api.md）
- [X] T007 在 `convex/dreamXCanvas.ts` 新增 `resetFromNode` mutation：接收 fromNodeKey，将该节点重置为 idle（清空数据字段），后续所有节点重置为 locked（清空数据字段），参见 contracts/convex-api.md 中完整实现规范
- [X] T008 在 `convex/dreamXAI.ts` 新增 `generateTTSAudio` action（`"use node"`）：调用豆包 TTS HTTP Chunked API（`https://openspeech.bytedance.com/api/v3/tts/unidirectional`），收集 chunked base64 音频数据，上传到 Convex Storage，返回 `{storageId, url, durationMs}`；使用环境变量 `DOUBAO_SOUND_APP_ID` 和 `DOUBAO_SOUND_API_KEY`，resource-id 使用 `seed-tts-2.0`（参见 quickstart.md Step 4 完整实现）
- [ ] T009 更新 `convex/dreamXAI.ts` 中的 `generateStoryboard` action：改为调用 Claude 生成分镜时间轴决策（参见 research.md 12.3 Prompt），LLM 返回 JSON 后算法计算绝对时间戳，结果写入 `storyboard.timeline`

**Checkpoint**: Convex Dashboard 中可手动测试所有新 mutation/action，`npx convex dev` 无类型错误

---

## Phase 3: User Story 1 - 端到端7节点工作流 (Priority: P1) 🎯 MVP

**Goal**: 用户可从素材上传到 CapCut ZIP 导出完成完整的7节点工作流，节点顺序正确解锁，已完成节点只读

**Independent Test**: 创建新 DreamX 项目，依次完成7个节点，验证可下载 CapCut ZIP 文件

### 实现 - 前端节点结构

- [X] T010 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/pipeline.config.ts`：定义 `PIPELINE_CONFIG` 数组（7个节点配置），每项含 `key、label、nodeType、load（动态import路径）、color（渐变颜色）`，参见 contracts/node-state-schema.md
- [X] T011 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/useAudioPreview.ts`：实现 `useAudioPreview()` hook，含 handleMouseEnter（300ms delay播放）、handleMouseLeave（立即停止），全局单例 audioRef 防多轨并播，含 useEffect cleanup，参见 contracts/convex-api.md

### 实现 - 提取现有节点为独立文件

- [X] T012 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/MediaUploadNode.tsx`：从 `DreamXPipelineNodes.tsx` 提取 `MediaUploadNode` 组件，适配新 `DXNodeData` props 接口（含 allNodeStates、isReadOnly、onReset），保留原有图片上传、AI分析逻辑，新增非图片文件前端拦截校验（MIME 类型检查）
- [X] T013 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/CopywritingNode.tsx`：从 `DreamXPipelineNodes.tsx` 提取 `CopywritingNode` 组件，适配新 props 接口，保留原有文案生成和展示逻辑，isReadOnly 时禁用所有交互控件
- [X] T014 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/MemeRecallNode.tsx`：从 `DreamXPipelineNodes.tsx` 提取 `MemeRecallNode` 组件，适配新 props 接口，新增空召回结果时显示「手动上传」+「跳过」CTA，isReadOnly 时禁用
- [X] T015 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/StoryboardNode.tsx`：从 `DreamXPipelineNodes.tsx` 提取 `StoryboardNode` 组件，适配新 props 接口，更新分镜生成调用 `generateStoryboard` action（现在使用 LLM），isReadOnly 时禁用
- [X] T016 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/BgmRecallNode.tsx`：从 `DreamXPipelineNodes.tsx` 提取 `BgmRecallNode` 组件，适配新 props 接口，新增空召回结果时显示「手动上传」+「跳过」CTA，isReadOnly 时禁用（悬停预览在 US2 阶段添加）
- [X] T017 [P] [US1] 新建 `app/components/dreamx-canvas/nodes/CapcutBuildNode.tsx`：从 `DreamXPipelineNodes.tsx` 中的 `JianyingBuildNode` 提取并重命名，将所有"剪映"文案改为"CapCut"，导入路径指引更新为 CapCut 路径（macOS: `~/Movies/CapCut/User Data/Projects/`），调用 `buildCapcutProject` action
- [X] T018 [US1] 新建 `app/components/dreamx-canvas/nodes/TTSSelectionNode.tsx`：实现 TTS 选择节点，进入 idle 时 fetch `/voices/voices.json` 并调用 `matchVoicesByEmotionTags`（基于 copywriting.emotionTags）推荐5个音色并存入 recommendedVoices，展示音色卡片（头像、名称、描述、gender badge），默认选第一个，「生成语音」按钮调用 `generateTTSAudio` action 后 `completeTTSSelection`，错误状态 + 重试，isReadOnly 时禁用（悬停预览在 US2 阶段添加）

### 实现 - 更新 DreamXCanvas

- [X] T019 [US1] 更新 `app/components/dreamx-canvas/DreamXCanvas.tsx`：使用 `pipeline.config.ts` 动态构建 `nodeTypes`（React.lazy + Suspense），更新 PIPELINE 为7节点，实现渐进式展示（`visibleNodeKeys = PIPELINE.filter(key => status !== "locked")`），删除原有静态 import 的节点组件，从 `allNodeStates` 为每个节点传递完整的 props（含 isReadOnly、onReset），注册 `resetFromNode` 处理函数
- [X] T020 [US1] 更新 `app/components/dreamx-canvas/DreamXCanvas.tsx`：将 `completeBgmRecall` 的调用更新为 `ttsSelection` 解锁逻辑，添加 `completeTTSSelection` 调用入口，将 `completeJianyingBuild` 相关引用改为 `completeCapcutBuild`/`buildCapcutProject`

**Checkpoint**: 完成7节点端到端流程，最终可下载 CapCut ZIP；已完成节点所有控件禁用

---

## Phase 4: User Story 2 - TTS 和 BGM 悬停预览 (Priority: P2)

**Goal**: TTS 音色列表和 BGM 列表均支持鼠标悬停300ms后自动播放，移开立即停止，不产生多轨叠加

**Independent Test**: 在 TTS 节点解锁后悬停音色测试播放；在 BGM 节点解锁后悬停BGM测试播放

### 实现

- [X] T021 [P] [US2] 更新 `app/components/dreamx-canvas/nodes/TTSSelectionNode.tsx`：引入 `useAudioPreview` hook，在每个音色卡片上绑定 `onMouseEnter(voice.sampleAudioUrl)` 和 `onMouseLeave`，当前播放的音色显示视觉反馈（如 pulse 动画或音波图标）
- [X] T022 [P] [US2] 更新 `app/components/dreamx-canvas/nodes/BgmRecallNode.tsx`：引入 `useAudioPreview` hook，在每个 BGM 列表项上绑定 `onMouseEnter(bgm.url)` 和 `onMouseLeave`，当前播放的 BGM 显示视觉反馈

**Checkpoint**: 悬停300ms后播放，鼠标快速切换时不产生多轨叠加

---

## Phase 5: User Story 3 - 画布自动聚焦当前节点 (Priority: P2)

**Goal**: 节点解锁时画布自动平滑动画聚焦到新节点，项目重新打开时自动聚焦到当前活跃节点

**Independent Test**: 完成任意节点后观察画布自动聚焦行为；刷新页面后观察恢复聚焦

### 实现

- [X] T023 [US3] 更新 `app/components/dreamx-canvas/DreamXCanvas.tsx`：添加自动聚焦逻辑：
  1. `useEffect` 监听 `visibleNodeKeys.length` 变化，新节点出现时调用 `setCenter` 聚焦（`{zoom:1.3, duration:800}`，延迟100ms等待布局）
  2. 项目首次加载时（isInitialized）延迟500ms聚焦到当前活跃节点（第一个 status === "idle" 或 "generating" 的节点），参见 contracts/node-state-schema.md 完整实现

**Checkpoint**: 节点解锁后800ms内画布平滑聚焦；刷新页面后自动聚焦到进行中的节点

---

## Phase 6: User Story 4 - 节点渐进式展示 (Priority: P3)

**Goal**: 画布中只存在非 locked 节点，locked 节点完全不在 React Flow nodes 数组中

**Independent Test**: 新项目进入画布，React Flow nodes 数组只有1个元素（mediaUpload）

### 实现

- [X] T024 [US4] 审查并验证 `app/components/dreamx-canvas/DreamXCanvas.tsx` 中 T019 实现的渐进式展示逻辑是否严格满足：nodes 数组只包含 `status !== "locked"` 的节点（不是 hidden，而是完全不存在），新增节点时带入正确的 `position`（参见 contracts/node-state-schema.md NODE_POSITIONS 定义），确保 edges 连线也只在可见节点间创建

**Checkpoint**: 新项目画布只有1个节点；进行到第4步时画布有4个节点；所有6个完成时有7个节点

---

## Phase 7: User Story 5 - 节点重置功能 (Priority: P3)

**Goal**: 用户可在已完成节点上触发重置，清空该节点及后续节点数据，画布移除已重置节点

**Independent Test**: 完成前3个节点后，在第2节点重置，第3-7节点从画布消失，第2节点变可编辑

### 实现

- [X] T025 [US5] 更新各节点组件（MediaUploadNode、CopywritingNode、MemeRecallNode、StoryboardNode、BgmRecallNode、TTSSelectionNode）：在 `isReadOnly` 状态下，节点标题栏 hover 时显示「重置到此节点」按钮（小图标），点击后调用 `onReset` 回调，`CapcutBuildNode` 不显示重置按钮（最后一个节点）
- [X] T026 [US5] 验证 `app/components/dreamx-canvas/DreamXCanvas.tsx` 中 T019 实现的 `resetFromNode` 处理函数逻辑：调用 `dreamXCanvas.resetFromNode` mutation → Convex 实时推送更新 → `visibleNodeKeys` 自动收缩 → 被重置节点变为 idle 可编辑

**Checkpoint**: 重置 memeRecall 后，storyboard/bgmRecall/ttsSelection/capcutBuild 从画布消失

---

## Phase 8: Polish（收尾与优化）

**Purpose**: 跨用户故事的体验优化、错误边界、UI 一致性

- [X] T027 [P] 清理 `app/components/dreamx-canvas/DreamXPipelineNodes.tsx`：将其内容迁移完毕后删除此文件（或保留空壳 re-export 过渡）
- [X] T028 [P] 审查所有7个节点组件，确保 `isReadOnly` 时所有 `<Button>`、`<Input>`、`<Slider>`、文件上传区均有 `disabled={isReadOnly}` 属性，每个节点标题区域显示绿色"已完成"徽章
- [X] T029 [P] 在 `app/components/dreamx-canvas/DreamXCanvas.tsx` 中添加首次加载时 Web Notification 权限请求（`Notification.requestPermission()`），以及 `capcutBuild.status === "completed"` 且页面不可见时触发浏览器通知
- [X] T030 运行 `npm run typecheck` 修复所有 TypeScript 类型错误
- [ ] T031 按照 quickstart.md 测试验收清单逐条验证所有功能点，确认端到端流程完整可用

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1（schema 需先更新）
- **Phase 3 (US1)**: 依赖 Phase 2（后端接口必须就绪）
- **Phase 4 (US2)**: 依赖 Phase 3（`useAudioPreview` hook 在 T011 已创建，节点在 T018/T016 已存在）
- **Phase 5 (US3)**: 依赖 Phase 3（DreamXCanvas 更新在 T019 完成）
- **Phase 6 (US4)**: 依赖 Phase 3（渐进式展示逻辑在 T019 实现，此阶段为验证）
- **Phase 7 (US5)**: 依赖 Phase 3（resetFromNode backend 在 T007，节点 onReset prop 在 T012-T018）
- **Phase 8 (Polish)**: 依赖所有功能 Phase 完成

### Parallel Opportunities Within Phase 3

```bash
# 以下任务可并行（不同文件）：
T010 pipeline.config.ts
T011 useAudioPreview.ts
T012 MediaUploadNode.tsx
T013 CopywritingNode.tsx
T014 MemeRecallNode.tsx
T015 StoryboardNode.tsx
T016 BgmRecallNode.tsx
T017 CapcutBuildNode.tsx
# T018 TTSSelectionNode.tsx（依赖 T011 useAudioPreview 完成）
# T019 DreamXCanvas.tsx 更新（依赖 T010-T018 完成）
```

### Parallel Opportunities Within Phase 4

```bash
T021 TTSSelectionNode 悬停预览（依赖 T011 完成）
T022 BgmRecallNode 悬停预览（依赖 T011 完成）
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup（T001-T003）
2. 完成 Phase 2: Foundational（T004-T009）**⚠️ 阻塞所有前端工作**
3. 完成 Phase 3: User Story 1（T010-T020）
4. **STOP 验证**: 端到端完成7节点，下载 CapCut ZIP
5. 部署/演示 MVP

### Incremental Delivery

1. Setup + Foundational → 后端就绪
2. User Story 1（T010-T020）→ 端到端流程可用 → 演示 MVP
3. User Story 2（T021-T022）→ 悬停预览 → 体验优化
4. User Story 3（T023）→ 画布自动聚焦 → 连贯性提升
5. User Story 4（T024）→ 渐进式展示验证 → 认知优化
6. User Story 5（T025-T026）→ 节点重置 → 容错能力
7. Polish（T027-T031）→ 上线

---

## Summary

| 阶段 | 任务数 | 关键产出 |
|------|--------|---------|
| Phase 1: Setup | 3 | schema 更新、capcutBuilder、seeder |
| Phase 2: Foundational | 6 | PIPELINE 更新、TTS action、storyboard LLM、resetFromNode |
| Phase 3: US1 (P1 MVP) | 11 | 7节点前端组件 + DreamXCanvas 更新 |
| Phase 4: US2 (P2) | 2 | BGM + TTS 悬停预览 |
| Phase 5: US3 (P2) | 1 | 画布自动聚焦 |
| Phase 6: US4 (P3) | 1 | 渐进式展示验证 |
| Phase 7: US5 (P3) | 2 | 节点重置 UI + 逻辑 |
| Phase 8: Polish | 5 | 清理、只读验证、通知、类型检查 |
| **Total** | **31** | |

**并行机会**: Phase 3 中 T010-T017 共8个任务可并行执行  
**MVP 范围**: Phase 1 + Phase 2 + Phase 3（共20个任务）  
**独立测试标准**: 每个 Phase 末尾的 Checkpoint 说明了验收条件
