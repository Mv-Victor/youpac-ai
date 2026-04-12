"use client"
import { useQuery } from 'convex/react'
import { api } from 'convex/_generated/api'
import { Link } from 'react-router'
import { Button } from '~/components/ui/button'
import { Navbar } from './navbar'
import VideoPlayer from '../VideoPlayer'

interface LoaderData {
    isSignedIn: boolean;
    initialStats?: {
        videosProcessed: number;
        agentsDeployed: number;
        activeAgents: number;
        projectsCreated: number;
        totalUsers: number;
        videosToday: number;
        agentsToday: number;
    } | null;
}

const SHOWCASE_VIDEOS = [
    {
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/qwen-naicha2.mp4",
        label: "AI 成片 - 千问奶茶事件 1",
    },
    {
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/operator.mp4",
        label: "openclaw 自部署效果",
    },
    {
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/qwen_naicha.mp4",
        label: "AI 成片 - 千问奶茶事件 2",
    },
];

export default function HeroSection({ loaderData }: { loaderData: LoaderData }) {
    const liveStats = useQuery(api.stats.getHeroStats);
    const stats = liveStats || loaderData.initialStats;

    return (
        <section className="relative overflow-hidden">
            {/* ── 呼吸背景光晕 (参考 dreamX-) ── */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div
                    className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full animate-breathe"
                    style={{ background: 'radial-gradient(circle, rgba(192,3,28,0.18) 0%, transparent 70%)' }}
                />
                <div
                    className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full animate-breathe"
                    style={{ background: 'radial-gradient(circle, rgba(255,77,77,0.13) 0%, transparent 70%)', animationDelay: '3s' }}
                />
                <div
                    className="absolute top-[30%] right-[20%] w-[40%] h-[40%] rounded-full animate-breathe"
                    style={{ background: 'radial-gradient(circle, rgba(192,3,28,0.10) 0%, transparent 60%)', animationDelay: '1.5s' }}
                />
            </div>

            <Navbar loaderData={loaderData} />
            <div className="relative z-10 pt-[4rem] px-[2rem]">
                {/* Hero Title Block */}
                <div className="text-center animate-fade-in">
                    <h1
                        className="mx-auto mt-16 max-w-3xl text-6xl lg:text-7xl xl:text-8xl text-balance font-black tracking-tight leading-none animate-hero-glow"
                        style={{ transform: 'skewX(-15deg) rotate(-5deg)', display: 'inline-block' }}
                    >
                        <span style={{
                            background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 40%, #C0031C 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            把你的静态图「玩」成爆款剪映工程
                        </span>
                    </h1>
                    <p className="text-muted-foreground mx-auto mb-6 mt-4 text-balance text-xl">
                        支持基于 openclaw 的龙虾自部署以及 Web 网页端体验
                    </p>
                    <div className="flex flex-col items-center gap-2 *:w-full sm:flex-row sm:justify-center sm:*:w-auto">
                        <Button asChild size="sm" variant="default">
                            <Link to={loaderData?.isSignedIn ? "/dashboard" : "/sign-up"}>
                                <span className="text-nowrap">立即体验</span>
                            </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                            <Link to="https://www.xiaohongshu.com/user/profile/69af9b54000000003303aceb" target="_blank" rel="noopener noreferrer">
                                <span className="text-nowrap">查看案例</span>
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                {/* {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8 mb-6 max-w-3xl mx-auto">
                        <div className="bg-card/70 backdrop-blur-sm border rounded-lg p-4 text-center transition-all hover:scale-105 hover:bg-card/70">
                            <div className="text-3xl text-balance font-medium">
                                {stats.videosProcessed.toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">成片已生成</div>
                        </div>
                        <div className="bg-card/70 backdrop-blur-sm border rounded-lg p-4 text-center transition-all hover:scale-105 hover:bg-card/70">
                            <div className="text-3xl text-balance font-medium">
                                {stats.agentsDeployed.toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">AI 流水线</div>
                        </div>
                        <div className="bg-card/70 backdrop-blur-sm border rounded-lg p-4 text-center transition-all hover:scale-105 hover:bg-card/70">
                            <div className="text-3xl text-balance font-medium">
                                {stats.projectsCreated.toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">项目已创建</div>
                        </div>
                    </div>
                )} */}

                {/* Pricing Section */}
                <div className="mt-16 mb-10">
                    <h2 className="text-center text-2xl font-semibold mb-2">定价方案</h2>
                    <p className="text-center text-muted-foreground text-sm mb-8">
                        选择适合你的积分套餐，联系我们开始创作爆款内容
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col items-center text-center">
                            <div className="text-sm text-muted-foreground mb-1">体验版</div>
                            <div className="text-3xl font-bold mb-1">¥9.9</div>
                            <div className="text-lg font-semibold text-primary mb-3">30 积分</div>
                            <div className="text-xs text-muted-foreground mb-4">适合初次体验，快速上手 DreamX</div>
                            <div className="text-xs text-muted-foreground mt-auto">获取兑换码请联系管理员</div>
                        </div>
                        <div className="rounded-xl border-2 border-primary bg-card/80 backdrop-blur-sm p-6 flex flex-col items-center text-center relative shadow-lg">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">推荐</div>
                            <div className="text-sm text-muted-foreground mb-1">VIP</div>
                            <div className="text-3xl font-bold mb-1">¥29.9</div>
                            <div className="text-lg font-semibold text-primary mb-3">150 积分</div>
                            <div className="text-xs text-muted-foreground mb-4">性价比最高，满足日常创作需求</div>
                            <div className="text-xs text-muted-foreground mt-auto">获取兑换码请联系管理员</div>
                        </div>
                        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col items-center text-center">
                            <div className="text-sm text-muted-foreground mb-1">SVIP</div>
                            <div className="text-3xl font-bold mb-1">¥79.9</div>
                            <div className="text-lg font-semibold text-primary mb-3">500 积分</div>
                            <div className="text-xs text-muted-foreground mb-4">超值大包，专业创作者首选</div>
                            <div className="text-xs text-muted-foreground mt-auto">获取兑换码请联系管理员</div>
                        </div>
                    </div>
                </div>

                {/* Showcases Section */}
                <div className="mt-14 mb-10">
                    <h2 className="text-center text-2xl font-semibold mb-2">Showcases</h2>
                    <p className="text-center text-muted-foreground text-sm mb-8">
                        真实 AI 营销视频案例，从静态图到剪映工程一键生成
                    </p>
                    {/* Masonry-style 3-column grid */}
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 max-w-5xl mx-auto space-y-0">
                        {SHOWCASE_VIDEOS.map((video, i) => (
                            <div
                                key={i}
                                className="break-inside-avoid mb-4 rounded-xl overflow-hidden border border-border bg-card/60 backdrop-blur-sm"
                            >
                                <VideoPlayer src={video.src} />
                                <div className="px-3 py-2">
                                    <p className="text-xs text-muted-foreground">{video.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
