# SnapPost

Turn a post link into a polished, shareable image, PDF or short video, right in your browser.

Paste a tweet link, tweak the look, and download or copy the result. Built with Next.js and Tailwind CSS, and ready to deploy on Vercel with no environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F2yadavrajneesh%2FSnapPost)

> SnapPost is an independent tool and is not affiliated with X Corp. Posts belong to their authors, so only capture content you have the right to share.

## Features

- **Auto fetch:** paste an x.com or twitter.com link and the post loads on its own (turn it off to use the Fetch button instead). Your choice is remembered.
- **Thread detection:** if the post is part of a thread, choose **This tweet** or **Full thread**; the full thread is drawn as one screenshot with every post in order.
- **Full-resolution media:** photos load in their original resolution and are never cropped. Click any image to enlarge it (fit-to-screen or actual size, arrow keys for multiple photos, link to the original).
- **Playable video:** the preview detects video posts, picks the best MP4 (H.264, up to 1080p) and plays it directly with its own controls. GIFs autoplay and loop.
- **No cropping, ever:** pick any output ratio (3:2, 4:3, 16:9, 9:16, 1:1, 4:5) and tall posts are scaled down to fit, so the whole post and all its media stay visible.
- **Quoted posts and edit-by-hand:** quoted posts are laid out like the original, and *Edit details* (collapsed by default) lets you change the text, name, counts, time, date and avatar.
- **Compact appearance tiles:** Theme, Corners, Logo (new X, classic bird, or none) and Font are four tiles; click a tile to cycle its options.
- **Layout controls:** Standard or Minimalist style, text size, padding, *Best fit* and *Reset*.
- **Fit and zoom:** the whole card is visible by default; use the zoom buttons, *Fit* and *100%* to inspect details.
- **Export:** PNG (up to 4096 px wide), PDF, or a 5-second video, plus one-click **Copy image**. The export controls sit in the top-right of the navbar.

## Quick start

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/2yadavrajneesh/SnapPost.git
cd SnapPost
npm install
npm run dev
```

Open <http://localhost:3000>.

| Script | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |

## Deploy to Vercel

**One click:** use the *Deploy with Vercel* button above.

**Or from the dashboard:**

1. Go to <https://vercel.com/new> and import this GitHub repository.
2. Leave the defaults (Framework: Next.js, build command `npm run build`).
3. Click **Deploy**. No environment variables are required.

**Or with the CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

## Configuration (optional)

Copy `.env.example` to `.env.local` to change these. None are needed to run.

| Variable | Purpose |
|---|---|
| `FX_API_BASE` | Base URL of the FxEmbed API (default `https://api.fxtwitter.com`). Set it to your own instance if you self-host FxEmbed. |
| `MEDIA_PROXY_HOSTS` | Extra hosts (comma-separated) the image and video proxies may fetch from. By default only X's own media hosts are allowed. |

## How it works

| Piece | File |
|---|---|
| Page, controls, auto fetch, thread switch, preview, zoom and export buttons | `app/page.tsx` |
| The exportable card: posts, quotes, photos, video, thread view, fit-to-ratio | `components/TweetCard.tsx` |
| Image viewer (enlarge) | `components/Lightbox.tsx` |
| Appearance tiles | `components/AppearanceTiles.tsx` |
| Fetches a post via [FxEmbed](https://github.com/FxEmbed/FxEmbed) and returns clean JSON (5-minute cache) | `app/api/tweet/route.ts` |
| Detects and returns a whole thread | `app/api/thread/route.ts` |
| Image proxy, restricted to X image hosts, so exports aren't blocked by CORS | `app/api/image-proxy/route.ts` |
| Streaming video proxy with Range support, so videos play same-origin | `app/api/video/route.ts` |
| FxEmbed response handling: MP4 selection, full-resolution photo URLs | `lib/fx.ts` |
| PNG / PDF / video / clipboard export | `lib/export.ts` |
| Link parsing, formatting helpers, shared types | `lib/parse.ts`, `lib/format.ts`, `lib/types.ts`, `lib/media-hosts.ts` |

The tweet route asks FxEmbed for the post (the v2 API, falling back to v1), normalizes it, and flags posts that might belong to a thread. The page then asks the thread route in the background, so the tweet itself appears immediately.

## Notes and limits

- **Video exports:** the preview plays the real video, but exported PNG, PDF and video files use the video's thumbnail with a play badge, because browsers can't capture a playing video from another site. The video export is a short animation of the still image, recorded in the browser (MP4 in Chrome, Edge and Safari; WebM in Firefox).
- **Video formats:** SnapPost plays MP4 renditions. If a post only offers an HLS stream, it is attempted natively (Safari) and otherwise shows the thumbnail with a notice. Videos are streamed through your own deployment (`/api/video`), so very heavy use counts against your hosting bandwidth.
- **Threads** are detected from FxEmbed's thread data and cover the author's own chain of posts. If a thread can't be found, the single tweet still works.
- **Private or deleted posts** can't be fetched. The edit fields always work as a fallback.
- **FxEmbed is a free community service** with no guaranteed rate limits. If you expect heavy traffic, consider [self-hosting it](https://docs.fxembed.com/deployment) and setting `FX_API_BASE`.
- If you publish your own version, use your own name and logo rather than X/Twitter branding.

## Tech stack

[Next.js](https://nextjs.org/) (App Router) · React · TypeScript · [Tailwind CSS](https://tailwindcss.com/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [jsPDF](https://github.com/parallax/jsPDF) · [FxEmbed](https://github.com/FxEmbed/FxEmbed)
