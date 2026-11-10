export type VideoData = {
  /** Playable MP4 URLs, best first. */
  sources: string[];
  /** HLS playlist: a last resort that only some browsers (Safari) can play natively. */
  hls: string | null;
  poster: string | null;
  width: number;
  height: number;
  gif: boolean;
  /** MP4 renditions for downloading, tallest first. */
  variants?: { url: string; height: number; width: number }[];
};

/** A post as returned by the API: the main tweet, a quoted tweet, or one tweet of a thread. */
export type PostData = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  verifiedType?: VerifiedType;
  text: string;
  timestamp: number | null;
  photos: string[];
  video: VideoData | null;
  replies: number;
  reposts: number;
  likes: number;
  views: number;
  replyingTo?: string | null;
  quote: PostData | null;
};

export type QuoteData = PostData;

/** The main tweet being edited on screen (time and date are display strings you can change). */
export type VerifiedType = "blue" | "gold" | "gray";

export type TweetData = {
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  verifiedType?: VerifiedType;
  text: string;
  time: string;
  date: string;
  replies: number;
  reposts: number;
  likes: number;
  views: number;
  /** Shown instead of the compact count (e.g. "002" for the sample post). */
  viewsLabel?: string;
  photos: string[];
  video: VideoData | null;
  quote: PostData | null;
  /** Handle this tweet replies to (without the @), when it is a reply. */
  replyingTo?: string | null;
  /** The posts above this reply, oldest first (only when it replies to someone else). */
  parents?: PostData[];
};

/** Which screenshot to produce when a tweet is part of a thread. */
export type ShotMode = "single" | "thread" | "carousel";

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
  avatar: "/snappost-logo.svg", // the sample post wears the site logo
  verified: true,
  text: "Turn any tweet into a polished image in seconds. Paste a link, then download it.",
  time: "10:00 AM",
  date: "2 January 1996",
  replies: 128,
  reposts: 1400,
  likes: 12000,
  views: 2,
  viewsLabel: "002",
  photos: [],
  video: null,
  quote: null,
};

export const DEFAULT_SETTINGS: Settings = {
  ratio: "auto",
  theme: "light",
  corners: "sharp",
  logo: "x",
  font: "sans",
  style: "minimal",
  textSize: 40,
  padding: 60,
};
