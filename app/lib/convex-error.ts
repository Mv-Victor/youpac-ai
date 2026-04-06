/**
 * Convex 错误处理工具
 *
 * Convex 的 RPC 错误格式通常是：
 *   "Uncaught Error: <真正的错误描述>\n    at async handler (...)"
 *   或者
 *   "Could not complete mutation: ..." (schema validation 等)
 *
 * 本模块将这些原始错误转换成用户友好的中文提示。
 */

// ─── 已知错误的中文友好映射 ──────────────────────────────────────────────────────

const ERROR_MAP: Array<{ pattern: RegExp | string; message: string; description?: string }> = [
  // Auth
  { pattern: /Unauthorized/i, message: "请先登录", description: "当前操作需要登录后才能进行" },
  { pattern: /not found or unauthorized/i, message: "项目不存在或无权限", description: "请刷新页面后重试" },

  // Schema / validation
  { pattern: /does not match the schema/i, message: "数据格式错误", description: "请刷新页面后重试，若问题持续请联系支持" },
  { pattern: /Object contains extra field/i, message: "数据格式错误", description: "请刷新页面后重试，若问题持续请联系支持" },
  { pattern: /missing.*required field/i, message: "缺少必要数据", description: "请刷新页面后重试" },

  // Network / fetch
  { pattern: /Failed to fetch/i, message: "网络连接失败", description: "请检查网络后重试" },
  { pattern: /network/i, message: "网络错误", description: "请检查网络后重试" },
  { pattern: /timeout/i, message: "请求超时", description: "服务器响应超时，请稍后重试" },

  // Storage
  { pattern: /Failed to fetch media/i, message: "媒体文件下载失败", description: "无法下载媒体资源，请检查文件是否仍有效" },
  { pattern: /storage/i, message: "文件存储失败", description: "请重试，若问题持续请联系支持" },

  // TTS / AI
  { pattern: /DOUBAO|tts|TTS|voice/i, message: "语音合成失败", description: "TTS 接口暂时不可用，请稍后重试" },
  { pattern: /API key|api key|APIKEY/i, message: "API 配置错误", description: "请联系管理员检查 API 密钥配置" },
  { pattern: /rate limit|RateLimit|too many requests/i, message: "请求过于频繁", description: "请稍等片刻后重试" },
  { pattern: /分镜 Timeline 为空/i, message: "分镜数据为空", description: "请先完成分镜生成后再进行配音" },
  { pattern: /没有找到字幕文本/i, message: "没有字幕文本", description: "请先确认分镜节点已生成字幕内容" },

  // CapCut
  { pattern: /Failed to get download URL/i, message: "生成下载链接失败", description: "请重试" },
  { pattern: /Project not found/i, message: "项目不存在", description: "请刷新页面后重试" },
];

/**
 * 从 Convex 错误对象提取用户友好的错误描述
 *
 * 策略：
 * 1. 先尝试匹配已知错误模式 → 返回中文描述
 * 2. 提取 Convex 错误消息的第一行（去掉堆栈信息）
 * 3. 如果第一行包含 Convex 内部实现细节（schema/handler 等），屏蔽掉返回通用提示
 * 4. 兜底返回通用提示
 */
export function parseConvexError(error: unknown): { message: string; description?: string } {
  const raw = extractRawMessage(error);

  // 1. 已知错误模式匹配
  for (const { pattern, message, description } of ERROR_MAP) {
    const matches = typeof pattern === "string"
      ? raw.includes(pattern)
      : pattern.test(raw);
    if (matches) {
      return { message, description };
    }
  }

  // 2. 提取第一行（Convex 把堆栈附在换行后）
  const firstLine = raw.split("\n")[0].trim();

  // 3. 过滤掉 Convex 内部技术细节
  const isInternalDetail = (
    firstLine.includes("at async handler") ||
    firstLine.includes("at async ") ||
    firstLine.includes("convex/") ||
    firstLine.startsWith("Uncaught Error:") ||
    firstLine.startsWith("Uncaught TypeError:") ||
    firstLine.startsWith("Error:") && firstLine.includes("schema")
  );
  if (isInternalDetail) {
    return { message: "操作失败", description: "服务端发生错误，请刷新页面后重试" };
  }

  // 4. 第一行是干净的业务错误信息，直接使用
  if (firstLine && firstLine.length < 200) {
    return { message: firstLine };
  }

  // 5. 兜底
  return { message: "操作失败", description: "发生未知错误，请稍后重试" };
}

/** 从各种错误对象中提取原始消息字符串 */
function extractRawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    // Convex 把 HTTP 响应体塞在 message 里：通常格式为
    //   "Uncaught Error: xxx\n    at async handler..."
    // 也可能是 ConvexError.data.message
    const msg = error.message;
    const convexData = (error as any)?.data;
    if (convexData) {
      if (typeof convexData === "string") return convexData;
      if (typeof convexData?.message === "string") return convexData.message;
    }
    return msg;
  }
  if (error && typeof error === "object") {
    const e = error as any;
    if (e.message) return String(e.message);
    if (e.data?.message) return String(e.data.message);
  }
  return "未知错误";
}

/**
 * 快捷调用：直接返回给用户展示的单行消息字符串
 * 适用于简单的 toast.error(toUserMessage(e)) 场景
 */
export function toUserMessage(error: unknown): string {
  const { message, description } = parseConvexError(error);
  return description ? `${message}：${description}` : message;
}
