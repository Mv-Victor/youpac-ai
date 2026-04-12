# Data Model: DreamX 计费系统 + AI 托管模式

**Phase**: 1 - Design  
**Feature Branch**: `002-dreamx-billing-credits`  
**Date**: 2026-04-07

---

## 1. Convex Schema Tables

### 1.1 `userCredits` - 用户积分账户

```typescript
userCredits: defineTable({
  userId: v.string(),           // Clerk identity.subject
  balance: v.number(),          // 当前积分余额（非负整数）
  totalRedeemed: v.number(),    // 累计兑换积分
  totalConsumed: v.number(),    // 累计消耗积分
  updatedAt: v.number(),        // 最后更新时间戳（ms）
}).index("by_userId", ["userId"])
```

**验证规则**:
- `balance >= 0` 始终成立（扣减前 pre-flight 检查）
- 1:1 映射 userId，每个用户唯一一条记录
- 记录不存在时视为余额为 0（懒创建）

**状态转换**:
```
不存在 → idle (首次兑换时自动创建，balance=初始兑换积分)
idle → 兑换成功: balance += redeemCode.credits
idle → 消耗成功: balance -= totalCost
```

---

### 1.2 `creditsTransactions` - 积分流水

```typescript
creditsTransactions: defineTable({
  userId: v.string(),
  type: v.union(v.literal("redeem"), v.literal("consume")),
  amount: v.number(),           // 正数（兑换）或负数（消耗）
  codeId: v.optional(v.id("redeemCodes")),   // type=redeem 时关联
  nodeType: v.optional(v.string()),           // type=consume 时：节点类型
  projectId: v.optional(v.id("dreamXProjects")),
  description: v.string(),      // 人类可读描述
  createdAt: v.number(),
}).index("by_userId_createdAt", ["userId", "createdAt"])
```

**字段说明**:
- `amount > 0`: 兑换（积分增加）
- `amount < 0`: 消耗（积分减少），如 `-2` 表示消耗 2 积分
- `description` 示例: "兑换VIP码 ABCD-XXXX-..." / "消耗积分：storyboard 节点"

---

### 1.3 `redeemCodes` - 兑换码

```typescript
redeemCodes: defineTable({
  code: v.string(),             // 16位纯大写字母+数字（无连字符，存储格式）
  type: v.union(
    v.literal("trial"),         // 体验版：30 积分
    v.literal("vip"),           // VIP：150 积分
    v.literal("svip"),          // SVIP：500 积分
  ),
  credits: v.number(),          // 对应积分值（30 / 150 / 500）
  isUsed: v.boolean(),
  usedBy: v.optional(v.string()),  // userId
  usedAt: v.optional(v.number()),  // 使用时间戳
  createdAt: v.number(),
}).index("by_code", ["code"])
  .index("by_isUsed", ["isUsed"])
```

**验证规则**:
- `code` 唯一索引确保全局唯一
- `isUsed = false` → 可兑换；`isUsed = true` → 已使用，不可再兑换
- 并发防重：在 Convex mutation 中读取 + 校验 + 更新在同一事务内（OCC 保证）

---

### 1.4 `nodeCreditConfigs` - 节点积分配置

```typescript
nodeCreditConfigs: defineTable({
  nodeType: v.string(),         // 节点类型标识符（与 pipeline.config.ts 对应）
  baseCost: v.number(),         // 基础积分消耗（非负整数）
  isEnabled: v.boolean(),       // 是否启用积分消耗（false=免费）
  updatedAt: v.number(),
}).index("by_nodeType", ["nodeType"])
```

**初始配置**（由 `seedNodeCreditConfigs` mutation 写入）:

| nodeType | baseCost | isEnabled |
|----------|---------|-----------|
| mediaUpload | 2 | true |
| memeRecall | 1 | false |
| bgmRecall | 1 | false |
| storyboard | 3 | true |
| ttsSelection | 2 | true |
| capcutBuild | 1 | true |

> memeRecall / bgmRecall 无实际 LLM 调用，初期设为不扣积分。

---

## 2. 前端状态模型

### 2.1 CreditsContext (扩展)

```typescript
interface CreditsContextValue {
  // 现有字段
  balance: number | undefined;
  nodeCosts: Record<string, number>;   // { mediaUpload: 2, storyboard: 3, ... }
  isLoading: boolean;
  
  // 新增：AI 托管模式
  autopilotEnabled: boolean;
  setAutopilotEnabled: (enabled: boolean) => void;
  autopilotError: string | null;       // 托管中断原因
  clearAutopilotError: () => void;
}
```

**存储位置**: React state（非持久化，刷新重置）

---

### 2.2 计费计算函数

```typescript
function calculateNodeCost(
  nodeType: string,
  imageCount: number,
  nodeCosts: Record<string, number>
): number {
  const baseCost = nodeCosts[nodeType] ?? 0;
  const imageBonus = imageCount > 0 ? Math.ceil(imageCount / 3) : 0;
  return baseCost + imageBonus;
}
```

---

## 3. 积分流程图

### 3.1 兑换流程

```
用户输入兑换码
    ↓
前端标准化（转大写，去连字符）
    ↓
调用 redeemCode mutation
    ↓ (在同一 Convex 事务内)
查询 redeemCodes by_code 索引
    ↓
校验：存在 && !isUsed
    ↓ (通过)
更新 redeemCodes: isUsed=true, usedBy, usedAt
    ↓
Upsert userCredits: balance += credits
    ↓
Insert creditsTransactions: type=redeem, amount=+credits
    ↓
返回成功 + 新余额
    ↓ (失败)
返回错误原因（不存在/已使用）
```

### 3.2 积分消耗流程

```
用户点击 LLM 操作按钮
    ↓
前端检查 balance >= cost（禁用状态已拦截）
    ↓
触发 Convex action（analyzeMediaBatch / generateStoryboard 等）
    ↓
action 内: checkBalanceInternal (query userId, 检查余额 >= cost)
    ↓ (不足)
抛出 ConvexError("INSUFFICIENT_CREDITS")
    ↓ (足够)
发起 LLM / TTS API 调用
    ↓ (失败)
返回错误，不扣积分
    ↓ (成功)
调用 deductCreditsInternal mutation (balance -= cost, 插入流水)
    ↓
返回成功结果
```

---

## 4. AI 托管模式状态机

```
autopilotEnabled = false (default)
    ↓ 用户点击开关
autopilotEnabled = true
    ↓ 监听所有节点状态
    
对每个处于 idle 状态的节点：
    └→ 自动触发对应操作（无需用户确认）
    
    error 状态 → autopilotEnabled = false（自动关闭，设置 autopilotError）
    
    capcutBuild 完成 → 流程结束，保持 autopilotEnabled = true
```

### 托管模式节点行为

```typescript
// 每个支持 autopilot 的节点添加此 useEffect
useEffect(() => {
  if (!autopilotEnabled) return;
  if (status !== "idle") return;
  
  // 自动触发该节点的默认操作
  handleAutopilotExecute();
}, [status, autopilotEnabled]);
```

---

## 5. 兑换码生成脚本接口

```typescript
// scripts/generate-redeem-codes.mjs
interface GenerateOptions {
  type: "trial" | "vip" | "svip";   // 兑换码类型
  count: number;                      // 生成数量
  output: string;                     // 输出文件路径（默认 ./codes-{type}-{date}.txt）
}

// 生成规则
// - 16位字符：A-Z + 0-9
// - 格式: XXXX-XXXX-XXXX-XXXX（文件中带连字符，数据库存储无连字符）
// - 唯一性：批内去重 + 调用 Convex API 写入时 by_code 唯一索引防冲突
```

---

## 6. 兑换码页面 UI 结构

```
/dashboard/credits
├── 积分余额卡片
│   ├── 当前余额（大号数字 + "积分"）
│   └── 子标题（累计兑换 / 累计消耗）
├── 兑换码输入区
│   ├── 输入框（placeholder: XXXX-XXXX-XXXX-XXXX）
│   └── 兑换按钮
└── 积分流水列表
    ├── 类型图标（+ 兑换 / - 消耗）
    ├── 积分数量
    ├── 描述
    └── 时间
```
