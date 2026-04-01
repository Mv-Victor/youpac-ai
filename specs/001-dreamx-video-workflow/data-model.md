# Data Model: DreamX AI 营销视频自动化生成工作流（v2）

**Generated**: 2026-04-01 | **Branch**: `001-dreamx-video-workflow`

## 核心实体

### 1. DreamXProject

**表名**: `dreamXProjects`  
**状态**: 需在 `convex/schema.ts` 中补充完整定义

**节点状态枚举**:
```
"locked"     - 未解锁，不存在于 React Flow nodes 数组
"idle"       - 已解锁，等待用户操作
"generating" - 正在执行 AI 操作
"completed"  - 已完成，只读
"error"      - 出错，可重试
```

**PIPELINE 顺序（7节点最终版）**:
```
[0] mediaUpload    → 素材上传         (初始 idle)
[1] copywriting    → 文案生产         (初始 locked)
[2] memeRecall     → 表情包召回       (初始 locked)
[3] storyboard     → 分镜脚本         (初始 locked)
[4] bgmRecall      → BGM 召回         (初始 locked)
[5] ttsSelection   → TTS 选择         (初始 locked，新增)
[6] capcutBuild    → CapCut 成片      (初始 locked，重命名自 jianyingBuild)
```

**完整字段定义**:
```typescript
defineTable({
  userId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  isArchived: v.boolean(),

  nodeStates: v.object({

    // 节点 1 - 素材上传
    mediaUpload: v.object({
      status: v.union(
        v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      images: v.optional(v.array(v.object({
        storageId: v.id("_storage"),
        url: v.string(),
        fileName: v.string(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        aiDescription: v.optional(v.string()),
      }))),
      eventDescription: v.optional(v.string()),
      moodPreference: v.optional(v.string()),
      aiAnalysis: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),

    // 节点 2 - 文案生产（已存在，保持不变）
    copywriting: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      script: v.optional(v.array(v.object({
        text: v.string(),
        durationMs: v.number(),
        imageIndex: v.number(),
        mood: v.optional(v.string()),
      }))),
      emotionTags: v.optional(v.array(v.string())),
      errorMessage: v.optional(v.string()),
    }),

    // 节点 3 - 表情包召回
    memeRecall: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      suggestedMemes: v.optional(v.array(v.object({
        url: v.string(),
        name: v.string(),
        mood: v.string(),
        mediaId: v.optional(v.id("dreamXMedia")),
        isBuiltin: v.boolean(),
      }))),
      selectedMemes: v.optional(v.array(v.object({
        url: v.string(),
        name: v.string(),
        mood: v.string(),
        insertAfterImageIndex: v.number(),  // -1: 最开始，0-N: 第N张图后
        storageId: v.optional(v.id("_storage")),
      }))),
      skipped: v.optional(v.boolean()),
    }),

    // 节点 4 - 分镜脚本（LLM 决策节奏 + 算法计算绝对时间戳）
    storyboard: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      timeline: v.optional(v.array(v.object({
        type: v.union(v.literal("image"), v.literal("meme")),
        url: v.string(),
        name: v.string(),
        startMs: v.number(),
        durationMs: v.number(),
        subtitles: v.optional(v.array(v.object({
          text: v.string(),
          startMs: v.number(),
          durationMs: v.number(),
        }))),
      }))),
      totalDurationMs: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
    }),

    // 节点 5 - BGM 召回（支持悬停预览）
    bgmRecall: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      suggestedBgms: v.optional(v.array(v.object({
        url: v.string(),
        name: v.string(),
        mood: v.string(),
        durationMs: v.optional(v.number()),
        mediaId: v.optional(v.id("dreamXMedia")),
        isBuiltin: v.boolean(),
      }))),
      selectedBgm: v.optional(v.object({
        url: v.string(),
        name: v.string(),
        durationMs: v.optional(v.number()),
        volume: v.number(),  // dB, 范围 -60 ~ 0，默认 -30
        storageId: v.optional(v.id("_storage")),
      })),
      skipped: v.optional(v.boolean()),
    }),

    // 节点 6 - TTS 选择（新增）
    ttsSelection: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      // 前端从 voices.json 按情感标签召回的5个音色（仅存储 voiceType 和 name，不存储完整 voice 对象）
      recommendedVoices: v.optional(v.array(v.object({
        voiceType: v.string(),     // 对应 voices.json 中的 voiceType，也是 speaker 参数
        name: v.string(),          // 显示名称
        sampleAudioUrl: v.string(), // 直接使用 voices.json 的 sampleAudioUrl，悬停播放
        gender: v.string(),
        description: v.string(),
      }))),
      // 用户选择的音色
      selectedVoiceType: v.optional(v.string()),  // e.g., "zh_female_vv_uranus_bigtts"
      selectedVoiceName: v.optional(v.string()),
      // 生成的完整语音文件
      audioStorageId: v.optional(v.id("_storage")),
      audioUrl: v.optional(v.string()),
      audioDurationMs: v.optional(v.number()),
      // 用于生成 TTS 的文本（来自 copywriting.script 拼接）
      ttsText: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),

    // 节点 7 - CapCut 成片（重命名自 jianyingBuild）
    capcutBuild: v.object({
      status: v.union(
        v.literal("locked"), v.literal("idle"), v.literal("generating"),
        v.literal("completed"), v.literal("error")
      ),
      // CapCut 工程 ZIP
      downloadUrl: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      projectName: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      // v2 预留字段（本次不实现）
      // videoPreviewUrl: v.optional(v.string()),
    }),

  }),
}).index("by_user", ["userId"])
```

---

### 2. DreamXMedia（已存在，添加内置素材）

**表名**: `dreamXMedia`

**内置素材清单（需通过 seeder 上传到 Convex）**:

**表情包（meme）**:
| name | mood | 文件路径 |
|------|------|---------|
| 猫咪震惊1 | 震惊 | memes/cat_shocked/Cat_Cucumber_GIF_KuULZbHhAtBcj2Guhi.gif |
| 猫咪震惊2 | 震惊 | memes/cat_shocked/Cat_Surprise_GIF_HGF5maCdgAnLFrBPfS.gif |
| 猫咪震惊3 | 震惊 | memes/cat_shocked/Shocked_Big_Eyes_GIF_bV7B0LGkQZlEDQmekc.gif |
| 猫咪哭泣1 | 伤感 | memes/cat_crying/Sad_Cat_GIF_fFa05KbZowXiEIyRse.gif |
| 猫咪哭泣2 | 伤感 | memes/cat_crying/Sad_Cat_GIF_mi4ec226vjAkehSLk0.gif |
| 白猫1 | 通用 | memes/white_cat/Cat_GIF_nO6TAwq2qZYPswdJdg.gif |
| 白猫2 | 通用 | memes/white_cat/Cat_GIF_wr7oA0rSjnWuiLJOY5.gif |
| 白猫表情包 | 通用 | memes/white_cat/Cat_Meme_GIF_2zUn8hAwJwG4abiS0p.gif |

**BGM（bgm）**:
| name | mood | 文件路径 |
|------|------|---------|
| It's April | 开心 | bgm/happy/It__39_s_April_847.mp3 |
| Smile | 开心 | bgm/happy/Smile_1076.mp3 |
| Summer's Here | 开心 | bgm/happy/Summer__39_s_Here_91.mp3 |
| Banjo Man | 搞笑 | bgm/funny/Banjo_Man_in_Africa_822.mp3 |
| Comical | 搞笑 | bgm/funny/Comical_2.mp3 |
| Just Kidding | 搞笑 | bgm/funny/just_kidding.mp3 |
| Motivation | 励志 | bgm/motivational/Motivation_Gets_in_the_Way_519.mp3 |

---

### 3. 音色配置（voices.json - 运行时读取，非 DB 数据）

`public/voices/voices.json` 中的10个音色不需要存入数据库，直接在前端 import：

```typescript
// 前端直接 import
import voicesConfig from "~/../../public/voices/voices.json";

// 或通过 fetch（SSR 兼容）
const voices = await fetch("/voices/voices.json").then(r => r.json());
```

**情感→音色匹配函数**:
```typescript
function matchVoicesByEmotionTags(
  emotionTags: string[],
  voices: Voice[],
  count = 5
): Voice[] {
  const scoreMap: Record<string, number> = {
    搞笑: ["zh_female_xiaohe_uranus_bigtts", "zh_male_shaonianzixin_uranus_bigtts", "zh_female_cancan_mars_bigtts"],
    震惊: ["zh_female_xiaohe_uranus_bigtts", "zh_male_m191_uranus_bigtts"],
    励志: ["zh_male_m191_uranus_bigtts", "zh_male_taocheng_uranus_bigtts", "zh_male_liufei_uranus_bigtts"],
    伤感: ["zh_female_vv_uranus_bigtts", "zh_female_meilinvyou_uranus_bigtts"],
    日常: ["zh_female_vv_uranus_bigtts", "zh_female_xiaohe_uranus_bigtts"],
    可爱: ["zh_female_cancan_mars_bigtts", "zh_female_xiaohe_uranus_bigtts"],
  };
  
  // 按 emotionTags 打分，返回得分最高的 count 个音色
  // 如果 emotionTags 为空，返回前 count 个（按 voices.json 顺序）
}
```

---

## 状态流转图（7节点版）

```
初始化项目:
  mediaUpload(idle) + copywriting(locked) + memeRecall(locked) +
  storyboard(locked) + bgmRecall(locked) + ttsSelection(locked) + capcutBuild(locked)
  [画布展示节点: 1]

完成 mediaUpload:
  → copywriting(idle)
  [画布展示节点: 1(completed), 2]

完成 copywriting:
  → memeRecall(idle)
  [画布展示节点: 1, 2(completed), 3]

完成 memeRecall（或跳过）:
  → storyboard(idle)
  [画布展示节点: 1, 2, 3(completed), 4]

完成 storyboard:
  → bgmRecall(idle)
  [画布展示节点: 1, 2, 3, 4(completed), 5]

完成 bgmRecall（或跳过）:
  → ttsSelection(idle)
  [画布展示节点: 1, 2, 3, 4, 5(completed), 6]

完成 ttsSelection:
  → capcutBuild(idle)
  [画布展示节点: 1, 2, 3, 4, 5, 6(completed), 7]

完成 capcutBuild:
  全部 completed，全部只读
  [画布展示节点: 1, 2, 3, 4, 5, 6, 7（全部只读）]
```

---

## 验证规则

| 字段 | 规则 |
|------|------|
| `mediaUpload.images` | 最少1张，最多10张；MIME 必须为 image/* |
| `memeRecall.selectedMemes[].insertAfterImageIndex` | -1 或 0 到 N-1 |
| `bgmRecall.selectedBgm.volume` | -60 到 0 dB |
| `ttsSelection.selectedVoiceType` | 必须是 voices.json 中存在的 voiceType |
| `ttsSelection.audioStorageId` | 节点完成前必须有值（生成完整语音后才能完成） |
| `storyboard.timeline` | 非空数组 |

---

## Schema 变更影响分析

**需要修改**: `convex/schema.ts`

**变更**:
1. 调整 `nodeStates` 对象：在 `bgmRecall` 后插入 `ttsSelection`
2. 将 `jianyingBuild` 节点 key 重命名为 `capcutBuild`
3. 新增 `ttsSelection` 节点完整字段定义

**`dreamXMedia` 表变更**: 无结构变更，仅新增内置数据（通过 seeder）
