import { memo, useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, Loader2, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { DXNodeBase } from "../DXNodeBase";
import type { DXNodeData } from "./pipeline.config";

const PX_PER_SEC = 52;    // 每秒像素宽度
const TRACK_HEIGHT = 36;  // 轨道高度
const HEADER_HEIGHT = 20; // 时间刻度高度
const SNAP_MS = 500;      // 吸附精度 0.5s
const TIMELINE_WIDTH = 320; // Timeline 可视宽度（节点宽 384 - px-4*2=32 - 左标签 56）

export interface SubtitleItem {
  text: string;
  startMs: number;
  durationMs: number;
  voiceTrack?: { url: string; storageId: string; durationMs: number } | null;
}

export interface TimelineItem {
  type: "image" | "meme";
  url: string;
  name: string;
  startMs: number;
  durationMs: number;
  subtitles?: SubtitleItem[];
  voiceTrack?: { url: string; storageId: string; durationMs: number } | null;
}

interface BgmItem {
  url: string;
  name: string;
  durationMs?: number;
  startMs?: number;  // BGM 在时间轴上的起始偏移（ms）
}

interface StoryboardNodeInnerProps {
  data: DXNodeData & {
    timeline?: TimelineItem[];
    totalDurationMs?: number;
    errorMessage?: string;
    selectedBgm?: BgmItem;
    subtitleEditable?: boolean;  // TTS 完成后禁用字幕双击编辑
    onRegenerate: () => void;
    onSaveTimeline: (timeline: TimelineItem[], totalDurationMs: number) => void;
    onSaveBgm: (startMs: number, durationMs: number) => void;
    onDeleteSubtitle?: (tiIdx: number, subIdx: number) => void;  // 删除字幕
  };
}

// ─── 阻止 ReactFlow 节点拖动 ──────────────────────────────────────────────────
function stopFlow(e: React.PointerEvent | React.MouseEvent) {
  e.stopPropagation();
}

// ─── 时间刻度 ─────────────────────────────────────────────────────────────────
function TimeRuler({ totalMs, pxPerSec }: { totalMs: number; pxPerSec: number }) {
  const totalSec = Math.ceil(totalMs / 1000);
  const marks: number[] = [];
  for (let s = 0; s <= totalSec; s++) marks.push(s);
  return (
    <div className="relative select-none" style={{ height: HEADER_HEIGHT }}>
      {marks.map((s) => (
        <div key={s} className="absolute top-0 flex flex-col items-center" style={{ left: s * pxPerSec }}>
          <div className="h-1.5 w-px bg-border/50" />
          {s % 2 === 0 && <span className="text-[9px] text-muted-foreground/50 mt-0.5">{s}s</span>}
        </div>
      ))}
    </div>
  );
}

// ─── 通用可拖拽/缩放轨道块 ────────────────────────────────────────────────────
interface TrackBlockProps {
  startMs: number;
  durationMs: number;
  totalMs: number;
  pxPerSec: number;
  colorClass: string;
  onDrag: (newStartMs: number) => void;
  onResize: (newDurationMs: number) => void;
  children?: React.ReactNode;
}

function TrackBlockBase({ startMs, durationMs, totalMs, pxPerSec, colorClass, onDrag, onResize, children }: TrackBlockProps) {
  const dragRef = useRef<{ startX: number; startMs: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startDur: number } | null>(null);
  const left = (startMs / 1000) * pxPerSec;
  const width = Math.max((durationMs / 1000) * pxPerSec, 20);

  const onBodyPD = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startMs };
  };
  const onBodyPM = (e: React.PointerEvent) => {
    if (!dragRef.current) return; e.stopPropagation();
    const rawMs = dragRef.current.startMs + ((e.clientX - dragRef.current.startX) / pxPerSec) * 1000;
    onDrag(Math.max(0, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - durationMs)));
  };
  const onBodyPU = (e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = null; };

  const onResPD = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startDur: durationMs };
  };
  const onResPM = (e: React.PointerEvent) => {
    if (!resizeRef.current) return; e.stopPropagation();
    const rawMs = resizeRef.current.startDur + ((e.clientX - resizeRef.current.startX) / pxPerSec) * 1000;
    onResize(Math.max(500, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - startMs)));
  };
  const onResPU = (e: React.PointerEvent) => { e.stopPropagation(); resizeRef.current = null; };

  return (
    <div
      style={{ position: "absolute", left, width, height: TRACK_HEIGHT - 4, top: 2 }}
      className={cn("rounded border select-none cursor-grab active:cursor-grabbing touch-none group overflow-hidden", colorClass)}
      onPointerDown={onBodyPD} onPointerMove={onBodyPM} onPointerUp={onBodyPU}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
      <div
        style={{ position: "absolute", right: 0, top: 0, width: 8, height: "100%" }}
        className="cursor-ew-resize touch-none z-10 opacity-0 group-hover:opacity-100 flex items-center justify-center"
        onPointerDown={onResPD} onPointerMove={onResPM} onPointerUp={onResPU}
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      >
        <div className="w-px h-3 bg-white/70 rounded" />
      </div>
    </div>
  );
}

// ─── 图片轨 ──────────────────────────────────────────────────────────────────
function ImageTrack({ timeline, pxPerSec, totalMs, onDragMove, onResizeRight }: {
  timeline: TimelineItem[]; pxPerSec: number; totalMs: number;
  onDragMove: (i: number, v: number) => void;
  onResizeRight: (i: number, v: number) => void;
}) {
  const w = Math.ceil(totalMs / 1000) * pxPerSec + 40;
  return (
    <div className="relative border-b border-border/20" style={{ height: TRACK_HEIGHT, width: w, minWidth: "100%" }}>
      {timeline.map((item, i) => (
        <TrackBlockBase
          key={i} startMs={item.startMs} durationMs={item.durationMs} totalMs={totalMs} pxPerSec={pxPerSec}
          colorClass={item.type === "meme" ? "bg-pink-500/40 border-pink-400/80" : "bg-teal-500/40 border-teal-400/80"}
          onDrag={(v) => onDragMove(i, v)} onResize={(v) => onResizeRight(i, v)}
        >
          <div className="h-full flex items-center gap-1 px-1.5 overflow-hidden">
            {item.url && <img src={item.url} alt={item.name} className="h-4 w-4 object-cover rounded shrink-0" draggable={false} />}
            <span className="text-[10px] text-white/90 font-medium truncate">{item.name}</span>
          </div>
        </TrackBlockBase>
      ))}
    </div>
  );
}

// ─── 字幕编辑弹窗（Portal 挂载到 body，避免被 overflow-hidden 裁切）────────
interface SubtitleEditPopupProps {
  text: string;
  anchorRect: DOMRect;  // 被点击字幕块的屏幕坐标
  onSave: (newText: string) => void;
  onDelete: () => void;  // 删除该字幕（清空文本也视为删除）
  onClose: () => void;
}
function SubtitleEditPopup({ text, anchorRect, onSave, onDelete, onClose }: SubtitleEditPopupProps) {
  const [value, setValue] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);
  // 弹窗出现在字幕块正上方
  const popupTop = anchorRect.top - 80;
  const popupLeft = anchorRect.left;

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const commitRef = useRef(false);
  const commit = () => {
    if (commitRef.current) return;
    commitRef.current = true;
    const trimmed = value.trim();
    if (!trimmed) {
      // 空文本 = 删除
      onDelete();
    } else if (trimmed !== text) {
      onSave(trimmed);
    } else {
      onClose();
    }
  };
  const handleKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: Math.max(8, Math.min(popupLeft, window.innerWidth - 280)),
        top: Math.max(8, popupTop),
        zIndex: 99999,
      }}
      className="shadow-2xl rounded-xl border border-violet-500/70 bg-zinc-900 p-2.5 w-[240px]"
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      <p className="text-[9px] text-violet-400/70 mb-1.5 select-none font-medium">编辑字幕 · Enter 保存 · Esc 取消 · 清空后保存=删除</p>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        className="w-full rounded-lg bg-zinc-800 border border-violet-500/40 px-2 py-1.5 text-xs text-white outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30"
        maxLength={50}
      />
      <button
        type="button"
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); commitRef.current = true; onDelete(); }}
        className="mt-1.5 w-full rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-[10px] py-1 transition-colors"
      >
        删除此字幕
      </button>
    </div>,
    document.body
  );
}

// ─── 可感知双击的字幕块 ───────────────────────────────────────────────────────
// TrackBlockBase 的 onPointerDown 含 preventDefault，会阻止 dblclick 事件。
// 所以字幕块用独立 pointer 逻辑，自行检测两次 pointerup 的时间差来判断双击。
function SubtitleBlock({
  sub, totalMs, pxPerSec, colorClass,
  onDrag, onResize, onEditStart,
}: {
  sub: { startMs: number; durationMs: number; text: string; itemIdx: number; subIdx: number };
  totalMs: number; pxPerSec: number; colorClass: string;
  onDrag: (v: number) => void;
  onResize: (v: number) => void;
  onEditStart?: (rect: DOMRect) => void;  // undefined 时禁止双击编辑
}) {
  const dragRef = useRef<{ startX: number; startMs: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ startX: number; startDur: number } | null>(null);
  const lastUpTimeRef = useRef<number>(0);
  const left = (sub.startMs / 1000) * pxPerSec;
  const width = Math.max((sub.durationMs / 1000) * pxPerSec, 20);

  const onBodyPD = (e: React.PointerEvent) => {
    e.stopPropagation();
    // 不调 preventDefault()，避免阻断双击检测
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startMs: sub.startMs, moved: false };
  };
  const onBodyPM = (e: React.PointerEvent) => {
    if (!dragRef.current) return; e.stopPropagation();
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    if (dx > 3) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    const rawMs = dragRef.current.startMs + ((e.clientX - dragRef.current.startX) / pxPerSec) * 1000;
    onDrag(Math.max(0, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - sub.durationMs)));
  };
  const onBodyPU = (e: React.PointerEvent) => {
    e.stopPropagation();
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (moved) return;
    // 未移动 → 检测双击（两次 pointerup 间隔 < 350ms）
    const now = Date.now();
    if (now - lastUpTimeRef.current < 350) {
      // 双击！取当前 currentTarget 的 BoundingClientRect
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onEditStart?.(rect);  // 可选调用：undefined 时不触发
      lastUpTimeRef.current = 0;
    } else {
      lastUpTimeRef.current = now;
    }
  };

  const onResPD = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startDur: sub.durationMs };
  };
  const onResPM = (e: React.PointerEvent) => {
    if (!resizeRef.current) return; e.stopPropagation();
    const rawMs = resizeRef.current.startDur + ((e.clientX - resizeRef.current.startX) / pxPerSec) * 1000;
    onResize(Math.max(500, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - sub.startMs)));
  };
  const onResPU = (e: React.PointerEvent) => { e.stopPropagation(); resizeRef.current = null; };

  return (
    <div
      style={{ position: "absolute", left, width, height: TRACK_HEIGHT - 4, top: 2 }}
      className={cn("rounded border select-none touch-none group overflow-hidden", colorClass,
        dragRef.current?.moved ? "cursor-grabbing" : "cursor-grab")}
      onPointerDown={onBodyPD} onPointerMove={onBodyPM} onPointerUp={onBodyPU}
      onMouseDown={(e) => e.stopPropagation()}
      title="双击编辑字幕"
    >
      <div className="h-full flex items-center px-1.5 overflow-hidden pointer-events-none">
        <span className="text-[10px] text-violet-100 font-medium truncate">{sub.text}</span>
      </div>
      {/* 右边缘缩放手柄 */}
      <div
        style={{ position: "absolute", right: 0, top: 0, width: 8, height: "100%" }}
        className="cursor-ew-resize touch-none z-10 opacity-0 group-hover:opacity-100 flex items-center justify-center"
        onPointerDown={onResPD} onPointerMove={onResPM} onPointerUp={onResPU}
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      >
        <div className="w-px h-3 bg-white/70 rounded" />
      </div>
    </div>
  );
}

// ─── 字幕轨 ──────────────────────────────────────────────────────────────────
function SubtitleTrack({ timeline, pxPerSec, totalMs, canEdit, onDragSubtitle, onResizeSubtitle, onEditSubtitle, onDeleteSubtitle }: {
  timeline: TimelineItem[]; pxPerSec: number; totalMs: number;
  canEdit: boolean;  // false 时禁用双击编辑
  onDragSubtitle: (iIdx: number, sIdx: number, v: number) => void;
  onResizeSubtitle: (iIdx: number, sIdx: number, v: number) => void;
  onEditSubtitle: (iIdx: number, sIdx: number, text: string) => void;
  onDeleteSubtitle: (iIdx: number, sIdx: number) => void;  // 删除字幕
}) {
  const [editingInfo, setEditingInfo] = useState<{
    iIdx: number; sIdx: number; text: string; rect: DOMRect
  } | null>(null);

  const allSubs = timeline.flatMap((item, i) =>
    (item.subtitles ?? []).map((sub, j) => ({ ...sub, itemIdx: i, subIdx: j }))
  );
  const w = Math.ceil(totalMs / 1000) * pxPerSec + 40;

  return (
    <div className="relative border-b border-border/20" style={{ height: TRACK_HEIGHT, width: w, minWidth: "100%" }}>
      {allSubs.map((sub, k) => {
        const isEditing = editingInfo?.iIdx === sub.itemIdx && editingInfo?.sIdx === sub.subIdx;
        return (
          <SubtitleBlock
            key={k}
            sub={sub}
            totalMs={totalMs}
            pxPerSec={pxPerSec}
            colorClass={isEditing
              ? "bg-violet-500/70 border-violet-300/90 ring-1 ring-violet-400/60"
              : canEdit
                ? "bg-violet-500/40 border-violet-400/80"
                : "bg-violet-400/25 border-violet-400/40 cursor-default"}
            onDrag={(v) => onDragSubtitle(sub.itemIdx, sub.subIdx, v)}
            onResize={(v) => onResizeSubtitle(sub.itemIdx, sub.subIdx, v)}
            onEditStart={canEdit ? (rect) => setEditingInfo({ iIdx: sub.itemIdx, sIdx: sub.subIdx, text: sub.text, rect }) : undefined}
          />
        );
      })}
      {editingInfo && (
        <SubtitleEditPopup
          key={`${editingInfo.iIdx}-${editingInfo.sIdx}`}
          text={editingInfo.text}
          anchorRect={editingInfo.rect}
          onSave={(newText) => {
            onEditSubtitle(editingInfo.iIdx, editingInfo.sIdx, newText);
            setEditingInfo(null);
          }}
          onDelete={() => {
            onDeleteSubtitle(editingInfo.iIdx, editingInfo.sIdx);
            setEditingInfo(null);
          }}
          onClose={() => setEditingInfo(null)}
        />
      )}
    </div>
  );
}

// ─── 配音轨 ──────────────────────────────────────────────────────────────────
// 按每条字幕逐条展示对应的配音块，位置和宽度完全对齐到字幕的 startMs/durationMs
function VoiceTrack({ timeline, pxPerSec, totalMs, onDragVoice, onResizeVoice }: {
  timeline: TimelineItem[]; pxPerSec: number; totalMs: number;
  onDragVoice: (iIdx: number, sIdx: number, v: number) => void;
  onResizeVoice: (iIdx: number, sIdx: number, v: number) => void;
}) {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePlay = useCallback((key: string, url: string) => {
    if (playingKey === key) {
      audioRef.current?.pause();
      setPlayingKey(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(url);
    audioRef.current.onended = () => setPlayingKey(null);
    audioRef.current.play().catch(() => {});
    setPlayingKey(key);
  }, [playingKey]);

  // 按字幕逐条展开，每条字幕若有 voiceTrack 则渲染一个配音块
  // 位置 = 字幕的 startMs，宽度 = 字幕的 durationMs（对齐字幕时间槽）
  const voiceBlocks = timeline.flatMap((item, iIdx) =>
    (item.subtitles ?? []).flatMap((sub, sIdx) => {
      if (!sub.voiceTrack) return [];
      const key = `${iIdx}-${sIdx}`;
      return [{
        key,
        iIdx, sIdx,
        startMs: sub.startMs,
        durationMs: sub.durationMs,  // 用字幕时长，不用音频估算时长
        url: sub.voiceTrack.url,
        label: `配音${iIdx + 1}-${sIdx + 1}`,
      }];
    })
  );

  const w = Math.ceil(totalMs / 1000) * pxPerSec + 40;
  return (
    <div className="relative border-b border-border/20" style={{ height: TRACK_HEIGHT, width: w, minWidth: "100%" }}>
      {voiceBlocks.map((v) => {
        const isPlaying = playingKey === v.key;
        return (
          <VoiceBlock
            key={v.key}
            startMs={v.startMs} durationMs={v.durationMs} totalMs={totalMs} pxPerSec={pxPerSec}
            isPlaying={isPlaying}
            label={v.label}
            onPlayToggle={() => togglePlay(v.key, v.url)}
            onDrag={(newMs) => onDragVoice(v.iIdx, v.sIdx, newMs)}
            onResize={(newDur) => onResizeVoice(v.iIdx, v.sIdx, newDur)}
          />
        );
      })}
    </div>
  );
}

// ─── 配音块（独立 pointer 事件管理，避免 setPointerCapture 吞掉点击）────────
function VoiceBlock({ startMs, durationMs, totalMs, pxPerSec, isPlaying, label, onPlayToggle, onDrag, onResize }: {
  startMs: number; durationMs: number; totalMs: number; pxPerSec: number;
  isPlaying: boolean; label: string;
  onPlayToggle: () => void;
  onDrag: (newStartMs: number) => void;
  onResize: (newDurationMs: number) => void;
}) {
  const dragRef = useRef<{ startX: number; startMs: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ startX: number; startDur: number } | null>(null);
  const left = (startMs / 1000) * pxPerSec;
  const width = Math.max((durationMs / 1000) * pxPerSec, 20);

  const onBodyPD = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startMs, moved: false };
  };
  const onBodyPM = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    if (dx > 4) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    e.stopPropagation();
    const rawMs = dragRef.current.startMs + ((e.clientX - dragRef.current.startX) / pxPerSec) * 1000;
    onDrag(Math.max(0, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - durationMs)));
  };
  const onBodyPU = (e: React.PointerEvent) => {
    e.stopPropagation();
    const wasMoved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    // 没有移动 → 是点击 → 切换播放
    if (!wasMoved) onPlayToggle();
  };

  const onResPD = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startDur: durationMs };
  };
  const onResPM = (e: React.PointerEvent) => {
    if (!resizeRef.current) return; e.stopPropagation();
    const rawMs = resizeRef.current.startDur + ((e.clientX - resizeRef.current.startX) / pxPerSec) * 1000;
    onResize(Math.max(500, Math.min(Math.round(rawMs / SNAP_MS) * SNAP_MS, totalMs - startMs)));
  };
  const onResPU = (e: React.PointerEvent) => { e.stopPropagation(); resizeRef.current = null; };

  return (
    <div
      style={{ position: "absolute", left, width, height: TRACK_HEIGHT - 4, top: 2 }}
      className={cn(
        "rounded border select-none cursor-grab active:cursor-grabbing touch-none group overflow-hidden",
        "border-orange-400/80",
        isPlaying ? "bg-orange-500/60" : "bg-orange-500/40"
      )}
      onPointerDown={onBodyPD} onPointerMove={onBodyPM} onPointerUp={onBodyPU}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="h-full flex items-center px-1.5 overflow-hidden gap-1 pointer-events-none">
        <span className="text-[9px]">{isPlaying ? "⏸" : "▶"}</span>
        <span className="text-[10px] text-orange-100 font-medium truncate">{label}</span>
        {isPlaying && <span className="ml-auto text-[8px] text-orange-200 animate-pulse shrink-0">●</span>}
      </div>
      {/* 右边缘缩放 */}
      <div
        style={{ position: "absolute", right: 0, top: 0, width: 8, height: "100%" }}
        className="cursor-ew-resize touch-none z-10 opacity-0 group-hover:opacity-100 flex items-center justify-center"
        onPointerDown={onResPD} onPointerMove={onResPM} onPointerUp={onResPU}
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      >
        <div className="w-px h-3 bg-white/70 rounded" />
      </div>
    </div>
  );
}

// ─── BGM 轨 ──────────────────────────────────────────────────────────────────
function BgmTrack({
  bgm, totalMs, pxPerSec, onDragBgm, onResizeBgm,
}: {
  bgm?: BgmItem;
  totalMs: number;
  pxPerSec: number;
  onDragBgm: (newStartMs: number) => void;
  onResizeBgm: (newDurationMs: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bgm?.url) return;
    if (!audioRef.current) audioRef.current = new Audio(bgm.url);
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); }
  };
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const totalW = Math.ceil(totalMs / 1000) * pxPerSec + 40;

  if (!bgm) {
    return (
      <div className="relative" style={{ height: TRACK_HEIGHT, width: totalW, minWidth: "100%" }}>
        <div style={{ position: "absolute", left: 4, right: 4, height: TRACK_HEIGHT - 4, top: 2 }}
          className="rounded border border-dashed border-border/40 flex items-center">
          <span className="text-[10px] text-muted-foreground/40 mx-auto">暂无 BGM</span>
        </div>
      </div>
    );
  }

  // BGM 的 startMs / durationMs（durationMs 默认等于 totalMs 铺满，代表「截取时长」）
  const bgmStartMs = bgm.startMs ?? 0;
  // BGM 可截取的最大时长：min(文件原始时长, 剩余到totalMs的时长)
  const bgmFileDurationMs = bgm.durationMs ?? totalMs;
  const bgmDisplayMs = Math.min(bgmFileDurationMs - bgmStartMs, totalMs - bgmStartMs);

  return (
    <div className="relative" style={{ height: TRACK_HEIGHT, width: totalW, minWidth: "100%" }}>
      <TrackBlockBase
        startMs={bgmStartMs}
        durationMs={Math.max(bgmDisplayMs, 500)}
        totalMs={totalMs}
        pxPerSec={pxPerSec}
        colorClass="bg-blue-500/25 border-blue-400/60"
        onDrag={onDragBgm}
        onResize={onResizeBgm}
      >
        <div className="flex items-center gap-1.5 h-full px-1 cursor-pointer select-none"
          onClick={toggle} onMouseDown={(e) => e.stopPropagation()}>
          <span className="text-[10px] shrink-0">{playing ? "⏸" : "▶"}</span>
          <span className="text-[10px] text-blue-200 font-medium truncate">{bgm.name}</span>
          <span className="text-[9px] text-blue-300/60 shrink-0 ml-auto">
            {bgmStartMs > 0 ? `+${(bgmStartMs / 1000).toFixed(1)}s` : ""}
          </span>
        </div>
      </TrackBlockBase>
    </div>
  );
}

// ─── 主 Timeline 组件 ─────────────────────────────────────────────────────────
function StoryboardTimeline({
  timeline, totalDurationMs, selectedBgm, subtitleEditable, onSaveTimeline, onSaveBgm, onDeleteSubtitle,
}: {
  timeline: TimelineItem[];
  totalDurationMs: number;
  selectedBgm?: BgmItem;
  subtitleEditable: boolean;  // TTS 完成后为 false，禁止字幕编辑
  onSaveTimeline: (timeline: TimelineItem[], totalDurationMs: number) => void;
  onSaveBgm: (startMs: number, durationMs: number) => void;
  onDeleteSubtitle?: (tiIdx: number, subIdx: number) => void;  // 删除字幕（同时触发后端持久化）
}) {
  const [localTimeline, setLocalTimeline] = useState<TimelineItem[]>(timeline);
  const [localBgm, setLocalBgm] = useState<BgmItem | undefined>(selectedBgm);
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bgmSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 同步外部 timeline prop 变化
  // 触发条件：voiceTrack 数量变化 | 片段数量变化 | 字幕文字内容变化
  useEffect(() => {
    const countSubVoice = (tl: TimelineItem[]) =>
      tl.reduce((acc, t) => acc + (t.subtitles?.filter((s) => s.voiceTrack)?.length ?? 0), 0);

    // 字幕文字哈希：所有字幕 text 拼接
    const subtitleTextHash = (tl: TimelineItem[]) =>
      tl.flatMap((t) => t.subtitles?.map((s) => s.text) ?? []).join("\x00");

    const externalVoiceCount = countSubVoice(timeline);
    const localVoiceCount = countSubVoice(localTimeline);
    const externalTextHash = subtitleTextHash(timeline);
    const localTextHash = subtitleTextHash(localTimeline);

    if (
      externalVoiceCount !== localVoiceCount ||  // 配音数量变化（TTS 写入）
      timeline.length !== localTimeline.length || // 片段数量变化（重新生成分镜）
      externalTextHash !== localTextHash ||       // 字幕文字被外部修改（TTS节点编辑同步）
      // 字幕数量变化（字幕被删除后，字幕 count 减少，而 hash 因为内容不同也会变化，双重保险）
      timeline.reduce((s, t) => s + (t.subtitles?.length ?? 0), 0) !==
        localTimeline.reduce((s, t) => s + (t.subtitles?.length ?? 0), 0)
    ) {
      setLocalTimeline(timeline);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline]);

  // 是否有配音数据（字幕级粒度）
  const hasVoiceTrack = localTimeline.some((t) => t.subtitles?.some((s) => s.voiceTrack));

  const trackLabels = hasVoiceTrack ? ["图片/表情", "字幕", "配音", "BGM"] : ["图片/表情", "字幕", "BGM"];
  const trackCount = trackLabels.length;
  const contentH = HEADER_HEIGHT + TRACK_HEIGHT * trackCount;

  const totalMs = Math.max(totalDurationMs, ...localTimeline.map((t) => t.startMs + t.durationMs), 1000);
  const totalContentW = Math.ceil(totalMs / 1000) * pxPerSec + 40;

  const triggerSave = useCallback((next: TimelineItem[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onSaveTimeline(next, Math.max(...next.map((t) => t.startMs + t.durationMs)));
    }, 600);
  }, [onSaveTimeline]);

  const handleDragMove = useCallback((i: number, v: number) => {
    setLocalTimeline((prev) => { const n = prev.map((t, idx) => idx === i ? { ...t, startMs: v } : t); triggerSave(n); return n; });
  }, [triggerSave]);
  const handleResizeRight = useCallback((i: number, v: number) => {
    setLocalTimeline((prev) => { const n = prev.map((t, idx) => idx === i ? { ...t, durationMs: v } : t); triggerSave(n); return n; });
  }, [triggerSave]);
  const handleDragSubtitle = useCallback((iIdx: number, sIdx: number, v: number) => {
    setLocalTimeline((prev) => {
      const n = prev.map((t, i) => i !== iIdx ? t : { ...t, subtitles: t.subtitles?.map((s, j) => j === sIdx ? { ...s, startMs: v } : s) });
      triggerSave(n); return n;
    });
  }, [triggerSave]);
  const handleResizeSubtitle = useCallback((iIdx: number, sIdx: number, v: number) => {
    setLocalTimeline((prev) => {
      const n = prev.map((t, i) => i !== iIdx ? t : { ...t, subtitles: t.subtitles?.map((s, j) => j === sIdx ? { ...s, durationMs: v } : s) });
      triggerSave(n); return n;
    });
  }, [triggerSave]);
  const handleDragVoice = useCallback((iIdx: number, sIdx: number, v: number) => {
    setLocalTimeline((prev) => {
      // 配音轨拖拽：更新对应字幕的 startMs（配音时间跟字幕绑定，字幕跟着移动）
      const n = prev.map((t, i) => {
        if (i !== iIdx) return t;
        return { ...t, subtitles: t.subtitles?.map((s, j) => j === sIdx ? { ...s, startMs: v } : s) };
      });
      triggerSave(n); return n;
    });
  }, [triggerSave]);
  const handleResizeVoice = useCallback((iIdx: number, sIdx: number, v: number) => {
    setLocalTimeline((prev) => {
      // 配音轨缩放：更新对应字幕的 durationMs（配音块宽度 = 字幕时长）
      const n = prev.map((t, i) => {
        if (i !== iIdx) return t;
        return { ...t, subtitles: t.subtitles?.map((s, j) => j === sIdx ? { ...s, durationMs: v } : s) };
      });
      triggerSave(n); return n;
    });
  }, [triggerSave]);

  const handleEditSubtitle = useCallback((iIdx: number, sIdx: number, text: string) => {
    setLocalTimeline((prev) => {
      const n = prev.map((t, i) =>
        i !== iIdx ? t : { ...t, subtitles: t.subtitles?.map((s, j) => j === sIdx ? { ...s, text } : s) }
      );
      triggerSave(n); return n;
    });
  }, [triggerSave]);

  const handleDeleteSubtitle = useCallback((iIdx: number, sIdx: number) => {
    setLocalTimeline((prev) => {
      const n = prev.map((t, i) =>
        i !== iIdx ? t : { ...t, subtitles: t.subtitles?.filter((_, j) => j !== sIdx) }
      );
      triggerSave(n); return n;
    });
    // 同步持久化到后端
    onDeleteSubtitle?.(iIdx, sIdx);
  }, [triggerSave, onDeleteSubtitle]);

  // BGM 拖拽/缩放（600ms debounce 后回存 DB）
  const triggerSaveBgm = useCallback((startMs: number, durationMs: number) => {
    clearTimeout(bgmSaveTimer.current);
    bgmSaveTimer.current = setTimeout(() => onSaveBgm(startMs, durationMs), 600);
  }, [onSaveBgm]);

  const handleDragBgm = useCallback((newStartMs: number) => {
    setLocalBgm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, startMs: newStartMs };
      triggerSaveBgm(newStartMs, next.durationMs ?? totalMs);
      return next;
    });
  }, [triggerSaveBgm, totalMs]);

  const handleResizeBgm = useCallback((newDurationMs: number) => {
    setLocalBgm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, durationMs: newDurationMs };
      triggerSaveBgm(prev.startMs ?? 0, newDurationMs);
      return next;
    });
  }, [triggerSaveBgm]);

  // 同步外部 selectedBgm prop（BGM 节点重新选择时）
  useEffect(() => {
    setLocalBgm(selectedBgm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBgm?.url, selectedBgm?.durationMs]);

  // 左右滚动
  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -120 : 120, behavior: "smooth" });
  };

  return (
    // -mx-4 让 Timeline 撑满 DXNodeBase 的宽度（抵消 px-4 内边距）
    <div
      className="-mx-4 rounded-b-xl border-t border-border/50 bg-zinc-900/95 overflow-hidden"
      data-nodrag="true"
      onPointerDown={stopFlow}
      onMouseDown={stopFlow}
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border/40">
        <span className="text-[10px] text-muted-foreground/60 font-medium">
          {localTimeline.length} 片段 · {(totalMs / 1000).toFixed(1)}s
        </span>
        <div className="flex items-center gap-0.5">
          {/* 左右滚动 */}
          <button onClick={() => scroll("left")} onPointerDown={stopFlow} onMouseDown={stopFlow}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/40 text-muted-foreground">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button onClick={() => scroll("right")} onPointerDown={stopFlow} onMouseDown={stopFlow}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/40 text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
          </button>
          {/* 缩放 */}
          <div className="w-px h-3 bg-border/30 mx-0.5" />
          <button onClick={() => setPxPerSec((p) => Math.max(28, p - 12))} onPointerDown={stopFlow} onMouseDown={stopFlow}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/40 text-muted-foreground">
            <ZoomOut className="h-3 w-3" />
          </button>
          <button onClick={() => setPxPerSec((p) => Math.min(160, p + 12))} onPointerDown={stopFlow} onMouseDown={stopFlow}
            className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/40 text-muted-foreground">
            <ZoomIn className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 轨道区 */}
      <div className="flex" style={{ height: contentH }}>
        {/* 左侧固定轨道标签 */}
        <div className="shrink-0 w-12 border-r border-border/30 bg-zinc-950/50 flex flex-col">
          <div style={{ height: HEADER_HEIGHT }} className="border-b border-border/20 shrink-0" />
          {trackLabels.map((label, i) => (
            <div key={i} style={{ height: TRACK_HEIGHT }}
              className="flex items-center justify-end pr-1.5 border-b border-border/20 shrink-0">
              <span className="text-[8px] text-muted-foreground/50 text-right leading-tight">{label}</span>
            </div>
          ))}
        </div>

        {/* 右侧滚动区（用 ref 受控滚动，而非鼠标 overflow-x-auto 自然滚动） */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: "none" }}
          onPointerDown={stopFlow} onMouseDown={stopFlow}
        >
          <div style={{ width: totalContentW, minWidth: "100%", height: contentH }}>
            {/* 时间刻度 */}
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-border/20 bg-zinc-950/50 relative">
              <TimeRuler totalMs={totalMs} pxPerSec={pxPerSec} />
            </div>
            <ImageTrack timeline={localTimeline} pxPerSec={pxPerSec} totalMs={totalMs}
              onDragMove={handleDragMove} onResizeRight={handleResizeRight} />
            <SubtitleTrack timeline={localTimeline} pxPerSec={pxPerSec} totalMs={totalMs}
              canEdit={subtitleEditable}
              onDragSubtitle={handleDragSubtitle} onResizeSubtitle={handleResizeSubtitle}
              onEditSubtitle={handleEditSubtitle} onDeleteSubtitle={handleDeleteSubtitle} />
            {hasVoiceTrack && (
              <VoiceTrack timeline={localTimeline} pxPerSec={pxPerSec} totalMs={totalMs}
                onDragVoice={handleDragVoice} onResizeVoice={handleResizeVoice} />
            )}
            <BgmTrack bgm={localBgm} totalMs={totalMs} pxPerSec={pxPerSec}
              onDragBgm={handleDragBgm} onResizeBgm={handleResizeBgm} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 分镜节点主体 ─────────────────────────────────────────────────────────────
const StoryboardNode = memo(({ data }: StoryboardNodeInnerProps) => {
  const status = (data.nodeState as any).status;
  const isCompleted = data.isReadOnly;
  const isGenerating = status === "generating";
  const hasTimeline = !!(data.timeline && data.timeline.length > 0);

  return (
    <DXNodeBase
      status={status}
      title="分镜脚本"
      icon={Clapperboard}
      colorClass="bg-gradient-to-br from-amber-500 to-orange-600"
      nodeNum={4}
      isReadOnly={isCompleted}
      onReset={data.onReset}
    >
      {isGenerating && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
          <p className="text-xs text-amber-400/80">AI 正在生成分镜时间轴...</p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive">
              {String((data.nodeState as any).errorMessage ?? data.errorMessage ?? "生成失败")}
            </p>
          </div>
          <Button size="sm" className="w-full" onClick={data.onRegenerate}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 重新生成
          </Button>
        </div>
      )}

      {/* Timeline 放在 DXNodeBase children 内，用 -mx-4 负 margin 撑满 */}
      {(isCompleted || status === "idle") && hasTimeline && (
        <>
          <StoryboardTimeline
            timeline={data.timeline!}
            totalDurationMs={data.totalDurationMs ?? 0}
            selectedBgm={data.selectedBgm}
            subtitleEditable={data.subtitleEditable ?? true}
            onSaveTimeline={data.onSaveTimeline}
            onSaveBgm={data.onSaveBgm}
            onDeleteSubtitle={data.onDeleteSubtitle}
          />
          {!isCompleted && (
            <Button size="sm" variant="outline" className="w-full text-xs mt-1.5" onClick={data.onRegenerate}>
              <RefreshCw className="h-3 w-3 mr-1.5" /> 重新生成分镜
            </Button>
          )}
        </>
      )}
    </DXNodeBase>
  );
});
StoryboardNode.displayName = "StoryboardNode";

export default StoryboardNode;
