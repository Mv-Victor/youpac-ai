# Implementation Plan: DreamX AI 营销视频自动化生成工作流

**Branch**: `001-dreamx-video-workflow` | **Date**: 2026-04-01 | **Spec**: [spec.md](./spec.md)

## Summary

在 youpac-ai 项目中，基于现有 React Flow 画布基础设施，实现 DreamX 七节点顺序解锁工作流：**素材上传 → 文案生产 → 表情包召回 → 分镜脚本 → BGM 召回 → TTS 选择 → CapCut 成片**。关键设计决策：

1. **TTS**：使用豆包 TTS API（火山引擎），从 `voices.json` 中按情绪标签召回最匹配的 5 个音色，默认选第一个；悬停预览直接播放 `sampleAudioUrl`（外部 URL，无需上传到 Convex）
2. **节点动态编排**：节点实现完全分离，每个节点独立文件，通过配置驱动动态 import，修改配置无需部署
3. **素材**：内置表情包（cat_shocked、cat_crying、white_cat）和 BGM（happy、funny、motivational）先上传到 Convex Storage，再通过 URL 使用
4. **成片节点**：v1 仅做 CapCut ZIP 导出，视频预览作为 v2 不实现
5. **BGM 召回**：支持鼠标悬停预览播放
6. **命名**：所有"jianying"相关命名统一替换为"capcut"
7. **UI 参考**：节点组件实现参考 `app/components/canvas/ThumbnailUploadModal.tsx` 等已有设计

## Technical Context

**Language/Version**: TypeScript 5.x, React 19  
**Primary Dependencies**: @xyflow/react, Convex, shadcn/ui (Radix UI), TailwindCSS v4, Framer Motion, Clerk  
**TTS Provider**: 豆包 TTS API（火山引擎 `openspeech.bytedance.com/api/v3/tts/unidirectional`），HTTP Chunked 格式；配置变量 `DOUBAO_SOUND_APP_ID`, `DOUBAO_SOUND_API_KEY`  
**Voice Config**: `public/voices/voices.json`（10个音色，全部为豆包语音合成模型2.0）  
**Storage**: Convex Storage（图片、BGM 文件、TTS 音频）; Convex 数据库（`dreamXProjects`, `dreamXMedia`）  
**Testing**: 无自动化测试框架（人工验收场景测试）  
**Target Platform**: Web（Chrome/Safari），SSR via React Router v7  
**Project Type**: Web 全栈应用（React Router v7 + Convex backend）  
**Performance Goals**: 画布聚焦动画 800ms 内完成；TTS 悬停预览直接播放外部 URL < 300ms；素材分析 < 30s（10张图）；项目恢复 < 2s  
**Constraints**: SSR 兼容（浏览器 API 必须动态 import）；节点动态 import 要求每个节点文件独立；v1 不实现视频预览  
**Scale/Scope**: 单用户独立项目，无并发编辑，7个节点，图片最多10张

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Convex-First Backend | PASS | 豆包 TTS API 调用通过 Convex action（`"use node"`）执行；状态持久化通过 Convex mutation |
| II | Schema-Driven Data Modeling | PASS* | 需在 schema.ts 中补充/调整 `dreamXProjects` 表，新增 ttsSelection 节点，调整7节点顺序 |
| III | Client-Side AI Orchestration | PASS | DreamXCanvas 前端负责 AI 调用编排，Convex action 无状态返回内容 |
| IV | SSR Compatibility | PASS | 节点组件通过动态 import 隔离，Audio 播放在 useEffect 中执行 |
| V | Secure Credential Management | PASS | `DOUBAO_SOUND_APP_ID` / `DOUBAO_SOUND_API_KEY` 存于 Convex 环境变量 |
| VI | Simplicity and YAGNI | PASS | 复用 dreamXMedia、dreamXCanvas 现有接口；TTS 悬停直接播外部 URL，无需生成试听文件 |
| VII | Incremental Delivery by User Story | PASS | P1：7节点核心流程；P2：BGM+TTS 悬停预览；P3：画布自动聚焦+渐进展示 |

**Schema 变更摘要**：
- 现有 `nodeStates` 字段调整：将 `copywriting`（原有）重命名含义（保留逻辑），调整节点顺序为 mediaUpload → copywriting → memeRecall → storyboard → bgmRecall → ttsSelection → capcutBuild
- 新增 `ttsSelection` 节点嵌套结构
- `jianyingBuild` 表内字段/函数名全部重命名为 `capcutBuild`
- 新增 `bgmRecall.skipped` 字段（已有但需确认）

## Project Structure

### Documentation (this feature)

```text
specs/001-dreamx-video-workflow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── convex-api.md
│   └── node-state-schema.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
public/
└── voices/
    └── voices.json                   # 已存在，TTS 音色配置（10个豆包2.0音色）

convex/
├── schema.ts                         # 修改：调整 dreamXProjects.nodeStates 结构
├── dreamXCanvas.ts                   # 修改：PIPELINE 顺序 + capcut 重命名 + TTS/重置 mutations
├── dreamXAI.ts                       # 修改：新增 generateTTSAudio action（豆包 HTTP Chunked）
├── dreamXMedia.ts                    # 不变（复用现有接口）
├── capcutBuilder.ts                  # 重命名自 jianyingBuilder.ts（保留核心逻辑）
└── dreamXSeeder.ts                   # 新增：内置素材初始化脚本（上传表情包+BGM到Convex）

app/
├── routes/dashboard/
│   └── dreamx.$projectId.tsx         # 已存在，路由入口
└── components/dreamx-canvas/
    ├── DreamXCanvas.tsx               # 修改：7节点顺序、动态编排、自动聚焦、节点重置
    ├── DreamXPipelineNodes.tsx        # 移除（拆分为独立节点文件）
    └── nodes/                         # 新增：节点动态编排目录
        ├── pipeline.config.ts         # 节点编排配置（动态 import 路径）
        ├── MediaUploadNode.tsx        # 节点 1
        ├── CopywritingNode.tsx        # 节点 2
        ├── MemeRecallNode.tsx         # 节点 3
        ├── StoryboardNode.tsx         # 节点 4
        ├── BgmRecallNode.tsx          # 节点 5（支持悬停预览）
        ├── TTSSelectionNode.tsx       # 节点 6（支持悬停预览）
        └── CapcutBuildNode.tsx        # 节点 7（ZIP 导出）
```

**Structure Decision**: 单项目全栈 Web 应用，延续现有目录结构，节点拆分为独立文件实现动态编排。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| 节点顺序变更（7节点，需 schema 迁移） | spec 要求7节点顺序与现有6节点顺序不同，新增 ttsSelection，移除原有 jianyingBuild→capcutBuild | 无法在不改 schema 的情况下满足新顺序和新节点需求 |
| 节点动态 import 编排 | 用户需要修改节点顺序/内容无需重新部署 | 静态 import 每次修改都要上线，不满足"实时生效"需求 |
| jianyingBuilder 重命名为 capcutBuilder | 产品要求统一使用英文名称 capcut | 保留 jianying 命名会造成品牌混乱 |
