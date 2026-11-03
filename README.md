# SnapPost

Turn a post link into a polished, shareable image, PDF or short video, right in your browser.

Paste a tweet link, tweak the look, and download or copy the result. Built with Next.js and Tailwind CSS, and ready to deploy on Vercel with no environment variables.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F2yadavrajneesh%2FSnapPost)

> SnapPost is an independent tool and is not affiliated with X Corp. Posts belong to their authors, so only capture content you have the right to share.

## Features

- **Fetch by link:** paste an x.com or twitter.com link and the post loads automatically (text, author, counts, photos, videos and quoted posts). No API key needed.
- **Edit everything:** the *Edit details* panel (collapsed by default) lets you change the text, name, username, counts, time, date and avatar, or build a card from scratch if fetching isn't possible.
- **Playable video preview:** video posts play in the preview with their own controls; GIFs autoplay and loop.
- **Quoted posts:** nested quote cards laid out like the original.
- **Look and feel:** light or dark theme, Standard or Minimalist style, corner radius, font, text size and padding, plus *Best fit* and *Reset*.
- **Logo choice:** the new X logo, the classic bird, or none.
- **Output ratios:** Auto, 3:2, 4:3, 16:9, 9:16, 1:1 and 4:5.
- **Fit and zoom:** the whole card is always visible by default; use the zoom buttons, *Fit* and *100%* to inspect details.
- **Export:** PNG (up to 4096 px wide), PDF, or a 5-second video, with a one-click **Copy image** to the clipboard. The export controls live in the top-right of the navbar.

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

## How it works

| Piece | File |
|---|---|
| Page, controls, preview, zoom and export buttons | `app/page.tsx` |
| The exportable card (posts, quotes, media, video) | `components/TweetCard.tsx` |
| Fetches a post via [FxEmbed](https://github.com/FxEmbed/FxEmbed) and returns clean JSON (5-minute cache) | `app/api/tweet/route.ts` |
| Image proxy, restricted to X image hosts, so exports aren't blocked by CORS | `app/api/image-proxy/route.ts` |
| PNG, PDF, video and clipboard export | `lib/export.ts` |
| Link parsing, formatting helpers and shared types | `lib/parse.ts`, `lib/format.ts`, `lib/types.ts` |

The tweet route turns `https://x.com/user/status/123` into `https://api.fxtwitter.com/user/status/123` and returns the text, author, counts, media and any quoted post.

## Notes and limits

- **Video exports:** the preview plays the real video, but exported PNG, PDF and video files use the video's thumbnail with a play badge, because browsers can't capture a video from another site. The video export is a short animation of the still image, recorded in the browser (MP4 in Chrome, Edge and Safari; WebM in Firefox).
- **Private or deleted posts** can't be fetched. The edit fields always work as a fallback.
- **FxEmbed is a free community service** with no guaranteed rate limits. If you expect heavy traffic, consider [self-hosting it](https://docs.fxembed.com/deployment) and updating the URL in `app/api/tweet/route.ts`.
- **Tall content in a fixed ratio** is cropped, and the app shows a warning when that happens.
- If you publish your own version, use your own name and logo rather than X/Twitter branding.

## Tech stack

[Next.js](https://nextjs.org/) (App Router) · React · TypeScript · [Tailwind CSS](https://tailwindcss.com/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [jsPDF](https://github.com/parallax/jsPDF) · [FxEmbed](https://github.com/FxEmbed/FxEmbed)
