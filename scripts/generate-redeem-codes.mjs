#!/usr/bin/env node
/**
 * generate-redeem-codes.mjs
 *
 * 批量生成 DreamX 兑换码并写入 Convex 数据库。
 * 使用方式:
 *   node scripts/generate-redeem-codes.mjs --all
 *   node scripts/generate-redeem-codes.mjs --type vip --count 5
 *
 * 依赖: node 18+（内置 fetch + crypto）
 * 需要 .env.local 中配置 CONVEX_SITE_URL 和 ADMIN_SECRET_KEY
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// ─── 读取环境变量 ─────────────────────────────────────────────────────────────
let convexSiteUrl = process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_SITE_URL;
let adminKey = process.env.ADMIN_SECRET_KEY;

const envFiles = [".env.local", ".env"];
for (const envFile of envFiles) {
  const envPath = path.join(projectRoot, envFile);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if ((key === "CONVEX_SITE_URL" || key === "VITE_CONVEX_SITE_URL") && !convexSiteUrl) convexSiteUrl = val;
      if (key === "ADMIN_SECRET_KEY" && !adminKey) adminKey = val;
    }
  }
}

if (!convexSiteUrl) {
  console.error("❌ CONVEX_SITE_URL or VITE_CONVEX_SITE_URL not found in .env.local");
  process.exit(1);
}
if (!adminKey) {
  console.error("❌ ADMIN_SECRET_KEY not found in .env.local");
  process.exit(1);
}

// ─── 解析命令行参数 ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let mode = null;
let type = null;
let count = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--all") mode = "all";
  if (args[i] === "--type" && args[i + 1]) { type = args[i + 1]; i++; }
  if (args[i] === "--count" && args[i + 1]) { count = parseInt(args[i + 1]); i++; }
}

if (!mode && !type) {
  console.log("用法:");
  console.log("  node scripts/generate-redeem-codes.mjs --all");
  console.log("  node scripts/generate-redeem-codes.mjs --type trial|vip|svip --count N");
  process.exit(0);
}

// ─── 生成随机兑换码 ───────────────────────────────────────────────────────────
function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  const bytes = crypto.randomBytes(16);
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code; // 16位，不含连字符（存储格式）
}

function formatCodeDisplay(code) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}

// ─── 上传兑换码到 Convex ──────────────────────────────────────────────────────
async function insertCodes(codes) {
  const url = `${convexSiteUrl}/admin/insert-redeem-codes`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ codes }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return await res.json();
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
const CREDITS_MAP = { trial: 30, vip: 150, svip: 500 };
const TYPE_LABELS = { trial: "体验版", vip: "VIP", svip: "SVIP" };

async function generateBatch(codeType, batchCount) {
  const codes = Array.from({ length: batchCount }, () => ({
    code: generateCode(),
    type: codeType,
  }));

  const result = await insertCodes(codes);

  return { codes, result };
}

async function main() {
  console.log("\n🎫 DreamX 兑换码生成器");
  console.log("=".repeat(50));
  console.log(`🔗 Convex Site: ${convexSiteUrl}`);

  const types = mode === "all" ? ["trial", "vip", "svip"] : [type];
  const countPerType = mode === "all" ? 10 : count;

  const allCodes = {};
  const date = new Date().toISOString().slice(0, 10);

  for (const codeType of types) {
    if (!CREDITS_MAP[codeType]) {
      console.error(`❌ 未知类型: ${codeType}（支持 trial/vip/svip）`);
      continue;
    }

    console.log(`\n生成 ${TYPE_LABELS[codeType]} (${codeType}, ${CREDITS_MAP[codeType]}积分) × ${countPerType}...`);

    try {
      const { codes, result } = await generateBatch(codeType, countPerType);
      allCodes[codeType] = codes;

      console.log(`\n=== ${TYPE_LABELS[codeType]} (${codeType}, ${CREDITS_MAP[codeType]}积分) ===`);
      for (const c of codes) {
        console.log(formatCodeDisplay(c.code));
      }

      if (result.errors && result.errors.length > 0) {
        console.warn(`⚠️  ${result.errors.length} 个错误:`, result.errors);
      }
      console.log(`✅ 成功写入 ${result.inserted} 个`);
    } catch (e) {
      console.error(`❌ 生成 ${codeType} 失败:`, e.message);
    }
  }

  // ─── 写入本地文件 ──────────────────────────────────────────────────────────
  const fileName = `codes-${date}.txt`;
  const filePath = path.join(projectRoot, fileName);

  let fileContent = `DreamX 兑换码 - ${date}\n${"=".repeat(50)}\n\n`;
  let totalCount = 0;

  for (const codeType of types) {
    if (!allCodes[codeType]) continue;
    const credits = CREDITS_MAP[codeType];
    fileContent += `=== ${TYPE_LABELS[codeType]} (${codeType}, ${credits}积分) ===\n`;
    for (const c of allCodes[codeType]) {
      fileContent += `${formatCodeDisplay(c.code)}\n`;
      totalCount++;
    }
    fileContent += "\n";
  }

  fs.writeFileSync(filePath, fileContent, "utf-8");

  console.log("\n" + "=".repeat(50));
  console.log(`📊 共生成 ${totalCount} 个兑换码，已保存到 ${fileName}`);
}

main().catch((e) => {
  console.error("❌ 执行失败:", e.message);
  process.exit(1);
});
