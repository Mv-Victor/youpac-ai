# Convex API Contracts: DreamX 工作流（v2）

**Branch**: `001-dreamx-video-workflow` | **Generated**: 2026-04-01

---

## Mutations（写接口）

### `dreamXCanvas.createProject`
**修改**: 初始 nodeStates 更新为7节点结构

```typescript
createProject: mutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  returns: v.id("dreamXProjects"),
  // 初始 nodeStates:
  //   mediaUpload: idle
  //   copywriting/memeRecall/storyboard/bgmRecall/ttsSelection/capcutBuild: locked
})
```

### `dreamXCanvas.completeBgmRecall`
**修改**: 副作用改为解锁 `ttsSelection`（原来解锁 `jianyingBuild`/`capcutBuild`）

```typescript
completeBgmRecall: mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    selectedBgm: v.optional(v.object({
      url: v.string(), name: v.string(),
      durationMs: v.optional(v.number()), volume: v.number(),
      storageId: v.optional(v.id("_storage")),
    })),
    skipped: v.optional(v.boolean()),
  },
  returns: v.null(),
  // 副作用: ttsSelection.status = "idle"（变更点！原为 jianyingBuild）
})
```

### `dreamXCanvas.completeTTSSelection`
**新增**

```typescript
completeTTSSelection: mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    selectedVoiceType: v.string(),
    selectedVoiceName: v.string(),
    audioStorageId: v.id("_storage"),
    audioUrl: v.string(),
    audioDurationMs: v.number(),
  },
  returns: v.null(),
  // 副作用: capcutBuild.status = "idle"
})
```

### `dreamXCanvas.resetFromNode`
**新增**

```typescript
resetFromNode: mutation({
  args: {
    projectId: v.id("dreamXProjects"),
    fromNodeKey: v.union(
      v.literal("mediaUpload"), v.literal("copywriting"),
      v.literal("memeRecall"), v.literal("storyboard"),
      v.literal("bgmRecall"), v.literal("ttsSelection"),
      v.literal("capcutBuild"),
    ),
  },
  returns: v.null(),
  // fromNodeKey → idle（清空 status 外所有字段）
  // 后续节点 → locked（清空所有字段）
})
```

---

## Actions（外部 API 调用）

### `dreamXAI.generateTTSAudio`
**新增**，豆包 TTS HTTP Chunked API

```typescript
generateTTSAudio: action({
  "use node";  // 需要 Node.js fetch + Buffer
  args: {
    projectId: v.id("dreamXProjects"),
    voiceType: v.string(),   // EX: "zh_female_vv_uranus_bigtts"
    text: v.string(),        // 来自 copywriting.script 拼接文本
  },
  returns: v.object({
    storageId: v.id("_storage"),
    url: v.string(),
    durationMs: v.number(),
  }),
  // 内部逻辑:
  //   1. POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
  //   2. Headers: X-Api-App-Id, X-Api-Access-Key, X-Api-Resource-Id=seed-tts-2.0
  //   3. Body: { user: { uid }, req_params: { text, speaker: voiceType, audio_params: { format: "mp3", sample_rate: 24000 } } }
  //   4. 读取 Chunked 响应，收集所有 base64 data chunk（code=0 且 data!=null）
  //   5. 拼接 base64 → Buffer → Blob → ctx.storage.store()
  //   6. 获取 URL，估算时长（Buffer.length / 3000 * 1000 ms，粗估 mp3 128kbps）
  //   7. 更新 ttsSelection.status = "generating" → 调用完成后前端调用 completeTTSSelection
})
```

### `dreamXAI.analyzeMediaBatch`
**已存在，不变**

### `dreamXAI.generateCopywriting`
**已存在，不变**

### `dreamXAI.generateStoryboard`
**微调**: 若 `ttsSelection.audioDurationMs` 存在，用于调整时间轴总时长

### `capcutBuilder.buildCapcutProject`
**重命名自 `jianyingBuilder.buildJianyingProject`**，逻辑不变

```typescript
buildCapcutProject: action({
  args: { projectId: v.id("dreamXProjects") },
  returns: v.object({
    storageId: v.id("_storage"),
    downloadUrl: v.string(),
    projectName: v.string(),
  }),
  // 读取 capcutBuild（原 jianyingBuild）字段
  // 生成 draft_info.json + draft_meta_info.json → ZIP
})
```

---

## 媒体查询接口（已存在，不变）

```typescript
dreamXMedia.getSuggestedMemes(emotionTags): MediaAsset[]
dreamXMedia.getSuggestedBgms(emotionTags): MediaAsset[]
dreamXMedia.addUserMedia(type, url, name, mood, storageId): Id
```

---

## Seeder（新增）

### `dreamXSeeder.seedBuiltinMedia`
**新增 internal mutation**，仅在开发/初始化时执行

```typescript
seedBuiltinMedia: internalMutation({
  args: {
    mediaBasePath: v.string(),  // 本地文件路径前缀（仅开发环境）
  },
  // 从本地文件路径读取表情包和 BGM
  // 上传到 Convex Storage
  // 写入 dreamXMedia 表（isBuiltin: true）
  // 已存在则跳过（幂等）
})
```

**执行命令**:
```bash
npx convex run dreamXSeeder:seedBuiltinMedia '{"mediaBasePath": "/Users/huangzhidong/work/dreamX/doc"}'
```

---

## 前端 API（非 Convex）

### `matchVoicesByEmotionTags(emotionTags, voices, count?) → Voice[]`
**纯函数，前端使用**

```typescript
// app/components/dreamx-canvas/nodes/TTSSelectionNode.tsx 内

function matchVoicesByEmotionTags(
  emotionTags: string[],
  voices: Voice[],
  count = 5
): Voice[] {
  if (!emotionTags.length) return voices.slice(0, count);
  
  const priority: Record<string, string[]> = {
    搞笑: ["zh_female_xiaohe_uranus_bigtts", "zh_male_shaonianzixin_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
    震惊: ["zh_female_xiaohe_uranus_bigtts", "zh_male_m191_uranus_bigtts"],
    励志: ["zh_male_m191_uranus_bigtts", "zh_male_taocheng_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
    伤感: ["zh_female_vv_uranus_bigtts", "zh_female_meilinvyou_uranus_bigtts"],
    日常: ["zh_female_vv_uranus_bigtts", "zh_female_xiaohe_uranus_bigtts", "zh_male_taocheng_uranus_bigtts"],
    可爱: ["zh_female_cancan_mars_bigtts", "zh_female_xiaohe_uranus_bigtts"],
    委屈: ["zh_female_vv_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
    愤怒: ["zh_male_m191_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
  };
  
  const scores = new Map<string, number>();
  voices.forEach(v => scores.set(v.voiceType, 0));
  
  emotionTags.forEach(tag => {
    (priority[tag] || []).forEach((voiceType, idx) => {
      scores.set(voiceType, (scores.get(voiceType) ?? 0) + (3 - idx));
    });
  });
  
  return voices
    .sort((a, b) => (scores.get(b.voiceType) ?? 0) - (scores.get(a.voiceType) ?? 0))
    .slice(0, count);
}
```

### `useAudioPreview() hook`
**共享 hook，BGM 节点和 TTS 节点共用**

```typescript
// app/components/dreamx-canvas/nodes/useAudioPreview.ts
export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback((url: string) => {
    timerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      audioRef.current = new Audio(url);
      audioRef.current.play().catch(() => {});
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    audioRef.current?.pause();
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}
```
