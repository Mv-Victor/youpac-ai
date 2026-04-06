#!/usr/bin/env node
/**
 * 通过 Convex HTTP admin endpoint 上传本地 DreamX 素材
 * 使用方式: node scripts/upload-media.mjs
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// 读取环境变量
let convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;
const envPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key === "VITE_CONVEX_SITE_URL" && !convexSiteUrl) convexSiteUrl = val;
  }
}

if (!convexSiteUrl) {
  // 根据 CONVEX_DEPLOYMENT 推断
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key === "CONVEX_DEPLOYMENT") {
      const name = val.replace(/^dev:/, "");
      convexSiteUrl = `https://${name}.convex.site`;
    }
  }
}

if (!convexSiteUrl) {
  console.error("❌ Cannot determine Convex site URL");
  process.exit(1);
}

console.log(`🔗 Convex site URL: ${convexSiteUrl}`);

const DOC_BASE = "/Users/huangzhidong/work/dreamX/doc";

const MEDIA_ITEMS = [
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
  { type: "bgm", name: "It's April", mood: "开心", filePath: "bgm/happy/It__39_s_April_847.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Smile", mood: "开心", filePath: "bgm/happy/Smile_1076.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Tears of Joy", mood: "开心", filePath: "bgm/happy/Tears_of_Joy_839.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Banjo Man", mood: "搞笑", filePath: "bgm/funny/Banjo_Man_in_Africa_822.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Comical", mood: "搞笑", filePath: "bgm/funny/Comical_2.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Just Kidding", mood: "搞笑", filePath: "bgm/funny/just_kidding.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Feeling Happy", mood: "搞笑", filePath: "bgm/funny/Feeling_Happy_5.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Motivation", mood: "励志", filePath: "bgm/motivational/Motivation_Gets_in_the_Way_519.mp3", mimeType: "audio/mpeg" },
];

async function uploadItem(item) {
  const fullPath = path.join(DOC_BASE, item.filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${fullPath}`);
    return { status: "skip" };
  }

  const fileBuffer = fs.readFileSync(fullPath);
  const url = `${convexSiteUrl}/admin/upload-media?type=${encodeURIComponent(item.type)}&name=${encodeURIComponent(item.name)}&mood=${encodeURIComponent(item.mood)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": item.mimeType },
    body: fileBuffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json;
}

async function main() {
  console.log("\n🚀 DreamX Media Upload via HTTP Endpoint");
  console.log("=".repeat(50));

  const results = [];
  for (const item of MEDIA_ITEMS) {
    try {
      const result = await uploadItem(item);
      if (result.status === "skip") {
        console.log(`⚠️  Skipped (file not found): ${item.name}`);
        results.push({ name: item.name, status: "skip" });
      } else if (result.skipped) {
        console.log(`⏭  Already exists: ${item.name}`);
        results.push({ name: item.name, status: "skipped" });
      } else {
        console.log(`✅ Uploaded: ${item.name}`);
        results.push({ name: item.name, status: "inserted" });
      }
    } catch (e) {
      console.error(`❌ Error: ${item.name}: ${e.message}`);
      results.push({ name: item.name, status: "error", error: e.message });
    }
  }

  console.log("\n" + "=".repeat(50));
  const inserted = results.filter(r => r.status === "inserted").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error");
  console.log(`📊 Summary: ${inserted} uploaded, ${skipped} already existed, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log("Errors:");
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

main().catch(console.error);
