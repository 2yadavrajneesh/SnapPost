# SnapPost

Four small tools, right in your browser. Switch between them with the buttons at the top of the page.

| Tool | Page | What it does |
|---|---|---|
| **SnapPost** | `/` | Turn a post link into a polished, shareable image, PDF or short video. |
| **ThreadScroll** | `/unroll` | Unroll a whole thread to read, print or save it as text, Markdown or a paged PDF. |
| **CollageMaker** | `/collage` | Paste several tweet links and make one clean, aligned collage as a PNG or PDF. |
| **PaperNest** | `/pdf` | PDF tools run on the server: upload, get a download link, files are deleted after 30 minutes. Needs a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`). Phase 1: Merge and Rotate. |
| **LinkDesk** | `/links` | Link tools: open links in batches, make spreadsheet links clickable, extract and clean links, and archive pages. |

Paste a link, tweak the look, and download or copy the result. Built with Next.js and Tailwind CSS. No environment variables are needed to run it.

> SnapPost is an independent tool and is not affiliated with X Corp. Posts belong to their authors, so only capture content you have the right to share.

## SnapPost features

- **Auto fetch:** paste an x.com or twitter.com link and the post loads on its own (turn it off to use the Fetch button instead). Your choice is remembered.
- **Thread detection:** if the post is part of a thread, choose **This tweet** or **Full thread**; the full thread is drawn as one screenshot with every post in order.
- **Full-resolution media:** photos load in their original resolution and are never cropped. Click any image to enlarge it (fit-to-screen or actual size, arrow keys for multiple photos, link to the original).
- **Playable video:** the preview detects video posts, picks the best MP4 (H.264, up to 1080p) and plays it directly with its own controls. GIFs autoplay and loop.
- **No cropping, ever:** pick any output ratio (3:2, 4:3, 16:9, 9:16, 1:1, 4:5) and tall posts are scaled down to fit, so the whole post and all its media stay visible.
- **Quoted posts and edit-by-hand:** quoted posts are laid out like the original, and *Edit details* (collapsed by default) lets you change the text, name, counts, time, date and avatar.
- **Compact appearance tiles:** Theme, Corners, Logo (new X, classic bird, or none) and Font are four tiles; click a tile to cycle its options.
- **Layout controls:** Standard or Minimalist style, text size, padding, *Best fit* and *Reset*.
- **Fit and zoom:** the whole card is visible by default; use the zoom buttons, *Fit* and *100%* to inspect details.
- **Thread as a carousel:** with a thread loaded, choose *Thread* (one long screenshot) or *Carousel* (one slide per post, exported as a ZIP of PNGs or a multi-page PDF).
- **Highlight and redact:** select text to highlight it (marker, underline or bar) or to hide it (blur or solid bar). You can also hide the name, avatar and media. Find it under *Edit details*.
- **Download attached media:** save photos in several sizes and videos in every available resolution (1080p, 720p and so on), with the file size shown before you download. Videos over the download limit are blocked.
- **Verified badges:** blue, gold (organisation) and grey (government) badges are detected automatically.
- **Copy image:** one click, or Ctrl/Cmd+Shift+C.
- **Site theme:** a round button switches the whole site between light and dark.
- **Export:** PNG (up to 4096 px wide), PDF, or a 5-second video, plus one-click **Copy image**. The export controls sit in the top-right of the navbar.

## ThreadScroll features

- **Paste and go:** use the clipboard button (or paste into the box) and the thread loads on its own. The reset button clears everything so you can start with another link. It works from any post in the thread.
- **Whole thread in order:** every post by the author, numbered 1/n, with photos, videos and (optionally) likes, reposts and views. If no thread is found you are asked *"Thread not found. Do you want to continue with a single tweet?"* and can carry on with just that post (PDF included).
- **Copy or download as text:** *Copy as text*, *Copy Markdown*, *Download .txt* and *Download .md*.
- **Page size and orientation:** A4, A3, A5, A6, B5, US Letter, US Legal, Tabloid or Executive, in portrait or landscape.
- **Print layout preview:** the *Pages* preview shows the pages exactly as they will print. *Reading* shows one continuous page (the default on phones).
- **One post per page, never cut:** each post gets its own page. A post taller than the page is scaled down to fit. The first page carries the author header, and every page has a footer with the post and page number.
- **Page themes:** Paper, Sepia, Dark, Newsprint or Ocean. The choice applies to the preview and the PDF.
- **Page number position and format:** put the number in any corner, at the top, bottom, left, right or centre, or hide it. Formats: `1 / 4`, `1`, `Page 1 of 4`, `Page 1`, `- 1 -` and Roman numerals. The count shows once per page.
- **Background label:** an optional light, editable watermark such as *Confidential* or *Important* behind every page, subtle enough to keep the text readable.
- **Undo:** the marker and redact tools (in both apps) have an *Undo* button that steps back through your changes.
- **Go to top:** a button appears in the viewer of both apps once you scroll down a long thread.
- **Marker and redact:** highlight text (16 colours plus a custom one) or hide it with bars or blur. Redactions carry into the PDF and the text exports.
- **Collapsed options:** *Display*, *Page*, *Marker & redact* and *Background label* start closed to keep the sidebar short.
- **Rising-dot stage:** the viewer has its own teal dotted animation, different from SnapPost's.
- **PDF download:** the PDF is built from the same pages as the preview, so every language and emoji carry over. Pages are images, so the text in the PDF cannot be selected or searched.

- **Top bar:** on wide screens (1280 px and up) the five tools sit in the bar; on laptops, tablets and phones they fold into a *Tools* menu button, which closes after you pick a tool, on Escape or when you tap outside it.

## CollageMaker features

- **Add tweets:** paste up to 12 links at once (one per line or separated by spaces). Each loads on its own, three at a time, with a retry button when one fails. Repeats and non-tweet links are skipped.
- **Order:** drag tweets in the list, or use the up and down buttons. Remove any tweet.
- **Even grid:** every tweet gets a cell of the same size, so rows and columns line up exactly. A lone photo or video stretches to fill spare height, and the date and counts stay at the bottom. Tall tweets shrink to fit instead of being cut. The last row can be centred or left-aligned.
- **Masonry:** tweets keep their own height and fill the columns, and the picture height fits the content.
- **Columns and shape:** automatic or 1 to 5 columns; picture shape Auto, Square 1:1, Portrait 4:5, Wide 16:9 or Story 9:16 (grid only).
- **Style:** nine backgrounds plus a custom colour, light or dark cards, sharp, soft or round corners, X or bird logo, text size, gap and margin, and switches for pictures, counts, time and date, card outline and a soft shadow.
- **Save:** PNG or PDF at 1600 px or 3200 px wide.

## LinkDesk features

Everything runs in the browser. Files are never uploaded. The tabs share one link list, so any tool can *Send to batches*:

- **Open in batches:** load a spreadsheet (.xlsx, .xls, .csv), paste links or use the sample list, then open them 10, 20, 30, 50 or any number up to 100 at a time. Progress, next-up batch, a one-link-per-click fallback when pop-ups are blocked, a status table with search and filters, *Copy report*, and `Alt + O` to open the next batch. The list is saved in this browser.
- **Make links:** upload an Excel or CSV file and download a copy where every plain-text address is clickable (optionally bare domains too). Previews each sheet, and can send the links to the batch tool.
- **Extract links:** paste text or add a Word (.docx), PDF, text or HTML file and pull out every web address, including links hidden behind clickable words. Options to remove duplicates, join links split across lines and find bare domains. Copy them, download an .xlsx or send them to batches.
- **Link Cleaner:** paste messy links or add a spreadsheet or text file. It removes everything after the `?` when a page does not need it (for example `x.com/user/status/123?a=abc` becomes `x.com/user/status/123`), removes tracking codes (`utm_`, `fbclid`, `gclid` and others), unwraps redirect links from Google, Facebook, Outlook and similar, fixes broken schemes and defanged links (`hxxp`, `[.]`), drops invalid lines and duplicates, and can check that each site responds. *Clean these links* in Extract links hands its list straight over.
- **Archive a page:** a fifth LinkDesk tab. No account or API key: the server asks the Internet Archive's public endpoints directly.
- **Auto check:** paste any web link and it looks up the newest Wayback snapshot on its own.
- **Save to the Wayback Machine:** *Save now* captures the page (it can take up to a minute) and gives you the snapshot link to open or copy.
- **Other archives:** archive.today and Ghost Archive open in a new tab with your link filled in, because they ask for a check on their own sites. *Save everywhere* does the Wayback save and opens archive.today in one click.
- **Saved list:** pages you save are listed in this browser only, with *Copy all* and *Clear list*.
- **Limits:** saving is limited per IP (`RATE_LIMIT_ARCHIVE_MAX`, default 8 per 10 minutes). Some sites block archiving, and a saved copy is public.

LinkDesk limits: files up to 100 MB, spreadsheets up to 1,000,000 cells, up to 5,000 links per list, pasted text up to 2 million characters, PDFs read up to 300 pages. SheetJS, JSZip and PDF.js load from cdnjs only when a tool needs them. *Check they respond* needs to reach other websites, and it shows whether a site answers; it cannot tell whether one specific page exists. Scanned PDFs have no selectable text. Allow pop-ups so a whole batch of tabs can open at once.

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

## Configuration (optional)

Copy `.env.example` to `.env.local` to change these. None are needed to run.

| Variable | Purpose |
|---|---|
| `FX_API_BASE` | Base URL of the FxEmbed API (default `https://api.fxtwitter.com`). Set it to your own instance if you self-host FxEmbed. |
| `MEDIA_PROXY_HOSTS` | Extra hosts (comma-separated) the image and video proxies may fetch from. By default only X's own media hosts are allowed. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Stores per-IP rate-limit counts in Upstash Redis so limits are exact across servers. Without them, counts are kept in server memory. |
| `RATE_LIMIT_*` | Optional overrides for the per-IP limits (`API`, `MEDIA`, `DOWNLOAD`, `ARCHIVE`, each with `_MAX` and `_WINDOW_SEC`). See `.env.example`. By default an IP may make 30 tweet or thread requests per 10 minutes, 300 media requests per 10 minutes and 10 video downloads per hour. Over the limit it gets a "try again in N minutes" message and can use the site again when the window ends. |
| `NEXT_PUBLIC_MAX_VIDEO_MB` | Largest video that can be downloaded (default 100). Bigger videos show "Too large" in the download picker and are refused by the server. |

## How it works

| Piece | File |
|---|---|
| SnapPost page: controls, auto fetch, thread switch, preview, zoom and export buttons | `app/page.tsx` |
| CollageMaker page, layout rules and card | `app/collage/page.tsx`, `lib/collage.ts`, `components/collage/*` |
| PaperNest tools, storage and API | `app/pdf/*`, `app/api/pdf/*`, `lib/pdf/*`, `components/pdf/*` |
| LinkDesk page, its four tools and shared list | `app/links/page.tsx`, `components/linkdesk/*`, `lib/linkdesk/*` |
| Archive tab and its save/lookup route | `components/linkdesk/ArchiveTool.tsx`, `app/api/archive/route.ts`, `lib/archive.ts` |
| ThreadScroll page: link box, display options, page size, orientation, text and PDF export | `app/unroll/page.tsx` |
| ThreadScroll views: reading view and the one-post-per-page layout | `components/ThreadView.tsx` |
| Top bar shared by both tools (names, icons, tool buttons, theme switch) | `components/SiteHeader.tsx`, `lib/tools.tsx`, `lib/useSiteTheme.ts` |
| Page sizes and the PDF builder | `lib/paper.ts` |
| Per-IP rate limiting and the video size limit | `lib/ratelimit.ts`, `lib/limits.ts` |
| Media size lookup for the download picker | `app/api/media-size/route.ts` |
| The exportable card: posts, quotes, photos, video, thread view, fit-to-ratio | `components/TweetCard.tsx` |
| Image viewer (enlarge) | `components/Lightbox.tsx` |
| Appearance tiles | `components/AppearanceTiles.tsx` |
| Fetches a post via [FxEmbed](https://github.com/FxEmbed/FxEmbed) and returns clean JSON (5-minute cache) | `app/api/tweet/route.ts` |
| Detects and returns a whole thread (used by both tools) | `app/api/thread/route.ts` |
| Image proxy, restricted to X image hosts, so exports aren't blocked by CORS | `app/api/image-proxy/route.ts` |
| Streaming video proxy with Range support, so videos play same-origin | `app/api/video/route.ts` |
| FxEmbed response handling: MP4 selection, full-resolution photo URLs | `lib/fx.ts` |
| PNG / PDF / video / clipboard export | `lib/export.ts` |
| Link parsing, formatting helpers, shared types | `lib/parse.ts`, `lib/format.ts`, `lib/types.ts`, `lib/media-hosts.ts` |

The tweet route asks FxEmbed for the post (the v2 API, falling back to v1), normalizes it, and flags posts that might belong to a thread. The page then asks the thread route in the background, so the tweet itself appears immediately.

## Notes and limits

- **Video exports:** the preview plays the real video, but exported PNG, PDF and video files use the video's thumbnail with a play badge, because browsers can't capture a playing video from another site. The video export is a short animation of the still image, recorded in the browser (MP4 in Chrome, Edge and Safari; WebM in Firefox).
- **Video formats:** SnapPost plays MP4 renditions. If a post only offers an HLS stream, it is attempted natively (Safari) and otherwise shows the thumbnail with a notice. Videos are streamed through your own deployment (`/api/video`), so very heavy use counts against your hosting bandwidth. Downloads are capped (see `NEXT_PUBLIC_MAX_VIDEO_MB`) and rate limited per IP.
- **Threads** are detected from FxEmbed's thread data and cover the author's own chain of posts. If a thread can't be found, the single tweet still works.
- **Private or deleted posts** can't be fetched. The edit fields always work as a fallback.
- **FxEmbed is a free community service** with no guaranteed rate limits. If you expect heavy traffic, consider [self-hosting it](https://docs.fxembed.com/deployment) and setting `FX_API_BASE`.
- If you publish your own version, use your own name and logo rather than X/Twitter branding.

## Tech stack

[Next.js](https://nextjs.org/) (App Router) · React · TypeScript · [Tailwind CSS](https://tailwindcss.com/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [jsPDF](https://github.com/parallax/jsPDF) · [fflate](https://github.com/101arrowz/fflate) · [FxEmbed](https://github.com/FxEmbed/FxEmbed)
