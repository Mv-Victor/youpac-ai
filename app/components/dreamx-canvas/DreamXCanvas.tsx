import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Film } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { PIPELINE_CONFIG, PIPELINE, NODE_POSITIONS } from "./nodes/pipeline.config";
import { toUserMessage } from "~/lib/convex-error";
import { CreditsProvider, useCredits } from "~/contexts/CreditsContext";
import { AutopilotSwitch } from "./AutopilotSwitch";

type DreamXProjectId = Id<"dreamXProjects">;

function InnerDreamXCanvas({
  projectId,
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
}: {
  projectId: DreamXProjectId;
  ReactFlow: React.ComponentType<any>;
  ReactFlowProvider: React.ComponentType<any>;
  Background: React.ComponentType<any>;
  Controls: React.ComponentType<any>;
  useNodesState: (nodes: any[]) => any;
  useEdgesState: (edges: any[]) => any;
  useReactFlow: () => any;
}) {
  const dxApi = api as any;

  const project = useQuery(dxApi.dreamXCanvas.getProject, { id: projectId });
  const { balance, nodeCosts, autopilotEnabled, setAutopilotEnabled } = useCredits();

  const completeMediaUpload   = useMutation(dxApi.dreamXCanvas.completeMediaUpload);
  const completeMemeRecall    = useMutation(dxApi.dreamXCanvas.completeMemeRecall);
  const completeBgmRecall     = useMutation(dxApi.dreamXCanvas.completeBgmRecall);
  const completeStoryboard    = useMutation(dxApi.dreamXCanvas.completeStoryboard);
  const completeTTSSelection  = useMutation(dxApi.dreamXCanvas.completeTTSSelection);
  const resetFromNode         = useMutation(dxApi.dreamXCanvas.resetFromNode);
  const deductCredits         = useMutation(dxApi.credits.deductCredits);
  const updateNodeState       = useMutation(dxApi.dreamXCanvas.updateNodeState);
  const generateUploadUrl     = useMutation(dxApi.dreamXCanvas.generateUploadUrl);
  const addUserMedia          = useMutation(dxApi.dreamXMedia.addUserMedia);
  const updateSubtitleText     = useMutation(dxApi.dreamXCanvas.updateSubtitleText);
  const deleteSubtitle          = useMutation(dxApi.dreamXCanvas.deleteSubtitle);
  const saveBgmTiming          = useMutation(dxApi.dreamXCanvas.saveBgmTiming);

  const generateCopywriting     = useAction(dxApi.dreamXAI.generateCopywriting);
  const generateStoryboard      = useAction(dxApi.dreamXAI.generateStoryboard);
  const analyzeMediaBatch       = useAction(dxApi.dreamXAI.analyzeMediaBatch);
  const suggestMemeInsertions   = useAction(dxApi.dreamXAI.suggestMemeInsertions);
  const analyzeMemeImage        = useAction(dxApi.dreamXAI.analyzeMemeImage);
  const generateTTSAudio          = useAction(dxApi.dreamXAI.generateTTSAudio);
  const generateTTSPerSegment     = useAction(dxApi.dreamXAI.generateTTSPerSegment);
  const patchStoryboardVoiceTracks = useMutation(dxApi.dreamXCanvas.patchStoryboardVoiceTracks);
  const rebalanceStoryboardDurations = useAction(dxApi.dreamXAI.rebalanceStoryboardDurations);
  const buildCapcutProject   = useAction(dxApi.capcutBuilder.buildCapcutProject);
  const getStorageFileUrl    = useAction(dxApi.dreamXCanvas.getStorageFileUrl);

  // emotionTags 现在存在 mediaUpload 节点（分析时一起生成）
  const emotionTags = useMemo(() => {
    const ns = project?.nodeStates as any;
    return ns?.mediaUpload?.emotionTags ?? ns?.copywriting?.emotionTags ?? [];
  }, [project]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const ns = project?.nodeStates as any;
    if (!ns) return;
    if (ns.capcutBuild?.status === "completed") {
      if (document.hidden) {
        try {
          new Notification("DreamX 成片完成！", {
            body: "CapCut 工程文件已生成，可以下载了。",
            icon: "/favicon.ico",
          });
        } catch {}
      }
      if (autopilotEnabled) {
        setAutopilotEnabled(false);
        toast.success("AI 托管已完成整个流程，已自动关闭");
      }
    }
  }, [(project?.nodeStates as any)?.capcutBuild?.status]);

  // 分镜节点：idle 时自动触发生成（带积分余额预检）
  const storyboardAutoTriggeredRef = useRef(false);
  useEffect(() => {
    const ns = project?.nodeStates as any;
    if (!ns) return;
    if (ns.storyboard?.status === "idle" && !storyboardAutoTriggeredRef.current && !autopilotEnabled) {
      // 余额预检：积分不足时不自动触发，提示用户
      const storyboardCost = nodeCosts["storyboard"] ?? 3;
      if (balance !== undefined && balance < storyboardCost) {
        toast.error(`积分不足（需要 ${storyboardCost} 积分），无法自动生成分镜，请前往兑换码页面充值`);
        return;
      }
      storyboardAutoTriggeredRef.current = true;
      // 自动触发 generateStoryboard
      const images = ns.mediaUpload?.images?.map((i: any) => ({ url: i.url, fileName: i.fileName })) ?? [];
      const selectedMemes = ns.memeRecall?.selectedMemes ?? [];
      updateNodeState({ id: projectId, nodeKey: "storyboard", patch: { status: "generating" } }).then(() => {
        generateStoryboard({ projectId, images, selectedMemes }).catch((e: any) => {
          updateNodeState({ id: projectId, nodeKey: "storyboard", patch: { status: "error", errorMessage: e.message ?? "生成失败" } });
        });
      });
    }
    // 如果 storyboard 不再是 idle（可能被 reset），允许再次触发
    if (ns.storyboard?.status !== "idle" && ns.storyboard?.status !== "generating") {
      storyboardAutoTriggeredRef.current = false;
    }
  }, [(project?.nodeStates as any)?.storyboard?.status, balance]);

  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [analysisProgress, setAnalysisProgress] = useState<{ stage: string; percent: number }>({ stage: "", percent: 0 });

  type ChatMsg = { id: string; role: "user" | "ai"; content: string; timestamp: number };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [chatInitialValue, setChatInitialValue] = useState("");
  const chatWithMediaAgent = useAction(dxApi.dreamXAI.chatWithMediaAgent);

  const handleOpenChat = useCallback(() => {
    setChatInitialValue("@MEDIA_AGENT ");
  }, []);

  const handleChatMessage = useCallback(async (message: string) => {
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: message, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatGenerating(true);
    try {
      if (project) {
        const images = (project.nodeStates.mediaUpload as any)?.images ?? [];
        const reply = await chatWithMediaAgent({
          message,
          imageUrls: images.map((i: any) => i.url),
          aiAnalysis: (project.nodeStates.mediaUpload as any).aiAnalysis,
          eventDescription: (project.nodeStates.mediaUpload as any).eventDescription,
          chatHistory: chatMessages.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
        });
        setChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "ai", content: reply, timestamp: Date.now() }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "ai", content: "AI 回复失败", timestamp: Date.now() }]);
    } finally {
      setIsChatGenerating(false);
    }
  }, [project, chatMessages, chatWithMediaAgent]);

  useEffect(() => {
    const ns = project?.nodeStates as any;
    if (ns?.mediaUpload?.aiAnalysis && analysisStatus === "idle") {
      setAnalysisStatus("ready");
    }
  }, [(project?.nodeStates as any)?.mediaUpload?.aiAnalysis]);

  const [memeShuffleSeed, setMemeShuffleSeed] = useState(0);
  const [bgmShuffleSeed, setBgmShuffleSeed] = useState(0);

  const suggestedMemes = useQuery(
    dxApi.dreamXMedia.getSuggestedMemes,
    emotionTags.length > 0 ? { emotionTags, shuffleSeed: memeShuffleSeed } : "skip"
  );
  const suggestedBgms = useQuery(
    dxApi.dreamXMedia.getSuggestedBgms,
    emotionTags.length > 0 ? { emotionTags, limit: 5, shuffleSeed: bgmShuffleSeed } : "skip"
  );

  const buildNodeData = useCallback(
    (proj: NonNullable<typeof project>, nodeKey: string) => {
      const ns = proj.nodeStates as any;
      const nodeState = ns[nodeKey];
      const isReadOnly = nodeState?.status === "completed";

      const onReset = async () => {
        try {
          if (nodeKey === "storyboard") {
            const imageCount = (ns.mediaUpload?.images?.length ?? 0) as number;
            await deductCredits({
              nodeType: "storyboard",
              imageCount,
              projectId,
              description: "重置分镜脚本",
            });
          }
          await resetFromNode({ id: projectId, fromNodeKey: nodeKey as any });
          storyboardAutoTriggeredRef.current = false;
          toast.success(`已重置到「${PIPELINE_CONFIG.find((c) => c.key === nodeKey)?.label}」节点`);
        } catch (e) {
          toast.error(`重置失败：${toUserMessage(e)}`);
        }
      };

      const base = { projectId, nodeState, allNodeStates: ns, isReadOnly, onReset };

      // ─── 素材上传节点 ──────────────────────────────────────────────────────
      if (nodeKey === "mediaUpload") {
        const handleUploadFiles = async (newImageFiles: File[], description: string, existingImages?: Array<{ url: string; fileName: string; storageId: string }>) => {
          try {
            const imageData: Array<{ storageId: Id<"_storage">; url: string; fileName: string }> = [];
            for (const file of newImageFiles) {
              const uploadUrl: string = await generateUploadUrl({});
              const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
              if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
              const { storageId } = await res.json() as { storageId: string };
              const convexUrl = await getStorageFileUrl({ storageId: storageId as any });
              if (!convexUrl) throw new Error("Failed to get file URL");
              imageData.push({ storageId: storageId as any, url: convexUrl, fileName: file.name });
            }
            // 合并已有图片（existingImages）+ 新上传的
            const prevImages = (existingImages ?? []).map((img) => ({
              storageId: img.storageId as Id<"_storage">,
              url: img.url,
              fileName: img.fileName,
            }));
            const allImages = [...prevImages, ...imageData];
            // 先保存图片（状态 generating）
            await updateNodeState({ id: projectId, nodeKey: "mediaUpload", patch: { images: allImages, eventDescription: description, status: "generating" } });
            toast.success("素材上传完成！正在 AI 分析素材...");
            setAnalysisStatus("generating");
            setAnalysisProgress({ stage: "正在分析素材内容...", percent: 30 });
            // 触发分析（后端会自动更新状态）
            try {
              const analysis = await analyzeMediaBatch({ imageUrls: allImages.map((i) => i.url), eventDescription: description || undefined, projectId });
              // 后端已自动保存结果，这里只更新本地UI状态
              setAnalysisProgress({ stage: "分析完成", percent: 100 });
              setAnalysisStatus("ready");
              toast.success("分析完成！请确认分析结果后继续");
            } catch (e) {
              setAnalysisStatus("error");
              // 错误状态也由后端更新，这里只是本地UI
              toast.error(`AI 分析失败：${toUserMessage(e)}`);
            }
          } catch (e) {
            toast.error(`上传失败：${toUserMessage(e)}`);
          }
        };

        const handleGenerateAnalysis = async () => {
          const images = ns.mediaUpload?.images ?? [];
          if (!images.length) return;
          setAnalysisStatus("generating");
          setAnalysisProgress({ stage: "正在重新分析素材内容...", percent: 30 });
          await updateNodeState({ id: projectId, nodeKey: "mediaUpload", patch: { status: "generating" } });
          try {
            const analysis = await analyzeMediaBatch({ imageUrls: images.map((i: any) => i.url), eventDescription: ns.mediaUpload?.eventDescription || undefined, projectId });
            // 后端已自动保存结果，这里只更新本地UI
            setAnalysisProgress({ stage: "分析完成", percent: 100 });
            setAnalysisStatus("ready");
            toast.success("重新分析完成！");
          } catch (e) {
            setAnalysisStatus("error");
            // 错误状态也由后端更新，这里只是本地UI
            toast.error(`重新分析失败：${toUserMessage(e)}`);
          }
        };

        const handleConfirmAnalysis = async (editedAnalysis: string, emotionTagsEdited: string[]) => {
          try {
            // 用户确认分析结果，触发 completeMediaUpload
            await completeMediaUpload({
              id: projectId,
              images: ns.mediaUpload?.images ?? [],
              eventDescription: ns.mediaUpload?.eventDescription ?? "",
              aiAnalysis: editedAnalysis,
              emotionTags: emotionTagsEdited,
            });
            // 同时在后台静默触发 generateCopywriting（供 meme/bgm recall 推荐用）
            generateCopywriting({
              projectId,
              eventDescription: ns.mediaUpload?.eventDescription ?? "",
              imageDescriptions: ns.mediaUpload?.images?.map((i: any) => i.aiDescription ?? "") ?? [],
              imageCount: ns.mediaUpload?.images?.length ?? 1,
              moodPreference: ns.mediaUpload?.moodPreference,
            }).catch(() => {}); // 静默，不影响主流程
            toast.success("分析结果已确认！表情包召回节点已解锁");
          } catch (e) {
            toast.error(`保存失败：${toUserMessage(e)}`);
          }
        };

        return {
          ...base,
          images: ns.mediaUpload?.images,
          eventDescription: ns.mediaUpload?.eventDescription,
          aiAnalysis: ns.mediaUpload?.aiAnalysis,
          emotionTags: ns.mediaUpload?.emotionTags ?? [],
          analysisStatus,
          analysisProgress,
          onUploadFiles: handleUploadFiles,
          onGenerateAnalysis: handleGenerateAnalysis,
          onConfirmAnalysis: handleConfirmAnalysis,
          onOpenChat: handleOpenChat,
        };
      }

      // ─── 表情包召回节点 ──────────────────────────────────────────────────────
      if (nodeKey === "memeRecall") {
        const handleConfirmMemeSelection = async (selectedMemes: any[]) => {
          try {
            await completeMemeRecall({ id: projectId, selectedMemes });
            toast.success("表情包选择完成！BGM 节点已解锁");
          } catch (e) {
            toast.error(`保存失败：${toUserMessage(e)}`);
          }
        };
        const handleUploadMeme = async (file: File) => {
          try {
            const uploadUrl: string = await generateUploadUrl({});
            const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            const { storageId } = await res.json() as { storageId: string };
            const url = await getStorageFileUrl({ storageId: storageId as any });
            if (!url) throw new Error("Failed to get file URL");
            // AI 自动分析图片 mood
            const mood = await analyzeMemeImage({ imageUrl: url });
            await addUserMedia({ type: "meme", name: file.name.replace(/\.\w+$/, ""), mood, url, storageId: storageId as any });
            toast.success("表情包上传成功！");
            return { url, name: file.name.replace(/\.\w+$/, ""), mood };
          } catch (e) {
            toast.error(`上传失败：${toUserMessage(e)}`);
          }
        };
        const handleReRecallMemes = () => setMemeShuffleSeed((s) => s + 1);

        const allSuggestedMemes = suggestedMemes ?? ns.memeRecall?.suggestedMemes ?? [];
        const imageUrls = (ns.mediaUpload?.images ?? []).map((i: any) => i.url);
        return {
          ...base,
          suggestedMemes: allSuggestedMemes,
          selectedMemes: ns.memeRecall?.selectedMemes,
          imageCount: ns.mediaUpload?.images?.length ?? 0,
          imageUrls,
          onConfirmSelection: handleConfirmMemeSelection,
          onUploadMeme: handleUploadMeme,
          onReRecall: handleReRecallMemes,
          onSuggestInsertions: (args: any) => suggestMemeInsertions({ ...args, projectId }),
        };
      }

      // ─── BGM 召回节点 ──────────────────────────────────────────────────────
      if (nodeKey === "bgmRecall") {
        const handleConfirmBgm = async (bgm: any) => {
          try {
            await completeBgmRecall({ id: projectId, selectedBgm: bgm });
            toast.success("BGM 选择完成！分镜节点已解锁（自动生成中）");
          } catch (e) {
            toast.error(`保存失败：${toUserMessage(e)}`);
          }
        };
        const handleSkipBgm = async () => {
          try {
            await completeBgmRecall({ id: projectId, skipped: true });
            toast.success("跳过 BGM，分镜节点已解锁（自动生成中）");
          } catch (e) {
            toast.error(`操作失败：${toUserMessage(e)}`);
          }
        };
        const handleUploadBgm = async (file: File, mood: string) => {
          try {
            const uploadUrl: string = await generateUploadUrl({});
            const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            const { storageId } = await res.json() as { storageId: string };
            const url = await getStorageFileUrl({ storageId: storageId as any });
            if (!url) throw new Error("Failed to get file URL");
            await addUserMedia({ type: "bgm", name: file.name, mood, url, storageId: storageId as any });
            toast.success("BGM 上传成功！");
          } catch (e) {
            toast.error(`上传失败：${toUserMessage(e)}`);
          }
        };
        const handleReRecallBgms = () => setBgmShuffleSeed((s) => s + 1);

        return {
          ...base,
          suggestedBgms: suggestedBgms ?? ns.bgmRecall?.suggestedBgms ?? [],
          selectedBgm: ns.bgmRecall?.selectedBgm,
          onConfirmBgm: handleConfirmBgm,
          onUploadBgm: handleUploadBgm,
          onSkipBgm: handleSkipBgm,
          onReRecall: handleReRecallBgms,
        };
      }

      // ─── 分镜脚本节点（自动生成，不需要手动按钮）──────────────────────────
      if (nodeKey === "storyboard") {
        const handleRegenerateStoryboard = async () => {
          try {
            storyboardAutoTriggeredRef.current = false;
            await updateNodeState({ id: projectId, nodeKey: "storyboard", patch: { status: "idle" } });
          } catch (e) {
            toast.error(`重新生成失败：${toUserMessage(e)}`);
          }
        };
        const handleSaveTimeline = async (timeline: any[], totalDurationMs: number) => {
          try {
            await completeStoryboard({ id: projectId, timeline, totalDurationMs });
          } catch (e) {
            toast.error(`保存失败：${toUserMessage(e)}`);
          }
        };
        const handleSaveBgmTiming = async (startMs: number, durationMs: number) => {
          try {
            await saveBgmTiming({ id: projectId, startMs, durationMs });
          } catch (e) {
            toast.error(`BGM 时间保存失败：${toUserMessage(e)}`);
          }
        };
        const handleDeleteSubtitleInStoryboard = async (tiIdx: number, subIdx: number) => {
          try {
            await deleteSubtitle({ projectId, tiIdx, subIdx });
          } catch (e) {
            toast.error(`删除字幕失败：${toUserMessage(e)}`);
          }
        };
        return {
          ...base,
          timeline: ns.storyboard?.timeline,
          totalDurationMs: ns.storyboard?.totalDurationMs,
          errorMessage: ns.storyboard?.errorMessage,
          selectedBgm: ns.bgmRecall?.selectedBgm,
          // TTS 已完成后禁止在分镜节点双击编辑字幕（配音已固定，改文字会造成配音与字幕不匹配）
          subtitleEditable: ns.ttsSelection?.status !== "completed",
          onRegenerate: handleRegenerateStoryboard,
          onSaveTimeline: handleSaveTimeline,
          onSaveBgm: handleSaveBgmTiming,
          onDeleteSubtitle: handleDeleteSubtitleInStoryboard,
        };
      }

      // ─── TTS 选择节点 ──────────────────────────────────────────────────────
      if (nodeKey === "ttsSelection") {
        const handleSaveRecommendedVoices = async (voices: any[]) => {
          try {
            await updateNodeState({ id: projectId, nodeKey: "ttsSelection", patch: { recommendedVoices: voices } });
          } catch {}
        };

        // 逐段生成 TTS：按 storyboard.timeline 每条字幕分别合成，段数与字幕段数严格对齐
        // 辅助函数：计算当前 timeline 所有字幕文本的快照（用于判断是否被编辑）
        const computeSubtitleSnapshot = (timeline: any[]): string => {
          return timeline
            .flatMap((item: any, i: number) =>
              (item.subtitles ?? []).map((sub: any, j: number) => `${i}_${j}:${sub.text.trim()}`)
            )
            .join("|");
        };

        const handleGenerateTTSPerSegment = async (voiceType: string) => {
          try {
            const timeline = ns.storyboard?.timeline as any[] | undefined;
            if (!timeline?.length) throw new Error("分镜 Timeline 为空，无法生成配音");
            const segments: Array<{ itemIdx: number; subIdx: number; text: string }> = [];
            timeline.forEach((item: any, i: number) => {
              const subs = (item.subtitles ?? []) as Array<{ text: string; startMs: number; durationMs: number }>;
              subs.forEach((sub, j) => {
                const text = sub.text.trim();
                if (text) segments.push({ itemIdx: i, subIdx: j, text });
              });
            });
            if (!segments.length) throw new Error("没有找到字幕文本，请先确认分镜节点有字幕内容");

            // ── 判断字幕是否被用户编辑过 ──────────────────────────────────────
            // 对比当前字幕文本快照与上次生成 TTS 时保存的快照
            const currentSnapshot = computeSubtitleSnapshot(timeline);
            const lastSnapshot = ns.ttsSelection?.subtitleSnapshot as string | undefined;
            const subtitlesChanged = !!lastSnapshot && lastSnapshot !== currentSnapshot;

            await updateNodeState({ id: projectId, nodeKey: "ttsSelection", patch: { status: "generating" } });

            if (subtitlesChanged) {
              // 字幕有改动：先让 AI 重新计算分镜时长，确保每段字幕画面时长 ≥ 配音时长
              toast.info("检测到字幕已修改，正在重新编排分镜时长…", { duration: 3000 });
              try {
                await rebalanceStoryboardDurations({ projectId });
              } catch (rebalanceErr) {
                // rebalance 失败不阻断 TTS 生成，仅记录警告
                console.warn("[rebalance] 分镜时长重算失败，将继续使用原时长生成配音：", rebalanceErr);
              }
            }

            // 每条字幕以 itemIdx * 100000 + subIdx 作为全局索引传入
            const segmentsForAPI = segments.map((s) => ({
              itemIdx: s.itemIdx * 100000 + s.subIdx,
              text: s.text,
            }));
            const result = await generateTTSPerSegment({
              projectId,
              voiceType,
              segments: segmentsForAPI,
              subtitlesChanged,
              imageCount: ns.mediaUpload?.images?.length ?? 0,
            });
            const voice = ns.ttsSelection?.recommendedVoices?.find((v: any) => v.voiceType === voiceType);
            await completeTTSSelection({
              id: projectId,
              selectedVoiceType: voiceType,
              selectedVoiceName: voice?.name ?? voiceType,
              audioUrl: "",
              audioDurationMs: 0,
              subtitleSnapshot: currentSnapshot,  // 保存本次字幕快照，下次对比用
            });
            toast.success(`配音生成完成（共 ${(result as any).count} 段），已写入分镜时间轴！`);
          } catch (e) {
            const ttsErrMsg = toUserMessage(e);
            await updateNodeState({ id: projectId, nodeKey: "ttsSelection", patch: { status: "error", errorMessage: ttsErrMsg } });
            toast.error(`配音生成失败：${ttsErrMsg}`);
          }
        };

        const handleSkipTTS = async () => {
          try {
            await completeTTSSelection({
              id: projectId,
              selectedVoiceType: "skip",
              selectedVoiceName: "跳过",
              audioUrl: "",
              audioDurationMs: 0,
              skipped: true,
            });
            toast.success("已跳过 TTS，CapCut 节点已解锁");
          } catch (e) {
            toast.error(`操作失败：${toUserMessage(e)}`);
          }
        };

        // 重新召回：重置状态为 idle，让节点重新触发声音匹配
        const handleReRecallTTS = async () => {
          try {
            await updateNodeState({ id: projectId, nodeKey: "ttsSelection", patch: { status: "idle", recommendedVoices: [] } });
          } catch (e) {
            toast.error(`重新召回失败：${toUserMessage(e)}`);
          }
        };

        // 逐段信息：按每条字幕展开（供 UI 分行展示 + 生成用），携带 tiIdx/subIdx 供编辑回调
        const segments = (() => {
          const timeline = ns.storyboard?.timeline as any[] | undefined;
          if (!timeline?.length) return [];
          const result: Array<{ itemIdx: number; tiIdx: number; subIdx: number; text: string }> = [];
          timeline.forEach((item: any, i: number) => {
            const subs = (item.subtitles ?? []) as Array<{ text: string }>;
            subs.forEach((sub, j) => {
              const text = sub.text.trim();
              if (text) result.push({ itemIdx: i * 100000 + j, tiIdx: i, subIdx: j, text });
            });
          });
          return result;
        })();
        const segmentCount = segments.length;

        const handleUpdateSubtitleText = async (tiIdx: number, subIdx: number, text: string) => {
          await updateSubtitleText({ projectId, tiIdx, subIdx, text });
        };
        const handleDeleteSubtitleInTTS = async (tiIdx: number, subIdx: number) => {
          try {
            await deleteSubtitle({ projectId, tiIdx, subIdx });
          } catch (e) {
            toast.error(`删除字幕失败：${toUserMessage(e)}`);
          }
        };

        return {
          ...base,
          emotionTags: ns.mediaUpload?.emotionTags ?? ns.copywriting?.emotionTags ?? [],
          segments,
          segmentCount,
          recommendedVoices: ns.ttsSelection?.recommendedVoices,
          selectedVoiceType: ns.ttsSelection?.selectedVoiceType,
          audioUrl: ns.ttsSelection?.audioUrl,
          audioDurationMs: ns.ttsSelection?.audioDurationMs,
          errorMessage: ns.ttsSelection?.errorMessage,
          onSaveRecommendedVoices: handleSaveRecommendedVoices,
          onGenerateTTS: handleGenerateTTSPerSegment,
          onSkipTTS: handleSkipTTS,
          onReRecall: handleReRecallTTS,
          onUpdateSubtitleText: handleUpdateSubtitleText,
          onDeleteSubtitle: handleDeleteSubtitleInTTS,
        };
      }

      // ─── CapCut 成片节点 ──────────────────────────────────────────────────
      if (nodeKey === "capcutBuild") {
        const handleBuild = async () => {
          try {
            await buildCapcutProject({ projectId });
            toast.success("CapCut 工程文件生成成功！");
          } catch (e) {
            toast.error(`生成失败：${toUserMessage(e)}`);
          }
        };
        const handleRebuild = async () => {
          await updateNodeState({ id: projectId, nodeKey: "capcutBuild", patch: { status: "idle", downloadUrl: undefined, storageId: undefined } });
        };
        return {
          ...base,
          downloadUrl: ns.capcutBuild?.downloadUrl,
          projectName: ns.capcutBuild?.projectName ?? proj.title,
          errorMessage: ns.capcutBuild?.errorMessage,
          onBuild: handleBuild,
          onRebuild: handleRebuild,
        };
      }

      return base;
    },
    [projectId, suggestedMemes, suggestedBgms, analysisStatus, analysisProgress, suggestMemeInsertions, analyzeMemeImage]
  );

  const visibleNodeKeys = useMemo(() => {
    if (!project) return [];
    const ns = project.nodeStates as any;
    return PIPELINE.filter((key) => {
      const nodeState = ns[key];
      if (!nodeState) return false;
      return nodeState.status !== "locked";
    });
  }, [project]);

  const buildNodes = useCallback(
    (proj: NonNullable<typeof project>) => {
      return visibleNodeKeys.map((key) => ({
        id: key,
        type: `${key}Node`,
        position: NODE_POSITIONS[key] ?? { x: 0, y: 0 },
        data: buildNodeData(proj, key),
      }));
    },
    [visibleNodeKeys, buildNodeData]
  );

  const buildEdges = useCallback((visibleKeys: string[]) => {
    const edgeStyle = { stroke: "#7c3aed", strokeWidth: 2 };
    const edges = [];
    for (let i = 0; i < visibleKeys.length - 1; i++) {
      const src = visibleKeys[i];
      const tgt = visibleKeys[i + 1];
      edges.push({
        id: `dx-e-${src}-${tgt}`,
        source: src, sourceHandle: "dx-out",
        target: tgt, targetHandle: "dx-in",
        style: edgeStyle, animated: true,
      });
    }
    return edges;
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!project) return;
    const newNodes = buildNodes(project);
    setNodes(newNodes);
    setEdges(buildEdges(visibleNodeKeys));
  }, [project, buildNodes, buildEdges, visibleNodeKeys, setNodes, setEdges]);

  const rfInstanceRef = useRef<any>(null);
  const prevVisibleLengthRef = useRef(0);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!rfInstanceRef.current || visibleNodeKeys.length === 0) return;
    if (!isInitializedRef.current) return;

    if (visibleNodeKeys.length > prevVisibleLengthRef.current) {
      const latestKey = visibleNodeKeys[visibleNodeKeys.length - 1];
      const pos = NODE_POSITIONS[latestKey];
      if (!pos) return;
      const timer = setTimeout(() => {
        try {
          rfInstanceRef.current.setCenter(pos.x + 200, pos.y + 200, { zoom: 1.3, duration: 800 });
        } catch {}
      }, 100);
      return () => clearTimeout(timer);
    }
    prevVisibleLengthRef.current = visibleNodeKeys.length;
  }, [visibleNodeKeys]);

  useEffect(() => {
    if (!rfInstanceRef.current || visibleNodeKeys.length === 0 || isInitializedRef.current) return;
    const ns = project?.nodeStates as any;
    if (!ns) return;

    const timer = setTimeout(() => {
      const activeKey = visibleNodeKeys.find(
        (key) => ns[key]?.status === "idle" || ns[key]?.status === "generating"
      ) ?? visibleNodeKeys[visibleNodeKeys.length - 1];
      const pos = NODE_POSITIONS[activeKey];
      if (!pos) return;
      try {
        rfInstanceRef.current.setCenter(pos.x + 200, pos.y + 200, { zoom: 1.3, duration: 800 });
      } catch {}
      isInitializedRef.current = true;
      prevVisibleLengthRef.current = visibleNodeKeys.length;
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes.length > 0]);

  const [nodeTypes, setNodeTypes] = useState<Record<string, React.ComponentType<any>>>({});
  const [nodeTypesLoaded, setNodeTypesLoaded] = useState(false);
  useEffect(() => {
    Promise.all(
      PIPELINE_CONFIG.map(async (cfg) => {
        const mod = await cfg.load();
        return [cfg.nodeType, ({ data }: { data: any }) => {
          const Comp = mod.default;
          return <Comp data={data} />;
        }] as const;
      })
    ).then((entries) => {
      setNodeTypes(Object.fromEntries(entries));
      setNodeTypesLoaded(true);
    });
  }, []);

  if (!project || !nodeTypesLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中…
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onInit={(instance: any) => { rfInstanceRef.current = instance; }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background gap={20} size={1} color="hsl(var(--border))" style={{ pointerEvents: "none" }} />
          <Controls className="!bg-background !border-border/50" />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

// 从 AI 分析结果中提取情绪标签
function extractEmotionTags(analysis: string): string[] {
  const EMOTION_OPTIONS = ["搞笑", "震惊", "励志", "伤感", "日常", "可爱", "委屈", "愤怒", "欢快"];
  const tagSection = analysis.match(/【情绪标签】\s*([\s\S]*?)(?:\n\n|$)/);
  if (!tagSection) {
    // fallback：直接匹配文中出现的标签词
    return EMOTION_OPTIONS.filter((tag) => analysis.includes(tag));
  }
  return EMOTION_OPTIONS.filter((tag) => tagSection[1].includes(tag));
}

interface DreamXCanvasProps {
  projectId: string;
}

export default function DreamXCanvas({ projectId }: DreamXCanvasProps) {
  const dxApi = api as any;
  const project = useQuery(dxApi.dreamXCanvas.getProject, { id: projectId as DreamXProjectId });
  const hasMedia = ((project?.nodeStates as any)?.mediaUpload?.images?.length ?? 0) > 0;

  const [rfLoaded, setRfLoaded] = useState(false);
  const [rfComponents, setRfComponents] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    Promise.all([
      import("@xyflow/react"),
      import("@xyflow/react/dist/style.css"),
    ]).then(([rf]) => {
      setRfComponents({
        ReactFlow: rf.ReactFlow,
        ReactFlowProvider: rf.ReactFlowProvider,
        Background: rf.Background,
        Controls: rf.Controls,
        useNodesState: rf.useNodesState,
        useEdgesState: rf.useEdgesState,
        useReactFlow: rf.useReactFlow,
      });
      setRfLoaded(true);
    });
  }, []);

  return (
    <CreditsProvider projectId={projectId}>
      <div className="flex h-screen flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
            </Link>
            <div className="h-5 w-px bg-border/50" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600">
                <Film className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold leading-tight">{project?.title ?? "DreamX 工作流"}</h1>
                <p className="text-xs text-muted-foreground leading-tight">CapCut 工程生成流水线</p>
              </div>
            </div>
          </div>
          <AutopilotSwitch hasMedia={hasMedia} />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {rfLoaded && rfComponents ? (
              <InnerDreamXCanvas
                projectId={projectId as DreamXProjectId}
                ReactFlow={rfComponents.ReactFlow}
                ReactFlowProvider={rfComponents.ReactFlowProvider}
                Background={rfComponents.Background}
                Controls={rfComponents.Controls}
                useNodesState={rfComponents.useNodesState}
                useEdgesState={rfComponents.useEdgesState}
                useReactFlow={rfComponents.useReactFlow}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  初始化画布中…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CreditsProvider>
  );
}
