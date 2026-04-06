import type { Id } from "convex/_generated/dataModel";

export interface DXNodeData {
  projectId: Id<"dreamXProjects">;
  nodeState: Record<string, unknown>;
  allNodeStates: Record<string, unknown>;
  isReadOnly: boolean;
  onReset: () => void;
  [key: string]: unknown;
}

export interface NodePipelineConfig {
  key: string;
  label: string;
  nodeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<{ default: React.ComponentType<any> }>;
  color: { from: string; to: string };
}

// Pipeline 新顺序（删除了 copywriting 独立节点）：
// mediaUpload → memeRecall → bgmRecall → storyboard → ttsSelection → capcutBuild
export const PIPELINE_CONFIG: NodePipelineConfig[] = [
  {
    key: "mediaUpload",
    label: "素材上传",
    nodeType: "mediaUploadNode",
    load: () => import("./MediaUploadNode"),
    color: { from: "from-blue-500", to: "to-indigo-600" },
  },
  {
    key: "memeRecall",
    label: "表情包召回",
    nodeType: "memeRecallNode",
    load: () => import("./MemeRecallNode"),
    color: { from: "from-pink-500", to: "to-rose-600" },
  },
  {
    key: "bgmRecall",
    label: "BGM 召回",
    nodeType: "bgmRecallNode",
    load: () => import("./BgmRecallNode"),
    color: { from: "from-teal-500", to: "to-cyan-600" },
  },
  {
    key: "storyboard",
    label: "分镜脚本",
    nodeType: "storyboardNode",
    load: () => import("./StoryboardNode"),
    color: { from: "from-amber-500", to: "to-orange-600" },
  },
  {
    key: "ttsSelection",
    label: "TTS 选择",
    nodeType: "ttsSelectionNode",
    load: () => import("./TTSSelectionNode"),
    color: { from: "from-emerald-500", to: "to-green-600" },
  },
  {
    key: "capcutBuild",
    label: "CapCut 成片",
    nodeType: "capcutBuildNode",
    load: () => import("./CapcutBuildNode"),
    color: { from: "from-rose-500", to: "to-red-600" },
  },
];

export const PIPELINE = PIPELINE_CONFIG.map((c) => c.key);

export const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  mediaUpload:   { x: 0, y: 0 },
  memeRecall:    { x: 0, y: 520 },
  bgmRecall:     { x: 0, y: 1040 },
  storyboard:    { x: 0, y: 1560 },
  ttsSelection:  { x: 0, y: 2080 },
  capcutBuild:   { x: 0, y: 2600 },
};
