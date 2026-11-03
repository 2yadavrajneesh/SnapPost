export type VideoData = {
  url: string;
  poster: string | null;
  width: number;
  height: number;
  gif: boolean;
};

export type QuoteData = {
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  text: string;
  timestamp: number | null;
  image: string | null;
  video: VideoData | null;
  replies: number;
  reposts: number;
  likes: number;
  views: number;
  quote: QuoteData | null;
};

export type TweetData = {
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  text: string;
  time: string;
  date: string;
  replies: number;
  reposts: number;
  likes: number;
  views: number;
  image: string | null;
  video: VideoData | null;
  quote: QuoteData | null;
};

export type RatioKey = "auto" | "compact" | "standard" | "wide" | "story" | "square" | "portrait";

export type LogoKey = "x" | "bird" | "none";

export type Settings = {
  ratio: RatioKey;
  theme: "light" | "dark";
  corners: "sharp" | "soft" | "round";
  logo: LogoKey;
  font: "rounded" | "sans" | "serif";
  style: "standard" | "minimal";
  textSize: number; // logical px, 24-64
  padding: number; // percent, 50-150
};

/** Logical width of the card frame. Height is derived from the ratio. */
export const FRAME_W = 1200;

export const RATIOS: Record<RatioKey, { label: string; note: string; value: number | null }> = {
  auto: { label: "Auto", note: "Fit to content", value: null },
  compact: { label: "Compact", note: "3:2", value: 3 / 2 },
  standard: { label: "Standard", note: "4:3", value: 4 / 3 },
  wide: { label: "Wide", note: "16:9", value: 16 / 9 },
  story: { label: "9:16", note: "Story", value: 9 / 16 },
  square: { label: "1:1", note: "Square", value: 1 },
  portrait: { label: "4:5", note: "Portrait", value: 4 / 5 },
};

export const MAX_EXPORT_WIDTH = 4096;

export const DEFAULT_TWEET: TweetData = {
  name: "SnapPost",
  username: "snappost",
  avatar: "",
  verified: true,
  text: "Turn any tweet into a polished image in seconds. Paste a link, then download it.",
  time: "8:30 PM",
  date: "Jul 30, 2026",
  replies: 128,
  reposts: 1400,
  likes: 12000,
  views: 486000,
  image: null,
  video: null,
  quote: null,
};

export const DEFAULT_SETTINGS: Settings = {
  ratio: "auto",
  theme: "light",
  corners: "soft",
  logo: "x",
  font: "sans",
  style: "standard",
  textSize: 40,
  padding: 100,
};
