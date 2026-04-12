# Implementation Plan: DreamX 站内计费 + AI 托管模式

**Branch**: `002-dreamx-billing-credits` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-dreamx-billing-credits/spec.md`

## Summary

为 DreamX 视频工作流添加站内积分计费系统与 AI 托管模式。积分系统包括：管理员离线批量生成兑换码（30/150/500 积分三档）、用户在 Dashboard 侧边栏兑换积分、工作流节点按钮显示积分消耗标签、LLM 调用成功后原子性扣减积分。AI 托管模式新增于 Dashboard Canvas 页面右上角，开启后节点一路自动执行、跳过用户确认，直至最终导出剪映工程文件（或遇错中断）。

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+  
**Primary Dependencies**: React Router v7 (SSR), Convex (backend), shadcn/ui + TailwindCSS v4, @xyflow/react, Clerk  
**Storage**: Convex Database（userCredits, creditsTransactions, redeemCodes, nodeCreditConfigs 表已在 schema.ts 中定义）  
**Testing**: 手动验收测试（项目未发现自动化测试框架）  
**Target Platform**: Web（SSR + Client hybrid, React Router v7）  
**Project Type**: Web application（全栈，Convex 后端 + React 前端）  
**Performance Goals**: 兑换响应 < 2s，积分余额更新实时（Convex reactive query）  
**Constraints**: 不引入新依赖；保持 SSR 兼容性（动态 import 隔离 Canvas 相关内容）  
**Scale/Scope**: 单用户积分账户，节点 6 种，兑换码三档

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Convex-First Backend | PASS | credits.ts / dreamXAI.ts 全部在 Convex 中，无其他后端 |
| II | Schema-Driven Data Modeling | PASS | 所有新表（userCredits, creditsTransactions, redeemCodes, nodeCreditConfigs）已在 convex/schema.ts 定义 |
| III | Client-Side AI Orchestration | PASS | autopilot 逻辑在 Canvas 前端，Convex actions 仍为无状态 |
| IV | SSR Compatibility | PASS | DreamXCanvas 已通过 dynamic import 隔离，autopilot switch 在 Canvas 内部 |
| V | Secure Credential Management | PASS | 无新 API key；兑换码存 Convex DB 而非前端代码 |
| VI | Simplicity and YAGNI | PASS | autopilotEnabled 用 React state（非持久化），CreditsContext 扩展而非新建 |
| VII | Incremental Delivery by User Story | PASS | P1（兑换）→ P2（节点消耗）→ P3（脚本）→ P4（托管模式）独立可交付 |

**Constitution Check Result**: PASS - No violations.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-dreamx-billing-credits/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api-contracts.md # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code Layout

```text
# Frontend - 积分 UI
app/
├── components/
│   ├── credits/
│   │   ├── CreditsBadge.tsx          # 节点按钮旁积分消耗标签
│   │   ├── CreditsBalanceBadge.tsx   # Sidebar 余额徽章
│   │   └── RedeemCodeForm.tsx        # 兑换码输入表单
│   └── dreamx-canvas/
│       ├── DreamXCanvas.tsx          # 扩展: CreditsContext 增加 autopilot 状态
│       ├── AutopilotSwitch.tsx       # (新) AI 托管模式开关组件
│       └── nodes/
│           ├── MediaUploadNode.tsx   # 增加 autopilot useEffect + CreditsBadge
│           ├── MemeRecallNode.tsx    # 增加 autopilot useEffect + CreditsBadge
│           ├── BgmRecallNode.tsx     # 增加 autopilot useEffect + CreditsBadge
│           ├── StoryboardNode.tsx    # 增加 autopilot completeStoryboard + CreditsBadge
│           ├── TTSSelectionNode.tsx  # 增加 autopilot useEffect + CreditsBadge
│           └── CapcutBuildNode.tsx   # 增加 autopilot useEffect + CreditsBadge
├── contexts/
│   └── CreditsContext.tsx            # 扩展: 增加 autopilotEnabled, setAutopilotEnabled
└── routes/
    └── dashboard/
        └── credits.tsx               # 兑换码页面（余额 + 兑换 + 流水）

# Backend - Convex
convex/
├── schema.ts                         # userCredits / creditsTransactions / redeemCodes / nodeCreditConfigs（已定义）
└── credits.ts                        # redeemCode / deductCredits / getMyBalance / getMyTransactions 等

# Admin Script
scripts/
└── generate-redeem-codes.mjs         # 批量生成兑换码脚本（已有）
```

**Structure Decision**: Web application，前端 app/ + 后端 convex/，无额外项目层。

---

## Complexity Tracking

> No constitution violations detected. Table intentionally empty.
