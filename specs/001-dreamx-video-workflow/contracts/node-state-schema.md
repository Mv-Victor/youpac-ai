# Node State Schema Contract: DreamX 工作流节点状态（v2）

**Branch**: `001-dreamx-video-workflow` | **Generated**: 2026-04-01

---

## 节点 ID 与 React Flow 映射

| nodeKey | React Flow node.id | 显示顺序 | 颜色梯度 |
|---------|-------------------|---------|---------|
| `mediaUpload` | `"mediaUpload"` | 1 | blue-indigo |
| `copywriting` | `"copywriting"` | 2 | violet-purple |
| `memeRecall` | `"memeRecall"` | 3 | pink-rose |
| `storyboard` | `"storyboard"` | 4 | amber-orange |
| `bgmRecall` | `"bgmRecall"` | 5 | teal-cyan |
| `ttsSelection` | `"ttsSelection"` | 6 | emerald-green（新增） |
| `capcutBuild` | `"capcutBuild"` | 7 | rose-red |

---

## 节点 Position 契约

垂直排列，固定 X=0，Y 间距 440px：

```typescript
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  mediaUpload:   { x: 0, y: 0 },
  copywriting:   { x: 0, y: 440 },
  memeRecall:    { x: 0, y: 880 },
  storyboard:    { x: 0, y: 1320 },
  bgmRecall:     { x: 0, y: 1760 },
  ttsSelection:  { x: 0, y: 2200 },
  capcutBuild:   { x: 0, y: 2640 },
};
```

---

## 动态编排配置契约

```typescript
// pipeline.config.ts
export interface NodePipelineConfig {
  key: string;
  label: string;
  nodeType: string;  // React Flow nodeTypes 的 key
  load: () => Promise<{ default: React.ComponentType<DXNodeData> }>;
  color: { from: string; to: string };  // Tailwind gradient classes
}

export const PIPELINE_CONFIG: NodePipelineConfig[] = [
  {
    key: "mediaUpload",
    label: "素材上传",
    nodeType: "mediaUploadNode",
    load: () => import("./MediaUploadNode"),
    color: { from: "from-blue-500", to: "to-indigo-600" },
  },
  // ... 以此类推
];

// 从配置推导 PIPELINE keys
export const PIPELINE = PIPELINE_CONFIG.map(c => c.key);
```

---

## 节点组件 Props 契约

每个节点组件通过 React Flow `data` prop 接收：

```typescript
interface DXNodeData {
  projectId: Id<"dreamXProjects">;
  nodeState: NodeStateByKey;     // 对应节点的 state
  allNodeStates: AllNodeStates;  // 全部节点状态（只读，用于跨节点引用）
  isReadOnly: boolean;           // status === "completed"
  onReset: () => void;           // 触发 resetFromNode
}
```

---

## 渐进式展示规则

```typescript
// DreamXCanvas.tsx 中
const visibleNodeKeys = useMemo(() => {
  return PIPELINE.filter(key => project.nodeStates[key]?.status !== "locked");
}, [project.nodeStates]);
```

渐进展示时机：
- 项目加载时：展示所有非 locked 节点
- 某节点完成时：Convex 实时推送 → 下一节点 status 从 locked → idle → 触发 visibleNodeKeys 更新 → 新节点加入 nodes 数组

---

## 画布自动聚焦触发条件

```typescript
// 触发条件 1: visibleNodeKeys 长度增加（新节点解锁）
useEffect(() => {
  if (visibleNodeKeys.length === 0) return;
  const latestKey = visibleNodeKeys[visibleNodeKeys.length - 1];
  const node = nodes.find(n => n.id === latestKey);
  if (!node) return;
  
  const timer = setTimeout(() => {
    setCenter(
      node.position.x + 200,  // 节点宽度约400，取中心
      node.position.y + 200,  // 节点高度约400，取中心
      { zoom: 1.3, duration: 800 }
    );
  }, 100);  // 等待 React Flow 完成节点渲染
  
  return () => clearTimeout(timer);
}, [visibleNodeKeys.length]);

// 触发条件 2: 项目首次加载（页面刷新后恢复）
useEffect(() => {
  if (!isInitialized || visibleNodeKeys.length === 0) return;
  const activeKey = visibleNodeKeys.find(
    key => project.nodeStates[key]?.status === "idle" || 
           project.nodeStates[key]?.status === "generating"
  ) ?? visibleNodeKeys[visibleNodeKeys.length - 1];
  
  // 延迟聚焦等待 React Flow 布局完成
  const timer = setTimeout(() => focusNode(activeKey), 500);
  return () => clearTimeout(timer);
}, [isInitialized]);
```

---

## 重置操作规则

`resetFromNode(fromNodeKey)` 后状态：

| 节点位置 | 重置后 status | 数据 |
|---------|-------------|------|
| fromNodeKey | `idle` | 清空所有字段（保留 status） |
| fromNodeKey + 1 | `locked` | 清空所有字段 |
| fromNodeKey + 2 ... | `locked` | 清空所有字段 |

重置后：
- fromNodeKey 之前节点保持不变
- 画布聚焦到 fromNodeKey 节点

---

## TTS 节点特殊规则

1. 节点进入 `idle` 时，前端立即调用 `matchVoicesByEmotionTags` 从 `voices.json` 中推荐5个音色
2. 推荐音色列表保存到 `ttsSelection.recommendedVoices`（调用 `updateNodeState`）
3. 用户悬停音色时播放 `sampleAudioUrl`（外部 URL，无需 Convex Storage）
4. 用户选择音色后，点击「生成语音」按钮 → 调用 `dreamXAI.generateTTSAudio`
5. 生成完成后调用 `completeTTSSelection`，节点完成，解锁 `capcutBuild`

---

## BGM 悬停预览规则

1. BGM 列表中每个选项支持 `onMouseEnter` / `onMouseLeave`
2. 使用 `useAudioPreview()` hook，延迟 300ms 播放，离开立即停止
3. BGM `url` 来自 `dreamXMedia` 表中的 Convex Storage URL（内置素材已上传）
4. 用户上传的 BGM 同样通过 Convex Storage URL 播放

---

## 文件上传规则（素材上传节点）

```typescript
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/heic", "image/heif"
]);

// 文件选择时校验
function validateImageFiles(files: File[]): { valid: File[]; errors: string[] } {
  const errors: string[] = [];
  const valid = files.filter(f => {
    if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
      errors.push(`${f.name} 不是图片格式`);
      return false;
    }
    return true;
  });
  return { valid, errors };
}
```
