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
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/qwen-naicha2.mp4?q-sign-algorithm=sha1&q-ak=AKIDyyEpvVGtJcfNXZ15XVZvbJ7AkjVf9j8oVZjm0v3OwI2-jjBbKLiHmDJt9hXHn0op&q-sign-time=1775486039;1775489639&q-key-time=1775486039;1775489639&q-header-list=host&q-url-param-list=&q-signature=2655a39701e75647b347f1a091d5dbfc57b75809&x-cos-security-token=Kj7yRcFYXFMEsWLZwz7tTangmpu3kvba17f0a2b4463bed3149f8c8de5e305da9halMBpQ36H3v-Cg4kFTN2o6pWjr2XsaWkByeiuvCglDC4qzybGnAE73XwqVqDZ1OqF4yYG4OOeLqs8xpar-6OlJpYDeZqgK8eLWQV2GIi7q0rXXVTqRvBQGvK7nGjR_M3-MekHm2SKQzp3EttPn7YxwHx8FGxFHbeH_79tvBSPRoT3PVVKuExrg4EBpnVnWGwBlBpYYEWTGiup2dBJA3rjSLWVJDpWKqfqr0f26AJxW6vz3EmJrg03iNgGQ_6_8iGMR-WatttoER1kI0hAmspw&",
        label: "AI 成片 - 千问奶茶事件 1",
    },
    {
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/operator.mp4?q-sign-algorithm=sha1&q-ak=AKIDi3TOT5PZbVXCOGIvu1SG8oDaK75hTykkFbroaUuw08QHDKv1dGFb14c5Z3GXvq6K&q-sign-time=1775486025;1775489625&q-key-time=1775486025;1775489625&q-header-list=host&q-url-param-list=&q-signature=1b404bf894acc08ee141c2e79993fe29045abf51&x-cos-security-token=Q5qiHJEaDC7mToXnLZti4jSEs6pcF4dad7cc0bec79aa35e7e2c975a23103a67cUot7_6t7o-3goJELn7j6p-Sw4d53-HZpW9UPFFTf3jzBtegg8NrP1tLofcN1AbxpAyVQB2XqzL7OcmTXcrKY7-dXbApEYUjMPNvteo0N76Esk36UMJ3YOe-0hTXykAM1iBqqsfhBibw7rZVF3xnPz1Xde-_5ciYpYDBTSq_nhK-3cfVuQn9HYLcnX03U5ZpCsQZ20pAxK1Bseo2VWyCmJtiYNq9IHrJftTZ4VBgVLWHnbme2h5wyyURYBqQ6WLiIIY_V1jysiLzW4JowoGfysw&",
        label: "openclaw自部署效果",
    },
    {
        src: "https://dreamx-1301319986.cos.ap-shanghai.myqcloud.com/qwen_naicha.mp4?q-sign-algorithm=sha1&q-ak=AKIDVCxLWZ-PKssoVxCmCCE2Et-o0fBeQYWf5BVlhf4pXnRL44CpTGX5IwmVet2LGpqE&q-sign-time=1775486048;1775489648&q-key-time=1775486048;1775489648&q-header-list=host&q-url-param-list=&q-signature=53cd5dbff520ab91631c57f3a118a54ce9b96241&x-cos-security-token=Q5qiHJEaDC7mToXnLZti4jSEs6pcF4da084bbe1a1394376b0554ea4c49d89fb2Uot7_6t7o-3goJELn7j6p3s__A0PpG3sCBGBNSo6qQNkGD_ovAbcPNe8ZYrKz4KC3vT6sXZ6hf4P1KROE1QYkcTVmkIsDUAuQrWqmaRyBOkmzOTzPWN3UlQU0v_BPR83Ul9E45H1U1vDQFi0TKkSxNwSGjM3fJ_zL_fXov4ROfQskcVWc0HGprIeH-uiadk_eaE7XZp24TAOKOCwmylWuYAoS9yUCTq9UY4-QMZP0Z7o0K3AnDmmJ5hOPE1X69bVbJo5Ruk7gdPQzQ8jLLHQtg&",
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
