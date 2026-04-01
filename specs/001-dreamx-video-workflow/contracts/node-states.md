# Node States 数据结构契约（修订版 v2）

**关联 Plan**: `specs/001-dreamx-video-workflow/plan.md`

---

## PIPELINE（最终确认，7节点）

```typescript
// convex/dreamXCanvas.ts
export const PIPELINE = [
  "mediaUpload",
  "copywriting",
  "memeRecall",
  "storyboard",
  "bgmRecall",
  "ttsSelection",
  "capcutBuild",
] as const;

export type DXNodeKey = typeof PIPELINE[number];

export type DXNodeStatus =
  | "locked"      // 前置未完成
  | "idle"        // 可操作
  | "generating"  // AI 生成中
  | "completed"   // 已确认
  | "error";      // 失败可重试
```

---

## 初始 nodeStates（createProject）

```typescript
{
  mediaUpload:  { status: "idle" },
  copywriting:  { status: "locked" },
  memeRecall:   { status: "locked" },
  storyboard:   { status: "locked" },
  bgmRecall:    { status: "locked" },
  ttsSelection: { status: "locked" },
  capcutBuild:  { status: "locked" },
}
```

---

## 动态节点编排

`dreamXPipelineConfig` 表存储可运行时修改的配置，前端通过 `useQuery(getPipelineConfig)` 实时订阅：

```typescript
// 前端 DreamXCanvas.tsx 中
const pipelineConfig = useQuery(api.dreamXCanvas.getPipelineConfig);
const pipeline = pipelineConfig?.pipeline ?? DEFAULT_PIPELINE;

// 节点组件动态加载（每个节点一个独立文件）
// app/components/dreamx-canvas/nodes/{NodeKey}Node.tsx
const NODE_COMPONENT_MAP: Record<DXNodeKey, React.LazyExoticComponent<any>> = {
  mediaUpload:  lazy(() => import("./nodes/MediaUploadNode")),
  copywriting:  lazy(() => import("./nodes/CopywritingNode")),
  memeRecall:   lazy(() => import("./nodes/MemeRecallNode")),
  storyboard:   lazy(() => import("./nodes/StoryboardNode")),
  bgmRecall:    lazy(() => import("./nodes/BgmRecallNode")),
  ttsSelection: lazy(() => import("./nodes/TtsSelectionNode")),
  capcutBuild:  lazy(() => import("./nodes/CapcutBuildNode")),
};

// buildNodes 只渲染 pipeline 中 status !== "locked" 的节点
const visibleNodeKeys = pipeline.filter(
  key => project.nodeStates[key]?.status !== "locked"
);
```

**运行时修改节点顺序**：直接在 Convex Dashboard 编辑 `dreamXPipelineConfig` 表中的 `pipeline` 数组，前端实时生效，无需重新部署。

---

## React Flow 节点类型注册

```typescript
// DX_NODE_TYPES（必须在组件外定义，避免 remount）
const DX_NODE_TYPES = Object.fromEntries(
  Object.entries(NODE_COMPONENT_MAP).map(([key, LazyNode]) => [
    `dx_${key}`,  // React Flow node type key
    ({ data }: { data: any }) => (
      <Suspense fallback={<NodeLoadingSkeleton />}>
        <LazyNode data={data} />
      </Suspense>
    ),
  ])
);
```

---

## 自动聚焦（当前活跃节点）

```typescript
function getActiveNodeKey(nodeStates: NodeStates, pipeline: DXNodeKey[]): DXNodeKey {
  return (
    pipeline.find(key => {
      const s = nodeStates[key]?.status;
      return s !== "completed" && s !== "locked";
    }) ?? pipeline[pipeline.length - 1]
  );
}

// useEffect 监听活跃节点变化
useEffect(() => {
  const activeKey = getActiveNodeKey(project.nodeStates, pipeline);
  const activeNodeId = `dx-node-${activeKey}`;
  // 延迟 100ms 等待节点渲染
  setTimeout(() => {
    reactFlowInstance.fitView({
      nodes: [{ id: activeNodeId }],
      duration: 800,
      padding: 0.3,
    });
  }, 100);
}, [currentActiveNodeKey]);
```

---

## 渐进式节点展示

```typescript
// buildNodes：只渲染可见节点（locked 节点不加入数组）
const rfNodes = visibleNodeKeys.map((key, idx) => ({
  id: `dx-node-${key}`,
  type: `dx_${key}`,
  position: { x: 0, y: idx * (NODE_HEIGHT + NODE_GAP_Y) },
  data: buildNodeData(key, project.nodeStates[key], project),
  draggable: false,
}));

// 连线（相邻可见节点之间）
const rfEdges = visibleNodeKeys.slice(0, -1).map((key, idx) => ({
  id: `e-${key}-${visibleNodeKeys[idx + 1]}`,
  source: `dx-node-${key}`,
  target: `dx-node-${visibleNodeKeys[idx + 1]}`,
  animated: project.nodeStates[visibleNodeKeys[idx + 1]]?.status === "idle",
}));
```

---

## 悬停预览（Meme / BGM / TTS 通用模式）

```typescript
// 共享 hook：useHoverAudio
function useHoverAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback((url: string) => {
    timerRef.current = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
    }, 300);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}
```

**各节点悬停预览 URL 来源**:
- `MemeRecallNode`: `dreamXMedia.url`（Convex Storage 永久 URL，GIF 展示用 `<img>`，无音频）
- `BgmRecallNode`: `dreamXMedia.url`（Convex Storage 永久 MP3 URL）
- `TtsSelectionNode`: `voices.json[i].sampleAudioUrl`（官方预览 URL，无需调用 TTS API）

---

## 已完成节点只读规则

所有 `status === "completed"` 节点：
- 所有 `<input>`, `<textarea>`, `<Button>` 操作类添加 `disabled` prop
- 文件 drop zone 设置 `noClick + noKeyboard + disabled`
- 节点顶部显示绿色 `<Badge>已完成</Badge>`
- 不调用任何 Convex mutation

---

## CapCut 命名对照表

| 旧名 | 新名 | 位置 |
|------|------|------|
| `jianyingBuild` | `capcutBuild` | nodeKey, PIPELINE |
| `JianyingBuildNode` | `CapcutBuildNode` | 组件文件名 |
| `convex/jianyingBuilder.ts` | `convex/capcutBuilder.ts` | 文件名 |
| `buildJianyingProject` | `buildCapcutProject` | action 名 |
| `dxJianyingBuild` | `dx_capcutBuild` | React Flow node type |
| UI「生成剪映工程」 | 「生成 CapCut 工程」 | 文案 |
