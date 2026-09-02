export type TabId = "feed" | "projects" | "studio" | "generate" | "effects" | "tools" | "storage" | "settings" | "oracle";

export type CrystalId = "girl" | "boy";

export type AtelierId = "even" | "nura" | "cehra" | "relyn" | "reira" | "pacca";

export type AgentId = "even" | AtelierId | "dudak" | "allik" | "sac";

export type TemplatePack = AtelierId | "orbit";

export type StudioMode =
  | "enhance"
  | "retouch"
  | "makeup"
  | "color"
  | "design"
  | "takes"
  | "motion"
  | "export";

export type ToolId =
  | "restore"
  | "shape"
  | "jaw"
  | "skin"
  | "sharpen"
  | "erase"
  | "animate"
  | "auto"
  | "blemish"
  | "eyes"
  | "teeth"
  | "lipstick"
  | "blush"
  | "contour"
  | "hair"
  | "relight"
  | "bgblur"
  | "denoise"
  | "glow"
  | "even"
  | "details"
  | "dodge"
  | "backdrop"
  | "rotate"
  | "flip"
  | "hd"
  | "unblur"
  | "colorize"
  | "eyecolor"
  | "cutout"
  | "frame"
  | "smile"
  | "brows"
  | "lashes"
  | "sparkle"
  | "vintage"
  | "frost"
  | "shadow"
  | "matte"
  | "tan"
  | "freckle"
  | "darkcircle"
  | "plump"
  | "eyeshadow"
  | "liner"
  | "letterbox"
  | "dehaze"
  | "clarity"
  | "hips"
  | "waist"
  | "eyesbig"
  | "eyessmall"
  | "almond"
  | "eyein"
  | "eyeout"
  | "lift";

export type VersionKind = ToolId | "original" | "template" | "adjust" | "design" | "look" | "take";

export type Grade = {
  contrast: number;
  brightness: number;
  saturate: number;
  hue: number;
  warmth: number;
  lift: number;
  gamma: number;
};

export type Adjustments = {
  exposure: number;
  contrast: number;
  saturate: number;
  warmth: number;
  fade: number;
  vignette: number;
  grain: number;
  highlights: number;
  shadows: number;
};

export type Overlay =
  | { id: string; kind: "text"; text: string; x: number; y: number; size: number; color: string }
  | { id: string; kind: "sticker"; sticker: string; x: number; y: number; scale: number };

export type CropRatio = "original" | "1:1" | "4:5" | "9:16" | "16:9" | "4:3";

export type LightDir = "left" | "front" | "right" | "rim" | "top";

export type MotionStyle = "zoom" | "pull" | "pan" | "drift" | "reel" | "punch" | "fade";

export type CollageLayout = "grid4" | "split" | "trio" | "wide";

export type ExportScale = 1 | 2;

export type ProcessOpts = {
  intensity?: number;
  color?: string;
  light?: LightDir;
  backdrop?: string;
  frame?: string;
};

export type Template = {
  id: string;
  name: string;
  preview: string;
  grade: Grade;
  free: boolean;
  pack?: TemplatePack;
};

export type MakeupLook = {
  id: string;
  name: string;
  steps: ToolId[];
  free: boolean;
  tone: "green" | "orange" | "blue";
};

export type TakeDef = {
  id: string;
  name: string;
  hint: string;
  steps: ToolId[];
  free: boolean;
};

export type Version = {
  id: string;
  kind: VersionKind;
  label: string;
  image: string;
  createdAt: number;
};

export type Project = {
  id: string;
  title: string;
  versions: Version[];
  updatedAt: number;
};

export type FeedPost = {
  id: string;
  handle: string;
  caption: string;
  time: string;
  likes: number;
  liked: boolean;
  image: string;
  templateId: string;
  reported: boolean;
  sensitive: boolean;
  bookmarked: boolean;
  comments: FeedComment[];
  model: string;
  createdAt: number;
  durationSec: number;
};

export type FeedComment = {
  id: string;
  handle: string;
  text: string;
  createdAt: number;
};

export type FeedSort = "popular" | "new" | "trend";

export type JobLog = {
  id: string;
  label: string;
  model: string;
  at: number;
};


export type Story = {
  id: string;
  handle: string;
  image: string;
  seen: boolean;
};

export type RankEntry = {
  handle: string;
  points: number;
  you?: boolean;
};

export type FeedbackKind = "geri" | "istek" | "sikayet";

export type FeedbackEntry = {
  id: string;
  kind: FeedbackKind;
  text: string;
  createdAt: number;
};

export type ToolDef = {
  id: ToolId;
  name: string;
  hint: string;
  free: boolean;
  tone: "green" | "orange" | "blue";
  tap?: boolean;
};

export type AgentStage = {
  hint: string;
  tools: ToolId[];
};

export type AgentDef = {
  id: AgentId;
  name: string;
  kicker: string;
  line: string;
  cover: string;
  tone: "green" | "orange" | "blue" | "azure";
  atelier: AtelierId;
  templateId: string;
  light: LightDir;
  stages: AgentStage[];
};

export type AgentRun = {
  id: AgentId;
  startedAt: number;
  stage: string;
  index: number;
  total: number;
  preview: string;
};
