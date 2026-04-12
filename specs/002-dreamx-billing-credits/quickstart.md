# Quickstart: DreamX 计费系统开发指南

**Feature**: 002-dreamx-billing-credits | **Date**: 2026-04-07

## 开发环境准备

```bash
# 确保在 001-dreamx-video-workflow 分支基础上
git checkout 002-dreamx-billing-credits

# 安装依赖（已有）
npm install

# 启动开发服务
npx convex dev   # 终端 1
npm run dev      # 终端 2
```

## 实现顺序（按依赖关系）

### Step 1: 更新 Convex Schema

文件：`convex/schema.ts`

新增 4 张表：`redeemCodes`、`userCredits`、`creditsTransactions`、`nodeCreditConfigs`

参考 `data-model.md` 中的完整表定义。

```bash
# 保存后 Convex 自动部署 schema 变更
```

### Step 2: 实现 Convex 后端函数

新建文件：`convex/credits.ts`

实现以下函数：
1. `getMyBalance` (query) — 获取余额
2. `getMyTransactions` (query) — 获取流水
3. `getAllNodeCreditConfigs` (query) — 获取节点配置
4. `redeemCode` (mutation) — 兑换码兑换
5. `deductCredits` (mutation) — 积分扣减
6. `seedNodeCreditConfigs` (mutation, internalMutation 或 HTTP 触发) — 初始化配置

### Step 3: 更新 HTTP 路由

文件：`convex/http.ts`

新增路由：
- `POST /admin/insert-redeem-codes` — 批量写入兑换码
- `POST /admin/seed-node-credit-configs` — 初始化节点配置

环境变量：在 Convex Dashboard 设置 `ADMIN_SECRET_KEY`

### Step 4: 更新 DreamX AI Actions（积分扣减集成）

文件：`convex/dreamXAI.ts`

对每个 LLM action 函数：
1. 在函数开始处查询余额，不足则抛 `ConvexError("INSUFFICIENT_CREDITS")`
2. LLM 调用成功后，调用 `ctx.runMutation(internal.credits.deductCredits, ...)`

涉及函数：`analyzeMediaBatch`、`generateMemeRecall`、`generateBgmRecall`、`generateStoryboard`、`generateTTSPerSegment`、`buildCapcutProject`

### Step 5: 创建前端 CreditsContext

新建文件：`app/contexts/CreditsContext.tsx`

```typescript
// 提供 balance 和 nodeCosts 给所有节点组件
export function CreditsProvider({ children }) { ... }
export function useCredits() { return useContext(CreditsContext); }
```

### Step 6: 创建 CreditsBadge 组件

新建文件：`app/components/credits/CreditsBadge.tsx`

显示格式：`<Badge>2 积分</Badge>`

集成到 6 个节点的 LLM 调用按钮上。

### Step 7: 创建兑换码页面

新建文件：`app/routes/dashboard/credits.tsx`

参考 `settings.tsx` 的布局样式，包含：
- 积分余额展示卡
- 兑换码输入表单（带格式校验）
- 积分流水列表

### Step 8: 更新侧边栏

文件：`app/components/dashboard/app-sidebar.tsx`

在 `navMain` 数组中添加「兑换码」入口，指向 `/dashboard/credits`。

### Step 9: 创建管理员脚本

新建文件：`scripts/generate-redeem-codes.mjs`

参考 `scripts/seed-media.mjs` 的模式，支持：
```bash
# 生成单种类型
node scripts/generate-redeem-codes.mjs --type trial --count 10
node scripts/generate-redeem-codes.mjs --type vip --count 10 --output codes-vip.txt

# 一次生成所有类型各 10 个（默认行为）
node scripts/generate-redeem-codes.mjs --all
```

**默认行为**（`--all`）：每种类型（trial/vip/svip）各生成 10 个，在控制台按类型分组展示，同时写入 `codes-{timestamp}.txt` 文件。

### Step 10: 在 CapcutBuildNode 中集成 CreditsProvider

文件：`app/components/dreamx-canvas/DreamXCanvas.tsx`（或根布局组件）

用 `<CreditsProvider>` 包裹画布组件。

## 环境变量

| 变量名 | 位置 | 用途 |
|--------|------|------|
| `ADMIN_SECRET_KEY` | Convex Dashboard | HTTP 管理接口鉴权 |
| `CONVEX_SITE_URL` | 本地 `.env` | 脚本调用 HTTP Action |

## 验证清单

```bash
# 1. 创建兑换码
node scripts/generate-redeem-codes.mjs --type trial --count 5

# 2. 在 /dashboard/credits 页面兑换，验证：
#    - 积分余额 +30
#    - 流水列表出现兑换记录

# 3. 在 DreamX 项目中点击"分析素材"：
#    - 按钮显示积分标签
#    - 操作成功后余额减少
#    - 流水列表出现消耗记录

# 4. 积分归零后点击按钮：
#    - 按钮 disabled
#    - Tooltip 提示积分不足
```
