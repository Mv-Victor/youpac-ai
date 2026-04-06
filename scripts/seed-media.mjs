#!/usr/bin/env node
/**
 * seed-media.mjs
 * 
 * 将本地 DreamX 表情包和 BGM 文件上传到 Convex Storage，并写入 dreamXMedia 表。
 * 使用方式: node scripts/seed-media.mjs
 * 
 * 依赖: node 18+（内置 fetch）
 * 需要 .env.local 中配置 VITE_CONVEX_URL 和 CONVEX_DEPLOY_KEY 或使用 npx convex
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// ─── 读取环境变量 ─────────────────────────────────────────────────────────────
let convexUrl = process.env.VITE_CONVEX_URL;
let convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;

// 从 .env.local 读取
const envPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const [key, ...vals] = line.split("=");
    const val = vals.join("=").trim();
    if (key === "VITE_CONVEX_URL" && !convexUrl) convexUrl = val;
    if (key === "VITE_CONVEX_SITE_URL" && !convexSiteUrl) convexSiteUrl = val;
  }
}

if (!convexUrl) {
  console.error("❌ VITE_CONVEX_URL not found in .env.local");
  process.exit(1);
}

const CONVEX_URL = convexUrl;
console.log(`🔗 Convex URL: ${CONVEX_URL}`);

// ─── 媒体文件清单 ─────────────────────────────────────────────────────────────
const DOC_BASE = "/Users/huangzhidong/work/dreamX/doc";

const MEDIA_ITEMS = [
  // ── Memes ──────────────────────────────────────────────────────────────────
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
  // ── BGM ────────────────────────────────────────────────────────────────────
  { type: "bgm", name: "It's April", mood: "开心", filePath: "bgm/happy/It__39_s_April_847.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Smile", mood: "开心", filePath: "bgm/happy/Smile_1076.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Tears of Joy", mood: "开心", filePath: "bgm/happy/Tears_of_Joy_839.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Banjo Man", mood: "搞笑", filePath: "bgm/funny/Banjo_Man_in_Africa_822.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Comical", mood: "搞笑", filePath: "bgm/funny/Comical_2.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Just Kidding", mood: "搞笑", filePath: "bgm/funny/just_kidding.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Feeling Happy", mood: "搞笑", filePath: "bgm/funny/Feeling_Happy_5.mp3", mimeType: "audio/mpeg" },
  { type: "bgm", name: "Motivation", mood: "励志", filePath: "bgm/motivational/Motivation_Gets_in_the_Way_519.mp3", mimeType: "audio/mpeg" },
];

// ─── Helper: 调用 Convex mutation/query ───────────────────────────────────────
async function convexCall(funcPath, args = {}) {
  const url = `${CONVEX_URL}/api/mutation`;
  const body = JSON.stringify({ path: funcPath, args });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex ${funcPath} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Convex error in ${funcPath}: ${JSON.stringify(json.errorMessage)}`);
  }
  return json.value;
}

async function convexQuery(funcPath, args = {}) {
  const url = `${CONVEX_URL}/api/query`;
  const body = JSON.stringify({ path: funcPath, args });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex ${funcPath} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Convex error in ${funcPath}: ${JSON.stringify(json.errorMessage)}`);
  }
  return json.value;
}

// ─── Helper: 上传文件到 Convex Storage ───────────────────────────────────────
async function uploadToConvex(fileBuffer, mimeType) {
  // Step 1: 获取 upload URL（调用 dreamXCanvas.generateUploadUrl 不行因为需要 auth）
  // 改用 Convex Storage HTTP API: POST /api/storage/upload
  const uploadUrl = `${CONVEX_URL.replace(".convex.cloud", ".convex.cloud")}/api/storage/upload`;

  // 先通过 mutation 获取预签名 URL
  const res = await fetch(`${CONVEX_URL}/api/storage/upload`, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: fileBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.storageId;
}

// Convex Storage 使用 upload URL 模式
async function getUploadUrl() {
  // 调用 dreamXCanvas.generateUploadUrl 需要认证
  // 换一种方式：通过 http.ts 中的 /upload 端点
  // 实际上 Convex Storage upload 需要先 generateUploadUrl
  // 我们用 convex/http.ts 中注册的 route 或直接尝试无认证上传
  const siteUrl = convexSiteUrl || CONVEX_URL.replace(".convex.cloud", ".convex.site");
  const res = await fetch(`${siteUrl}/upload?filename=test`, {
    method: "GET",
  });
  if (!res.ok) {
    // 尝试直接存储方式
    throw new Error(`Cannot get upload URL: ${res.status}`);
  }
  const json = await res.json();
  return json.uploadUrl;
}

// ─── 备用方案：通过 convex/http.ts 中注册的 upload 端点 ──────────────────────
async function uploadViaHttpEndpoint(fileBuffer, mimeType, filename) {
  const siteUrl = convexSiteUrl || CONVEX_URL.replace(".convex.cloud", ".convex.site");

  // 尝试 /api/storage/upload
  const directUrl = `${siteUrl}/api/storage/upload`;
  const res = await fetch(directUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
    },
    body: fileBuffer,
  });

  if (res.ok) {
    const json = await res.json();
    return { storageId: json.storageId };
  }

  throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀 DreamX Media Seeder");
  console.log("=".repeat(50));

  const results = [];

  for (const item of MEDIA_ITEMS) {
    const fullPath = path.join(DOC_BASE, item.filePath);

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File not found: ${fullPath}`);
      results.push({ name: item.name, status: "skip", reason: "file not found" });
      continue;
    }

    try {
      // 检查是否已存在
      let existing = null;
      try {
        existing = await convexQuery("dreamXMedia:getBuiltinByName", { name: item.name });
      } catch {
        // query might fail if not found - that's ok
      }

      if (existing) {
        console.log(`⏭  Skipped (already exists): ${item.name}`);
        results.push({ name: item.name, status: "skipped" });
        continue;
      }

      // 读取文件
      const fileBuffer = fs.readFileSync(fullPath);
      console.log(`📤 Uploading ${item.name} (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);

      // 方案1: 通过 Convex generateUploadUrl + fetch 上传
      // 需要绕过 auth，使用 http.ts 中的匿名 upload endpoint
      // 先检查 http.ts 是否有注册 storage upload
      
      // 方案2: 直接发 POST 到 Convex storage upload
      // https://docs.convex.dev/file-storage/upload-files#http-api
      // POST /api/storage/upload 需要 Convex deployment key
      
      const uploadUrl = `${CONVEX_URL}/api/storage/upload`;
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
          "Authorization": `Convex ${process.env.CONVEX_DEPLOY_KEY || ""}`,
        },
        body: fileBuffer,
      });

      let storageId, fileUrl;

      if (uploadRes.ok) {
        const uploadJson = await uploadRes.json();
        storageId = uploadJson.storageId;
      } else {
        // 尝试通过 Convex site URL 的自定义 HTTP endpoint
        const siteUrl = convexSiteUrl || CONVEX_URL.replace(".convex.cloud", ".convex.site");
        const altRes = await fetch(`${siteUrl}/upload-media`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: fileBuffer,
        });
        if (!altRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
        }
        const altJson = await altRes.json();
        storageId = altJson.storageId;
        fileUrl = altJson.url;
      }

      // 获取 URL
      if (!fileUrl) {
        const urlRes = await convexQuery("dreamXCanvas:getFileUrl", { storageId });
        fileUrl = urlRes;
      }

      if (!fileUrl) {
        throw new Error("Failed to get file URL after upload");
      }

      // 写入 dreamXMedia 表
      await convexCall("dreamXMedia:insertBuiltinMedia", {
        type: item.type,
        name: item.name,
        mood: item.mood,
        url: fileUrl,
        storageId,
      });

      console.log(`✅ Inserted: ${item.name}`);
      results.push({ name: item.name, status: "inserted" });
    } catch (e) {
      console.error(`❌ Error for ${item.name}:`, e.message);
      results.push({ name: item.name, status: "error", error: e.message });
    }
  }

  // ─── 统计 ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  const inserted = results.filter(r => r.status === "inserted").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error");
  console.log(`📊 Summary: ${inserted} inserted, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log("Errors:");
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

main().catch(console.error);
