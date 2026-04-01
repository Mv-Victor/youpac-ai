# Quickstart: DreamX 工作流实现指南（v2）

**Branch**: `001-dreamx-video-workflow` | **Generated**: 2026-04-01

## 实现顺序（8步）

---

### Step 1: Schema 更新

**文件**: `convex/schema.ts`

1. 添加/更新 `dreamXProjects` 表定义（参见 `data-model.md`）
2. 关键变更：
   - `jianyingBuild` → `capcutBuild`
   - 新增 `ttsSelection` 节点字段（在 `bgmRecall` 之后）
3. 确认 `dreamXMedia` 表定义存在

```bash
npx convex dev  # 确认无 schema 错误
```

---

### Step 2: 内置素材 Seeder

**文件**: `convex/dreamXSeeder.ts`（新增）

1. 创建 `seedBuiltinMedia` internal mutation
2. 读取本地文件路径（action 使用 `"use node"` 读取 fs）
3. 上传到 Convex Storage
4. 写入 `dreamXMedia` 表

```bash
# 执行 seeder 初始化内置素材
npx convex run dreamXSeeder:seedBuiltinMedia
```

**内置素材清单**（参见 `data-model.md`）:
- 表情包: cat_shocked(3张) + cat_crying(2张) + white_cat(3张) = 8张
- BGM: happy(3首) + funny(3首) + motivational(1首) = 7首

---

### Step 3: 后端 - 更新 dreamXCanvas.ts

**文件**: `convex/dreamXCanvas.ts`

1. 更新 `PIPELINE` 常量为7节点
2. 更新 `createProject` 初始 nodeStates（新增 `ttsSelection: { status: "locked" }`, 重命名 `capcutBuild`）
3. 更新 `completeBgmRecall`：解锁目标从 `jianyingBuild` → `ttsSelection`
4. 新增 `completeTTSSelection` mutation（解锁 `capcutBuild`）
5. 新增 `resetFromNode` mutation
6. 将 `jianyingBuild` 相关字段/函数重命名为 `capcutBuild`

---

### Step 4: 后端 - 豆包 TTS Action

**文件**: `convex/dreamXAI.ts`

```typescript
"use node";

export const generateTTSAudio = action({
  args: {
    projectId: v.id("dreamXProjects"),
    voiceType: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { projectId, voiceType, text }) => {
    const appId = process.env.DOUBAO_SOUND_APP_ID!;
    const apiKey = process.env.DOUBAO_SOUND_API_KEY!;
    
    const response = await fetch(
      "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-App-Id": appId,
          "X-Api-Access-Key": apiKey,
          "X-Api-Resource-Id": "seed-tts-2.0",
        },
        body: JSON.stringify({
          user: { uid: projectId },
          req_params: {
            text,
            speaker: voiceType,
            audio_params: { format: "mp3", sample_rate: 24000 },
          },
        }),
      }
    );
    
    // 收集 chunked 响应
    const reader = response.body!.getReader();
    const audioChunks: string[] = [];
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.code === 0 && parsed.data) {
            audioChunks.push(parsed.data);
          }
        } catch {}
      }
    }
    
    // 拼接 base64 → Buffer → Blob → Storage
    const audioBase64 = audioChunks.join("");
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const blob = new Blob([audioBuffer], { type: "audio/mp3" });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    
    // 粗估时长（mp3 128kbps）
    const durationMs = Math.round((audioBuffer.length / 16000) * 1000);
    
    return { storageId, url: url!, durationMs };
  },
});
```

**Convex 环境变量配置**:
```
DOUBAO_SOUND_APP_ID = {火山引擎控制台 APP ID}
DOUBAO_SOUND_API_KEY = {火山引擎控制台 Access Token}
```

---

### Step 5: 后端 - 重命名 jianyingBuilder → capcutBuilder

**操作**:
1. 复制 `convex/jianyingBuilder.ts` → `convex/capcutBuilder.ts`
2. 重命名内部函数：`buildJianyingProject` → `buildCapcutProject`
3. 读取 `capcutBuild` 字段（原 `jianyingBuild`）
4. 保留原 `jianyingBuilder.ts`（或删除，视迁移需要）

---

### Step 6: 前端 - 节点动态编排结构

**新建目录**: `app/components/dreamx-canvas/nodes/`

**文件结构**:
```
nodes/
├── pipeline.config.ts      # 节点编排配置
├── useAudioPreview.ts      # BGM/TTS 共用悬停预览 hook
├── MediaUploadNode.tsx     # 从现有 DreamXPipelineNodes 提取
├── CopywritingNode.tsx     # 从现有 DreamXPipelineNodes 提取
├── MemeRecallNode.tsx      # 从现有 DreamXPipelineNodes 提取
├── StoryboardNode.tsx      # 从现有 DreamXPipelineNodes 提取
├── BgmRecallNode.tsx       # 从现有 DreamXPipelineNodes 提取 + 新增悬停预览
├── TTSSelectionNode.tsx    # 新增
└── CapcutBuildNode.tsx     # 从现有 JianyingBuildNode 重命名
```

**pipeline.config.ts 结构**（参见 `contracts/node-state-schema.md`）

---

### Step 7: 前端 - 更新 DreamXCanvas.tsx

1. 更新 PIPELINE 为7节点顺序
2. 使用 `pipeline.config.ts` 动态构建 `nodeTypes`
3. 实现渐进式展示（只展示非 locked 节点）
4. 实现画布自动聚焦（`useEffect` 监听 `visibleNodeKeys.length`）
5. 实现 `resetFromNode` 处理函数

---

### Step 8: 前端 - 新增/修改节点组件

**TTSSelectionNode.tsx**（新增，参考 BgmRecallNode 结构）:
- 加载 `voices.json`（`fetch("/voices/voices.json")`）
- 进入 idle 时调用 `matchVoicesByEmotionTags` 推荐5个音色，存入 `recommendedVoices`
- 音色卡片展示：头像、名称、描述、gender badge
- 悬停预览：`useAudioPreview()` + `sampleAudioUrl`
- 默认选中第一个音色
- 「生成语音」按钮 → 调用 `dreamXAI.generateTTSAudio` → `completeTTSSelection`
- 错误状态 + 重试按钮
- isReadOnly 时禁用所有交互

**BgmRecallNode.tsx**（更新，新增悬停预览）:
- 引入 `useAudioPreview()` hook
- BGM 列表项上绑定 `onMouseEnter/Leave`
- 空召回结果：显示「手动上传」+ 「跳过」CTA

**CapcutBuildNode.tsx**（重命名自 JianyingBuildNode）:
- UI 文案："CapCut 工程" 替换 "剪映工程"
- 导入路径更新为 macOS/Windows 的 CapCut 路径

---

## 环境变量检查清单

在 Convex Dashboard 配置：

| 变量名 | 用途 | 必须 |
|--------|------|------|
| `DOUBAO_SOUND_APP_ID` | 豆包 TTS App ID | 是 |
| `DOUBAO_SOUND_API_KEY` | 豆包 TTS Access Key | 是 |
| `ANTHROPIC_API_KEY` | 图片分析 + 文案生成 | 是 |

---

## UI 参考对照

| 功能 | 参考文件 |
|------|---------|
| 文件拖放上传 | `app/components/canvas/ThumbnailUploadModal.tsx` |
| 进度指示 | `app/components/canvas/` 内 loading 组件 |
| 节点卡片布局 | `app/components/dreamx-canvas/DreamXPipelineNodes.tsx` 中 `DXNodeBase` |
| 音量 Slider | shadcn `Slider` 组件 |
| 悬停音频预览 | 新增 `useAudioPreview` hook |

---

## 测试验收清单

- [ ] Step 1: `npx convex dev` 无 schema 错误
- [ ] Step 2: seeder 执行后 `dreamXMedia` 表有8个表情包+7个BGM
- [ ] Step 6: 创建新项目 → 只显示 mediaUpload 节点
- [ ] Step 6: 完成 mediaUpload → copywriting 节点出现，画布自动聚焦
- [ ] Step 8: BGM 节点悬停 → 300ms 后播放，移开停止，不多轨并播
- [ ] Step 8: TTS 节点悬停 → 300ms 后播放 sampleAudioUrl，移开停止
- [ ] Step 8: TTS 生成完整语音 → Convex Storage 有 MP3 文件
- [ ] Step 8: CapCut 导出 ZIP → 文件可被剪映/CapCut 正确导入
- [ ] 完成全部7节点 → 所有节点只读，无法编辑
- [ ] 重置 memeRecall → storyboard/bgmRecall/ttsSelection/capcutBuild 从画布消失
