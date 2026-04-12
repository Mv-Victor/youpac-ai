# UI Contracts: DreamX 计费系统 + AI 托管模式

**Phase**: 1 - Design  
**Feature Branch**: `002-dreamx-billing-credits`

---

## 1. Convex API 接口契约

### 1.1 Queries

#### `credits.getMyBalance`
```typescript
// 输入: 无（从 Clerk auth 获取 userId）
// 输出:
interface BalanceResult {
  balance: number;
  totalRedeemed: number;
  totalConsumed: number;
}
// 不存在时返回: { balance: 0, totalRedeemed: 0, totalConsumed: 0 }
```

#### `credits.getMyTransactions`
```typescript
// 输入:
interface TransactionsArgs {
  limit?: number;   // 默认 20，最大 100
}
// 输出:
interface Transaction {
  _id: string;
  type: "redeem" | "consume";
  amount: number;   // 正数=兑换，负数=消耗
  description: string;
  createdAt: number;
}
type TransactionsResult = Transaction[];
```

#### `credits.getAllNodeCreditConfigs`
```typescript
// 输入: 无
// 输出:
interface NodeConfig {
  nodeType: string;
  baseCost: number;
  isEnabled: boolean;
}
type ConfigsResult = NodeConfig[];
```

### 1.2 Mutations

#### `credits.redeemCode`
```typescript
// 输入:
interface RedeemArgs {
  code: string;   // 支持带/不带连字符，大小写不敏感
}
// 成功输出:
interface RedeemSuccess {
  success: true;
  creditsAdded: number;
  newBalance: number;
  codeType: "trial" | "vip" | "svip";
}
// 错误（ConvexError）:
// - "CODE_NOT_FOUND": 兑换码不存在
// - "CODE_ALREADY_USED": 兑换码已使用
// - "INVALID_FORMAT": 格式错误
```

#### `credits.deductCredits`（前端可调用版本）
```typescript
// 输入:
interface DeductArgs {
  nodeType: string;
  imageCount?: number;   // 默认 0
  projectId: string;
  description: string;
}
// 成功输出:
interface DeductResult {
  success: true;
  deducted: number;
  newBalance: number;
}
// 错误（ConvexError）:
// - "INSUFFICIENT_CREDITS": 积分不足
```

---

## 2. React Context 契约

### 2.1 CreditsContext

```typescript
interface CreditsContextValue {
  balance: number | undefined;
  nodeCosts: Record<string, number>;
  isLoading: boolean;
  
  // AI 托管模式（新增）
  autopilotEnabled: boolean;
  setAutopilotEnabled: (enabled: boolean) => void;
  autopilotError: string | null;
  clearAutopilotError: () => void;
}
```

**Provider 位置**: `DreamXCanvas.tsx` 内层（`InnerDreamXCanvas` 外层）

---

## 3. 组件契约

### 3.1 `CreditsBadge`

```typescript
interface CreditsBadgeProps {
  nodeType: string;
  imageCount?: number;
}
// 渲染: <Badge>N 积分</Badge>
// 当 nodeCosts[nodeType] 不存在时不渲染
```

### 3.2 `AutopilotSwitch`

```typescript
// 无 props（从 CreditsContext 获取状态）
// 渲染: <Switch> + <Label>AI 托管</Label> + 错误提示 Toast
// 位置: DreamXCanvas 顶部工具栏右侧
```

### 3.3 `CreditsBalanceBadge`（Sidebar 显示）

```typescript
// 无 props（从 CreditsContext 获取）
// 渲染: <Badge variant="secondary">{balance} 积分</Badge>
// 位置: Dashboard 侧边栏底部或 Credits 导航项旁
```

---

## 4. 节点 Autopilot 接口约定

每个节点在 autopilot 模式下需实现 `handleAutopilotExecute` 函数：

```typescript
// MediaUploadNode
async function handleAutopilotExecute() {
  // 前提: images.length > 0 && eventDescription.length > 0
  // 行为: 触发分析，分析完成后自动 confirmAnalysis
}

// MemeRecallNode
async function handleAutopilotExecute() {
  // 前提: suggestedMemes.length > 0
  // 行为: 自动选择前 min(3, suggestedMemes.length) 个 meme，确认
}

// BgmRecallNode
async function handleAutopilotExecute() {
  // 前提: suggestedBgms.length > 0
  // 行为: 自动选第一个 BGM（或 skip），确认
}

// StoryboardNode
async function handleAutopilotExecute() {
  // 前提: status === "idle"（已有 auto-trigger 逻辑）
  // 行为: 等待 generating → completed，然后自动 completeStoryboard
}

// TTSSelectionNode
async function handleAutopilotExecute() {
  // 前提: recommendedVoices.length > 0
  // 行为: 选第一个推荐声音，触发 TTS 生成
}

// CapcutBuildNode
async function handleAutopilotExecute() {
  // 前提: 无
  // 行为: 直接触发 buildCapcutProject
}
```

**错误处理约定**: 任何节点的 autopilot 执行遇到 error 时，调用 `setAutopilotEnabled(false)` 并设置 `autopilotError` 原因字符串。
