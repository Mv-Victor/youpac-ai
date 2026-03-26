# YouPac AI 部署指南

## 概述

YouPac AI 是一个 AI 驱动的 YouTube 内容创作助手，已配置为使用 **Anthropic API** 进行文本生成（标题、描述、推文），**OpenAI API** 为可选（仅用于 DALL-E 缩略图生成）。

## 环境配置

### 1. 复制环境变量文件

```bash
cp .env.local .env
```

### 2. 配置环境变量

`.env` 文件已预配置以下环境变量：

```bash
# Convex 配置
CONVEX_DEPLOYMENT=dev:opulent-okapi-228
VITE_CONVEX_URL=https://opulent-okapi-228.convex.cloud

# Clerk 认证
VITE_CLERK_PUBLISHABLE_KEY=pk_test_cm9tYW50aWMtcG9sbGl3b2ctOTIuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=sk_test_jnKHezyJi4DFEZYqP3De7tlgA2YGTLeix2KjzjzSyy

# Anthropic 配置（文本生成 - 必需）
ANTHROPIC_URL=http://xchai.xyz
ANTHROPIC_API_KEY=sk-KHIfZFZh5ke7U6mME6qUAizCxG1uZQfwbrKB9iq6ShB8ufpq

# OpenAI 配置（缩略图生成 - 可选）
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs 配置（语音转文字）
ELEVENLABS_API_KEY=sk_621e15c221e54f1b1a5a10dc36a97eb7acf36a1b21fa4ad4

# 前端 URL
FRONTEND_URL=http://localhost:5173
```

### 3. 在 Convex 仪表板中设置环境变量

访问 [Convex Dashboard](https://dashboard.convex.dev)，选择你的 deployment，然后设置以下环境变量：

- `ANTHROPIC_URL` = `http://xchai.xyz`
- `ANTHROPIC_API_KEY` = `sk-KHIfZFZh5ke7U6mME6qUAizCxG1uZQfwbrKB9iq6ShB8ufpq`
- `OPENAI_API_KEY` = （可选，仅用于缩略图生成）
- `ELEVENLABS_API_KEY` = `sk_621e15c221e54f1b1a5a10dc36a97eb7acf36a1b21fa4ad4`

## 安装依赖

```bash
npm install
```

## 开发模式

### 1. 启动 Convex 后端

```bash
npx convex dev
```

这将在后台运行 Convex 函数并监听文件变化。

### 2. 启动前端开发服务器

在另一个终端中：

```bash
npm run dev
```

应用将在 `http://localhost:5173` 上运行。

## 构建生产版本

```bash
npm run build
```

## 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 设置环境变量（与 Convex 相同）
4. 部署

## 功能说明

### ✅ 已配置功能

| 功能 | API 提供商 | 状态 |
|------|-----------|------|
| 标题生成 | Anthropic Claude | ✅ 已配置 |
| 描述生成 | Anthropic Claude | ✅ 已配置 |
| 推文生成 | Anthropic Claude | ✅ 已配置 |
| 聊天对话 | Anthropic Claude | ✅ 已配置 |
| 语音转文字 | ElevenLabs | ✅ 已配置 |
| 缩略图概念 | Anthropic Claude | ✅ 已配置 |
| 缩略图生成 | OpenAI DALL-E | ⚠️ 可选（需要 OPENAI_API_KEY） |

### 📝 代码修改摘要

以下文件已修改为使用 Anthropic API：

1. `convex/ai.ts` - 主要 AI 内容生成
2. `convex/aiHackathon.ts` - Hackathon 简化版生成
3. `convex/chat.ts` - 聊天对话功能
4. `convex/http.ts` - HTTP 流式聊天端点

以下文件保留使用 OpenAI（仅用于图像生成）：

1. `convex/thumbnail.ts` - DALL-E 缩略图生成
2. `convex/thumbnailGPTImage.ts` - GPT 图像编辑
3. `convex/thumbnailRefine.ts` - 缩略图优化
4. `app/lib/thumbnail-generator.ts` - 前端缩略图生成工具

## API 模型映射

| 原 OpenAI 模型 | 新 Anthropic 模型 | 用途 |
|---------------|------------------|------|
| gpt-4o-mini | claude-sonnet-4-20250514 | 文本生成 |
| gpt-4o | claude-sonnet-4-20250514 | 高质量文本生成 |
| DALL-E 3 | DALL-E 3（保留） | 图像生成 |

## 故障排除

### 问题：Anthropic API 调用失败

**解决方案：**
1. 检查 `ANTHROPIC_API_KEY` 是否正确
2. 检查 `ANTHROPIC_URL` 是否可访问
3. 查看 Convex 函数日志：`npx convex logs`

### 问题：缩略图生成失败

**解决方案：**
1. 如果不需要缩略图功能，可以忽略
2. 如需启用，设置 `OPENAI_API_KEY` 环境变量

### 问题：Clerk 认证失败

**解决方案：**
1. 检查 `VITE_CLERK_PUBLISHABLE_KEY` 和 `CLERK_SECRET_KEY`
2. 在 Clerk 仪表板检查域名配置

## 成本优化

- Anthropic Claude Sonnet 比 GPT-4o 更经济
- 文本生成默认使用 `claude-sonnet-4-20250514`
- 可根据需要调整 `maxTokens` 参数

## 技术支持

如有问题，请查看：
- [Convex 文档](https://docs.convex.dev)
- [Clerk 文档](https://clerk.com/docs)
- [Anthropic 文档](https://docs.anthropic.com)
