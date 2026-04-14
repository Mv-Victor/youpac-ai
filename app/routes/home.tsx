import { getAuth } from "@clerk/react-router/ssr.server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "convex/_generated/api";
import Footer from "~/components/homepage/footer";
import HeroSection from "~/components/homepage/hero-section";
import type { Route } from "./+types/home";

export function meta({ }: Route.MetaArgs) {
  const title = "DreamX - AI营销视频自动化生成平台";
  const description =
    "AI驱动的营销视频自动化生成系统。通过智能素材分析、表情包召回、BGM匹配、TTS语音生成、分镜脚本和成片导出，一键完成营销视频制作。";
  const keywords = "DreamX, AI视频, 营销视频, 自动化生成, 表情包, BGM, TTS, 分镜, 剪映, AI营销";
  const siteUrl = "https://dreamx.ai/";
  const imageUrl =
    "https://jdj14ctwppwprnqu.public.blob.vercel-storage.com/youtube-ai-assistant-og.png";

  return [
    { title },
    {
      name: "description",
      content: description,
    },

    // Open Graph / Facebook
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: imageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:url", content: siteUrl },
    { property: "og:site_name", content: "YouTube AI Assistant" },
    { property: "og:image", content: imageUrl },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    {
      name: "twitter:description",
      content: description,
    },
    { name: "twitter:image", content: imageUrl },
    {
      name: "keywords",
      content: keywords,
    },
    { name: "author", content: "YouTube AI Team" },
    { name: "favicon", content: "/youtube-ai-logo.png" },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  
  // Fetch initial stats from Convex
  const convexUrl = process.env.VITE_CONVEX_URL || "https://charming-bird-938.convex.cloud";
  const convex = new ConvexHttpClient(convexUrl);
  
  let initialStats = null;
  try {
    initialStats = await convex.query(api.stats.getHeroStats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    // Continue without stats if there's an error
  }

  return {
    isSignedIn: !!userId,
    initialStats,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <HeroSection loaderData={loaderData}/>
      <Footer />
    </>
  );
}
