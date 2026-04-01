# Research: DreamX AI 营销视频自动化生成工作流（v2）

**Generated**: 2026-04-01 | **Branch**: `001-dreamx-video-workflow`

## 1. 工作流节点顺序（7节点最终版）

**Decision**: 素材上传 → 文案生产 → 表情包召回 → 分镜脚本 → BGM 召回 → TTS 选择 → CapCut 成片

**PIPELINE 常量**:
```typescript
const PIPELINE = [
  "mediaUpload",    // 1. 素材上传
  "copywriting",    // 2. 文案生产
  "memeRecall",     // 3. 表情包召回
  "storyboard",     // 4. 分镜脚本
  "bgmRecall",      // 5. BGM 召回
  "ttsSelection",   // 6. TTS 选择（新增）
  "capcutBuild",    // 7. CapCut 成片（原 jianyingBuild）
] as const;
```

**与现有实现的差异**:
- `jianyingBuild` → `capcutBuild`（重命名，功能不变）
- 新增 `ttsSelection` 节点（在 bgmRecall 之后，capcutBuild 之前）
- 节点顺序整体保持一致（现有顺序 mediaUpload→copywriting→memeRecall→storyboard→bgmRecall→jianyingBuild 仅末尾新增 ttsSelection）

---

## 2. 豆包 TTS API 技术方案

**Decision**: 使用火山引擎豆包 TTS HTTP Chunked API，Convex action（`"use node"`）中调用

**API 端点**: `https://openspeech.bytedance.com/api/v3/tts/unidirectional`

**认证方式**（Request Headers）:
```
X-Api-App-Id: {DOUBAO_SOUND_APP_ID}
X-Api-Access-Key: {DOUBAO_SOUND_API_KEY}
X-Api-Resource-Id: seed-tts-2.0
```

**请求体**:
```json
{
  "user": { "uid": "{userId}" },
  "req_params": {
    "text": "要合成的文本内容",
    "speaker": "zh_female_vv_uranus_bigtts",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000
    }
  }
}
```

**响应处理**（Chunked 流）:
- 响应为多个 JSON chunks，`data` 字段为 base64 编码音频
- 最后一个 chunk `code: 20000000` 表示结束
- 拼接所有 base64 → 解码为 Buffer → 上传到 Convex Storage

**Convex action 实现策略**:
```typescript
"use node";
// fetch 收集所有 chunks → 拼接 base64 → Buffer → uploadToConvex
```

---

## 3. TTS 音色召回策略

**Decision**: 从 `voices.json`（10个音色）中，根据项目情感标签（emotionTags）匹配最相关的 5 个音色，默认选第一个

**voices.json 分析（10个音色）**:
| voiceType | name | gender | 场景 |
|-----------|------|--------|------|
| `zh_female_vv_uranus_bigtts` | Vivi 2.0 | female | 通用，治愈安抚 |
| `zh_female_xiaohe_uranus_bigtts` | 小何 2.0 | female | 通用，甜美活泼 |
| `zh_male_m191_uranus_bigtts` | 云舟 2.0 | male | 通用，磁性成熟 |
| `zh_male_taocheng_uranus_bigtts` | 小天 2.0 | male | 通用，清澈阳光 |
| `saturn_zh_female_qingyingduoduo_cs_tob` | 轻盈朵朵 2.0 | female | 客服，知性 |
| `zh_male_shaonianzixin_uranus_bigtts` | 少年梓辛 2.0 | male | 通用，少年感 |
| `zh_female_meilinvyou_uranus_bigtts` | 魅力女友 2.0 | female | 通用，御姐 |
| `zh_male_liufei_uranus_bigtts` | 刘飞 2.0 | male | 通用，理性稳重 |
| `zh_female_yingyujiaoxue_uranus_bigtts` | Tina老师 2.0 | female | 教学，知性 |
| `zh_female_cancan_mars_bigtts` | Shiny（灿灿） | female | 多语种，萝莉 |

**情感→音色映射规则**（前端逻辑，无需后端）:
- 搞笑/震惊 → 优先：小何2.0、少年梓辛2.0、Shiny
- 励志/激励 → 优先：云舟2.0、小天2.0、刘飞2.0
- 伤感/委屈 → 优先：Vivi2.0、魅力女友2.0
- 日常/通用 → 优先：Vivi2.0、小何2.0、云舟2.0
- 可爱 → 优先：Shiny、小何2.0
- 客服/专业 → 优先：轻盈朵朵2.0、Tina老师2.0

**实现方案**: 前端纯函数 `matchVoicesByEmotionTags(emotionTags, voices) → voice[5]`，无需 API 调用

**TTS 悬停预览实现**:
- 直接使用 `voices.json` 中的 `sampleAudioUrl`（外部 bytednsdoc.com URL）
- **无需**生成试听音频或上传到 Convex Storage（节省 API 调用）
- 悬停 300ms 后播放，离开立即停止
- 全局单例 `audioRef` 防止多轨并播

---

## 4. BGM 召回悬停预览

**Decision**: BGM 悬停预览与 TTS 悬停预览逻辑完全相同，共用同一个 `useAudioPreview` hook

**实现方案**:
```typescript
function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback((url: string) => {
    timerRef.current = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      audioRef.current = new Audio(url);
      audioRef.current.play().catch(() => {});
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}
```

---

## 5. 节点动态编排方案

**Decision**: 使用配置文件 `pipeline.config.ts` 定义节点顺序和动态 import 路径，DreamXCanvas 读取配置动态加载节点组件

**实现方案**:
```typescript
// app/components/dreamx-canvas/nodes/pipeline.config.ts
export const PIPELINE_CONFIG = [
  {
    key: "mediaUpload",
    label: "素材上传",
    nodeType: "mediaUploadNode",
    load: () => import("./MediaUploadNode"),
  },
  {
    key: "copywriting",
    label: "文案生产",
    nodeType: "copywritingNode",
    load: () => import("./CopywritingNode"),
  },
  // ... 其余节点
];
```

**DreamXCanvas 中使用**:
```typescript
const nodeTypes = useMemo(() => {
  return Object.fromEntries(
    PIPELINE_CONFIG.map(({ nodeType, load }) => [
      nodeType,
      React.lazy(load),
    ])
  );
}, []);
```

**"无需部署实时生效"的实现**:
- 节点配置和实现完全分离
- 修改 `pipeline.config.ts` 或新增节点文件后，通过 `convex dev` 热更新即可（开发环境）
- 生产环境需重新部署前端（Vite 构建），但新增/修改节点文件是低风险变更

**注意**: 真正的"无需部署实时生效"需要服务端驱动的节点配置（如从 Convex 读取节点顺序），v1 先用配置文件方案，v2 再升级为数据库驱动

---

## 6. 内置素材上传方案（Seeder）

**Decision**: 新建 `convex/dreamXSeeder.ts`，提供 internal mutation，将本地素材文件上传到 Convex Storage 并写入 `dreamXMedia` 表

**表情包内置素材（3个分类）**:
- `cat_shocked`: 取前4个 GIF（Cat_Cucumber_GIF 等）
- `cat_crying`: 取前4个 GIF（Cat_Meme_GIF 等）
- `white_cat`: 全部4个 GIF

**BGM 内置素材（3个分类）**:
- `happy`: It__39_s_April_847.mp3, Smile_1076.mp3, Summer__39_s_Here_91.mp3, Tears_of_Joy_839.mp3
- `funny`: Banjo_Man_in_Africa_822.mp3, Comical_2.mp3, Feeling_Happy_5.mp3, just_kidding.mp3
- `motivational`: Motivation_Gets_in_the_Way_519.mp3（仅1个）

**上传流程**:
1. 读取本地文件 Buffer（`fs.readFileSync`）
2. 通过 Convex `ctx.storage.store(new Blob([buffer]))` 上传
3. 获取 storageId → 调用 `ctx.storage.getUrl(storageId)` 获取 URL
4. 写入 `dreamXMedia` 表：`{ type, name, mood, url, storageId, isBuiltin: true }`

**执行方式**: 在 Convex Dashboard 执行 seeder mutation，或通过 `npx convex run dreamXSeeder:seedBuiltinMedia` 命令行执行

**Alternative**: 直接使用本地文件路径读取（仅在开发环境有效，不适合生产）→ 排除

---

## 7. CapCut 命名规范

**Decision**: 所有"jianying"相关命名统一替换为"capcut"

**涉及范围**:
| 原有命名 | 新命名 |
|---------|-------|
| `jianyingBuild` (nodeKey) | `capcutBuild` |
| `JianyingBuildNode` (组件) | `CapcutBuildNode` |
| `jianyingBuilder.ts` (文件) | `capcutBuilder.ts` |
| `buildJianyingProject` (函数) | `buildCapcutProject` |
| `jianyingBuild.ts` (Convex) | `capcutBuild.ts` 或在 dreamXCanvas 中内联 |
| 用户界面文案"剪映" | "CapCut"（英文）或"剪映（CapCut）" |

---

## 8. 文案生产节点（复用现有 CopywritingNode）

**Decision**: `copywriting` 节点逻辑完全复用现有 `CopywritingNode` 组件，仅从 `DreamXPipelineNodes.tsx` 中提取为独立文件

**无需修改**：
- AI 调用：`dreamXAI.generateCopywriting`（已存在）
- 数据结构：`copywriting.script`（已存在）
- UI：小红书爆款文案，情绪标签，逐句显示

---

## 9. 成片节点 v1 范围确认

**Decision**: v1 仅实现 CapCut ZIP 导出，视频预览不实现

**v1 CapcutBuildNode 功能**:
- 「生成工程」按钮 → 调用 `buildCapcutProject`
- 生成中：spinner + loading 文案
- 生成完成：「下载 ZIP」按钮 + 导入指南（macOS/Windows 路径）
- 错误：错误信息 + 「重试」按钮

**v2（不在此次实现）**:
- 后台异步处理（> 5min 超时）
- 浏览器通知 + 邮件通知
- 视频 MP4 预览

---

## 10. TTS 音频生成流程（完整语音）

**Decision**: 用户在 TTSSelectionNode 选择音色后，点击「确认音色并生成语音」按钮，触发 `generateTTSAudio` Convex action，生成完整 TTS 音频

**文本来源**:
- 优先：`copywriting.script` 中所有 `text` 字段拼接（分隔符：空格或标点）
- 回退：`mediaUpload.eventDescription`

**生成结果**:
- 完整 TTS MP3 文件 → Convex Storage
- `ttsSelection.audioStorageId` + `ttsSelection.audioUrl` + `ttsSelection.audioDurationMs`

**storyboard 与 TTS 时间轴**:
- storyboard 生成时，若 `ttsSelection.audioDurationMs` 存在，使用音频时长分配各帧时间
- 若无 TTS 时长，使用 copywriting.script 中的 durationMs

---

## 11. 参考 UI 组件

**参考文件**: `app/components/canvas/ThumbnailUploadModal.tsx`

**可复用设计模式**:
- 文件上传区（拖放 + 点击）：复用 Input type="file" + dragover/drop 事件处理
- 进度指示：Spinner + 文案
- 错误状态 + 重试按钮
- 节点卡片整体布局（渐变背景 + 白色内容区）

**shadcn/ui 组件使用**:
- `Button`, `Input`, `Badge`, `Progress`, `ScrollArea`, `Slider`（音量调节）
- Radix UI `Tooltip`（悬停提示）

---

## 12. LLM 文本生产节点 Prompt 设计

### 12.1 素材上传节点 - 图片批量分析 Prompt

**节点**: `mediaUpload` → `analyzeMediaBatch` action  
**模型**: Claude Vision（claude-3-5-sonnet）  
**输入**: 1-10张图片 URL + 事件描述（可选）

**System Prompt**:
```
你是一名专业的短视频内容分析师，擅长理解图片内容并提炼营销价值。
```

**User Prompt**:
```
请分析以下{N}张图片的内容，这些图片用于制作小红书营销短视频。

事件描述：{eventDescription}（若无则根据图片自行理解）

请按以下格式输出：

【逐图理解】
图1：[1-2句，描述图片主要内容、场景、人物/产品特征]
图2：[同上]
...

【综合分析】
[2-3句，描述这组图片的整体主题、情绪氛围、营销价值点]

【情绪标签】
[从以下标签中选2-4个最匹配的，用逗号分隔]
搞笑 / 震惊 / 励志 / 伤感 / 日常 / 可爱 / 委屈 / 愤怒 / 欢快
```

---

### 12.2 文案生产节点 - 小红书爆款文案 Prompt

**节点**: `copywriting` → `generateCopywriting` action  
**模型**: Claude claude-3-5-sonnet  
**输入**: aiAnalysis（图片综合分析）+ emotionTags + 图片数量 + eventDescription

**System Prompt**:
```
你是一名小红书爆文写手，专门创作热点营销短视频字幕脚本。

你必须严格遵守以下规则：
1. 每句字幕不超过14个中文字符（含标点）
2. 情绪递进框架：Hook（吸引）→ 爆料/展示（冲击）→ 利益点（与我相关）→ 引导（互动）
3. 文风口语化、夸张、情绪化，代替用户抒发情绪
4. 适当使用情绪词：天塌了、羡慕麻了、酸了、离大谱、破防了、炸裂、离谱、赢麻了
5. 适当使用强动词：干掉、飞升、狂招、抢疯、被逼、疯抢
6. 每张图分配1-3句字幕，高潮快切，铺垫可慢
7. 输出严格的JSON格式，不要有任何其他说明文字
```

**User Prompt**:
```
根据以下信息创作小红书短视频字幕脚本：

【图片分析】
{aiAnalysis}

【情绪标签】
{emotionTags}

【事件描述】
{eventDescription || "营销宣传短视频"}

【图片数量】
{imageCount}张

请输出6-10句字幕脚本，按情绪递进框架排列，分配到{imageCount}张图片上。

输出格式（严格JSON）：
{
  "emotionTags": ["搞笑", "震惊"],
  "script": [
    {
      "text": "字幕内容（≤14字）",
      "imageIndex": 0,
      "durationMs": 1800,
      "mood": "搞笑"
    }
  ]
}

时长计算规则：
- 每句 durationMs = 字数 × 200（毫秒），最小1500，最大4000
- 高潮句用1500-2000ms（快切节奏）
- 铺垫句用2500-3000ms
```

---

### 12.3 分镜脚本节点 - 时间轴生成 Prompt + 算法

**节点**: `storyboard` → `generateStoryboard` action  
**模型**: Claude（负责根据文案脚本和素材决策分镜节奏）  
**输入**: copywriting.script + memeRecall.selectedMemes + mediaUpload.images（含 aiDescription）

**System Prompt**:
```
你是一名专业的短视频分镜师，擅长将图片+字幕+表情包组合成节奏感强的营销视频分镜脚本。

核心原则：
1. 图片和表情包必须严格按时间顺序排列（不能先排完所有图片再插表情包）
2. 表情包在情绪高潮点插入，起到强化情绪的作用
3. 每句字幕对应特定时间段，字幕时长决定图片展示时长
4. 快切（1500ms）用于高潮/冲击；慢一点（2500-3000ms）用于铺垫
```

**User Prompt**:
```
请根据以下素材生成完整的分镜时间轴。

【图片列表（按拍摄顺序）】
{images.map((img, i) => `图${i+1}: ${img.aiDescription}`).join('\n')}

【文案脚本（每句对应图片序号）】
{script.map(s => `图${s.imageIndex+1}-句${i}: "${s.text}" (${s.durationMs}ms, 情绪: ${s.mood})`).join('\n')}

【表情包插入计划】
{selectedMemes.map(m => `"${m.name}"(${m.mood}) → 插入图${m.insertAfterImageIndex+1}之后`).join('\n') || "无表情包"}

请决策：
1. 确认每张图片的总展示时长（该图所有字幕时长之和）
2. 确认表情包插入时机是否合理（可微调 insertAfterImageIndex）
3. 必要时调整个别字幕时长以优化节奏（仍需在1500-4000ms范围内）

输出严格JSON格式：
{
  "timeline": [
    {
      "type": "image",
      "imageIndex": 0,
      "durationMs": 3000,
      "subtitles": [
        { "text": "字幕内容", "durationMs": 1500 }
      ]
    },
    {
      "type": "meme",
      "memeName": "猫咪震惊1",
      "durationMs": 1500
    }
  ],
  "totalDurationMs": 15000,
  "directorNote": "整体节奏说明（1句）"
}
```

**LLM 决策后的算法处理**（将 LLM 输出转换为完整 timeline）:

```typescript
function buildTimelineFromLLMDecision(
  llmDecision: LLMTimelineDecision,
  images: Image[],
  memes: SelectedMeme[]
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let currentMs = 0;
  
  for (const item of llmDecision.timeline) {
    if (item.type === "image") {
      const img = images[item.imageIndex];
      let subtitleStart = 0;
      const subtitlesWithTime = (item.subtitles ?? []).map(s => {
        const entry = { text: s.text, startMs: currentMs + subtitleStart, durationMs: s.durationMs };
        subtitleStart += s.durationMs;
        return entry;
      });
      
      timeline.push({
        type: "image",
        url: img.url,
        name: img.fileName,
        startMs: currentMs,
        durationMs: item.durationMs,
        subtitles: subtitlesWithTime,
      });
      currentMs += item.durationMs;
    } else if (item.type === "meme") {
      const meme = memes.find(m => m.name === item.memeName);
      if (meme) {
        timeline.push({
          type: "meme",
          url: meme.url,
          name: meme.name,
          startMs: currentMs,
          durationMs: item.durationMs || 1500,
        });
        currentMs += item.durationMs || 1500;
      }
    }
  }
  
  return timeline;
}
```

**时长规则**（来自 smart-editing.md）:

```typescript
function buildTimeline(
  images: Image[],
  script: ScriptItem[],
  memes: SelectedMeme[],
  ttsAudioDurationMs?: number
): TimelineEntry[] {
  // 1. 按 imageIndex 分组字幕
  const subtitlesByImage = groupBy(script, 'imageIndex');
  
  // 2. 按插入位置分组表情包
  const memesByPosition = groupBy(memes, 'insertAfterImageIndex');
  
  const timeline: TimelineEntry[] = [];
  let currentMs = 0;
  
  // 3. 先插入 insertAfterImageIndex === -1 的表情包
  for (const meme of memesByPosition[-1] ?? []) {
    timeline.push({ type: "meme", ...meme, startMs: currentMs, durationMs: 1500 });
    currentMs += 1500;
  }
  
  // 4. 按顺序处理每张图片
  for (let i = 0; i < images.length; i++) {
    const subtitles = subtitlesByImage[i] ?? [];
    
    // 计算图片时长（该图所有字幕时长之和）
    const imageDurationMs = subtitles.reduce(
      (sum, s) => sum + s.durationMs, 0
    ) || 2000; // 无字幕时默认2000ms
    
    // 构建字幕的相对时间戳
    let subtitleStart = 0;
    const subtitlesWithTime = subtitles.map(s => {
      const item = { text: s.text, startMs: currentMs + subtitleStart, durationMs: s.durationMs };
      subtitleStart += s.durationMs;
      return item;
    });
    
    timeline.push({
      type: "image",
      url: images[i].url,
      name: images[i].fileName,
      startMs: currentMs,
      durationMs: imageDurationMs,
      subtitles: subtitlesWithTime,
    });
    currentMs += imageDurationMs;
    
    // 5. 插入该图之后的表情包
    for (const meme of memesByPosition[i] ?? []) {
      timeline.push({ type: "meme", ...meme, startMs: currentMs, durationMs: 1500 });
      currentMs += 1500;
    }
  }
  
  return timeline;
}
```

**时长规则**（来自 smart-editing.md）:
- 单句最短 1500ms，最长 4000ms
- 单图最长不超过 10000ms
- 表情包固定 1500ms（快闪效果）
- 字数 × 200ms = 时长（向上取整到最近500ms，但不低于1500ms）

---

### 12.4 LLM 生产节点汇总

| 节点 | 是否用 LLM | 模型 | 主要 Prompt 参考 |
|------|-----------|------|----------------|
| 素材上传 | 是 | Claude Vision | 12.1 |
| 文案生产 | 是 | Claude | 12.2（基于 redbook_script.md 方法论） |
| 表情包召回 | 否 | 算法匹配 | 按 emotionTags 查询 dreamXMedia |
| 分镜脚本 | 是 | Claude | 12.3（LLM 决策节奏 + 算法计算绝对时间戳） |
| BGM 召回 | 否 | 算法匹配 | 按 emotionTags 查询 dreamXMedia |
| TTS 选择 | 否（用户选择） | 豆包 TTS | 音色匹配 + API 调用 |
| CapCut 成片 | 否 | 算法生成 | capcutBuilder 复用 jianyingBuilder |
