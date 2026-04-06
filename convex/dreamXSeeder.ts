"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import * as fs from "fs";
import * as path from "path";

export const seedBuiltinMedia = action({
  args: {
    mediaBasePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const basePath = args.mediaBasePath ?? "/Users/huangzhidong/work/dreamX/doc";

    const mediaItems: Array<{
      type: "meme" | "bgm";
      name: string;
      mood: string;
      filePath: string;
      mimeType: string;
    }> = [
      { type: "meme", name: "猫咪震惊1", mood: "震惊", filePath: "memes/cat_shocked/Cat_Cucumber_GIF_KuULZbHhAtBcj2Guhi.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪震惊2", mood: "震惊", filePath: "memes/cat_shocked/Cat_Surprise_GIF_HGF5maCdgAnLFrBPfS.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪震惊3", mood: "震惊", filePath: "memes/cat_shocked/Shocked_Big_Eyes_GIF_bV7B0LGkQZlEDQmekc.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪哭泣1", mood: "伤感", filePath: "memes/cat_crying/Sad_Cat_GIF_fFa05KbZowXiEIyRse.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪哭泣2", mood: "伤感", filePath: "memes/cat_crying/Sad_Cat_GIF_mi4ec226vjAkehSLk0.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪哭泣3", mood: "伤感", filePath: "memes/cat_crying/Sad_Cat_GIF_vDp5QKez5EFejGBz3F.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪表情1", mood: "搞笑", filePath: "memes/cat_crying/Cat_Meme_GIF_OOTUh0PZlJwoXpg94f.gif", mimeType: "image/gif" },
      { type: "meme", name: "白猫1", mood: "通用", filePath: "memes/white_cat/Cat_GIF_nO6TAwq2qZYPswdJdg.gif", mimeType: "image/gif" },
      { type: "meme", name: "白猫2", mood: "通用", filePath: "memes/white_cat/Cat_GIF_wr7oA0rSjnWuiLJOY5.gif", mimeType: "image/gif" },
      { type: "meme", name: "白猫表情包", mood: "通用", filePath: "memes/white_cat/Cat_Meme_GIF_2zUn8hAwJwG4abiS0p.gif", mimeType: "image/gif" },
      { type: "meme", name: "白猫Larry", mood: "通用", filePath: "memes/white_cat/Larry_Cat_Meme_GIF_p0ydOvZ6xm8PMe5qlr.gif", mimeType: "image/gif" },
      { type: "meme", name: "猫咪摊手", mood: "通用", filePath: "memes/white_cat/Cat_GIF_nO6TAwq2qZYPswdJdg.gif", mimeType: "image/gif" },
      { type: "bgm", name: "It's April", mood: "开心", filePath: "bgm/happy/It__39_s_April_847.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Smile", mood: "开心", filePath: "bgm/happy/Smile_1076.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Summer's Here", mood: "开心", filePath: "bgm/happy/Summer__39_s_Here_91.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Banjo Man", mood: "搞笑", filePath: "bgm/funny/Banjo_Man_in_Africa_822.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Comical", mood: "搞笑", filePath: "bgm/funny/Comical_2.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Just Kidding", mood: "搞笑", filePath: "bgm/funny/just_kidding.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Feeling Happy", mood: "搞笑", filePath: "bgm/funny/Feeling_Happy_5.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Tears of Joy", mood: "开心", filePath: "bgm/happy/Tears_of_Joy_839.mp3", mimeType: "audio/mpeg" },
      { type: "bgm", name: "Motivation", mood: "励志", filePath: "bgm/motivational/Motivation_Gets_in_the_Way_519.mp3", mimeType: "audio/mpeg" },
    ];

    const results: Array<{ name: string; status: "inserted" | "skipped" | "error"; error?: string }> = [];

    for (const item of mediaItems) {
      try {
        const existing = await ctx.runQuery("dreamXMedia:getBuiltinByName" as any, { name: item.name });
        if (existing) {
          results.push({ name: item.name, status: "skipped" });
          continue;
        }

        const fullPath = path.join(basePath, item.filePath);
        if (!fs.existsSync(fullPath)) {
          results.push({ name: item.name, status: "error", error: `File not found: ${fullPath}` });
          continue;
        }

        const fileBuffer = fs.readFileSync(fullPath);
        const blob = new Blob([fileBuffer], { type: item.mimeType });
        const storageId = await ctx.storage.store(blob);
        const url = await ctx.storage.getUrl(storageId);

        if (!url) {
          results.push({ name: item.name, status: "error", error: "Failed to get URL" });
          continue;
        }

        await ctx.runMutation("dreamXMedia:insertBuiltinMedia" as any, {
          type: item.type,
          name: item.name,
          mood: item.mood,
          url,
          storageId,
        });

        results.push({ name: item.name, status: "inserted" });
      } catch (e) {
        results.push({ name: item.name, status: "error", error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    const inserted = results.filter((r) => r.status === "inserted").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error");

    return { inserted, skipped, errors, total: mediaItems.length };
  },
});
