import { Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { Plus, Calendar, MoreVertical, Clapperboard as DreamXIcon, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Page() {
  // ── DreamX AI 营销视频工作流 ────────────────────────────────────────────────
  const dxApi = api as any;
  const dreamXProjects = useQuery(dxApi.dreamXCanvas.listProjects, { includeArchived: false });
  const autopilotProjects = useQuery(dxApi.autopilot.getAutopilotProjects);
  const createDreamXProject = useMutation(dxApi.dreamXCanvas.createProject);
  const deleteDreamXProject = useMutation(dxApi.dreamXCanvas.deleteProject);
  const [isCreateDreamXOpen, setIsCreateDreamXOpen] = useState(false);
  const [newDreamXProject, setNewDreamXProject] = useState({ title: "", description: "" });

  const handleCreateDreamXProject = async () => {
    if (!newDreamXProject.title.trim()) {
      toast.error("DreamX 项目标题不能为空");
      return;
    }
    try {
      const id = await createDreamXProject({
        title: newDreamXProject.title,
        description: newDreamXProject.description || undefined,
      });
      toast.success("DreamX 项目创建成功！");
      setIsCreateDreamXOpen(false);
      setNewDreamXProject({ title: "", description: "" });
      window.location.href = `/dashboard/dreamx/${id}`;
    } catch {
      toast.error("创建失败，请重试");
    }
  };

  const handleDeleteDreamXProject = async (id: string) => {
    if (!confirm("确定要删除这个 DreamX 项目吗？此操作不可撤销。")) return;
    try {
      await deleteDreamXProject({ id: id as Id<"dreamXProjects"> });
      toast.success("项目已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* ── DreamX AI 营销视频工作流 ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500/20 to-red-500/20">
              <DreamXIcon className="h-4 w-4 text-rose-500" />
            </div>
            <h2 className="text-2xl font-bold">DreamX AI</h2>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 border border-rose-500/20">
              营销视频
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            AI 驱动的营销视频流水线：素材上传 → 表情包召回 → BGM召回 → 分镜脚本 → TTS配音 → CapCut 成片
          </p>
        </div>

        <Dialog open={isCreateDreamXOpen} onOpenChange={setIsCreateDreamXOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-rose-500/30 text-rose-600 hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-700 hover:shadow-md transition-all"
            >
              <Plus className="h-4 w-4 text-rose-500" />
              新建 DreamX 项目
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-lg bg-gradient-to-br from-rose-500/20 to-red-500/20">
                  <DreamXIcon className="h-5 w-5 text-rose-500" />
                </div>
                <DialogTitle>新建 DreamX 项目</DialogTitle>
              </div>
              <DialogDescription>
                创建一个新的 AI 营销视频项目，使用7步流水线自动生产 CapCut 工程
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="dx-title">项目标题 *</Label>
                <Input
                  id="dx-title"
                  placeholder="我的营销视频项目"
                  value={newDreamXProject.title}
                  onChange={(e) =>
                    setNewDreamXProject({ ...newDreamXProject, title: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dx-description">项目描述（可选）</Label>
                <Textarea
                  id="dx-description"
                  placeholder="简单描述这个视频要做什么..."
                  value={newDreamXProject.description}
                  onChange={(e) =>
                    setNewDreamXProject({ ...newDreamXProject, description: e.target.value })
                  }
                  className="resize-none h-20"
                />
              </div>
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                <p className="text-xs font-medium text-rose-600 mb-1">7步 AI 流水线</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {["素材上传", "文案", "表情包", "分镜", "BGM", "TTS", "CapCut"].map(
                    (step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">{step}</span>
                        {i < 6 && <span className="text-[11px] text-muted-foreground/50">→</span>}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDreamXOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleCreateDreamXProject}
                className="bg-gradient-to-r from-rose-500 to-red-600 hover:opacity-90"
              >
                <DreamXIcon className="h-4 w-4 mr-2" />
                创建并进入画布
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* DreamX projects grid */}
      {dreamXProjects === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-3 w-1/2 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : dreamXProjects.length === 0 ? (
        <Card className="border-dashed border-rose-500/20 bg-rose-500/5">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-500/20 mb-3">
              <DreamXIcon className="h-8 w-8 text-rose-500" />
            </div>
            <h3 className="text-base font-semibold mb-1">还没有 DreamX 项目</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-xs">
              创建第一个项目，让 AI 帮你自动化生产营销短视频
            </p>
            <Button
              onClick={() => setIsCreateDreamXOpen(true)}
              variant="outline"
              className="gap-2 border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-500/10 hover:shadow-md transition-all"
            >
              <Plus className="h-4 w-4 text-rose-500" />
              新建 DreamX 项目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(dreamXProjects as any[]).map((project: any) => {
            const ns = project.nodeStates;
            const NODES = ["mediaUpload", "memeRecall", "bgmRecall", "storyboard", "ttsSelection", "capcutBuild"];
            const completed = NODES.filter((k) => ns[k]?.status === "completed").length;
            const autopilotInfo = (autopilotProjects ?? []).find((p: any) => p.projectId === project._id);
            const isAutopilotEnabled = autopilotInfo && !autopilotInfo.failed;
            const isAutopilotFailed = autopilotInfo && autopilotInfo.failed;

            return (
              <Card
                key={project._id}
                className="group relative overflow-hidden border-rose-500/20 hover:border-rose-500/40 transition-all"
              >
                <Link to={`/dashboard/dreamx/${project._id}`} className="block">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-gradient-to-br from-rose-500/20 to-red-500/20 flex-shrink-0">
                            <DreamXIcon className="h-3.5 w-3.5 text-rose-500" />
                          </div>
                          <CardTitle className="line-clamp-1 text-base">
                            {project.title}
                          </CardTitle>
                          {isAutopilotEnabled && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 border border-violet-500/20 flex-shrink-0">
                              <Sparkles className="h-2.5 w-2.5 animate-pulse" />
                              托管中
                            </span>
                          )}
                          {isAutopilotFailed && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 border border-red-500/20 flex-shrink-0">
                              <Sparkles className="h-2.5 w-2.5" />
                              失败
                            </span>
                          )}
                        </div>
                        {project.description && (
                          <CardDescription className="line-clamp-1 text-xs">
                            {project.description}
                          </CardDescription>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteDreamXProject(project._id);
                            }}
                          >
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  <CardContent className="pb-3">
                    {/* 节点分开进度条 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">流水线进度</p>
                        <p className="text-[11px] font-medium text-rose-600">
                          {completed}/6 节点
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        {NODES.map((k) => (
                          <div
                            key={k}
                            className={`flex-1 h-1.5 rounded-full transition-colors ${
                              ns[k]?.status === "completed" ? "bg-rose-500"
                                : ns[k]?.status === "generating" ? "bg-rose-300 animate-pulse"
                                  : ns[k]?.status === "idle" ? "bg-muted-foreground/30"
                                    : "bg-muted/50"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Calendar className="mr-1 h-3 w-3" />
                      {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                    </div>
                  </CardFooter>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
