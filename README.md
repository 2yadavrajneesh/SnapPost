# OpenLens

**OpenLens** is a set of six small tools for posts, links and PDFs that run in your browser. Your work is saved on your device for 7 days, every tool has Undo, Redo and Reset, and nothing is uploaded unless a tool says so.

| Tool | Page | What it does |
|---|---|---|
| **SnapPost** | `/snappost` | Turn a post link into a shareable image, PDF or short video. |
| **ThreadScroll** | `/unroll` | Unroll a thread to read, print or save as text, Markdown or a paged PDF. |
| **CollageMaker** | `/collage` | Combine tweet links and pictures into one aligned collage (PNG or PDF). |
| **ClipBook** | `/clipbook` | Bulk news screenshots to one daily-update PDF (English and Hindi). Runs on the server and needs a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`); files are deleted after 30 minutes. |
| **EditPDF** | `/editpdf` | Edit, Organize, Page numbers, Redact, Merge, Split, Extract, Rotate and Watermark. A file can be passed from one tool to another. |
| **LinkDesk** | `/links` | Open links in batches, make spreadsheet links clickable, extract and clean links, archive pages. |

> OpenLens is independent and not affiliated with X Corp. Posts belong to their authors, so only capture content you have the right to share.

## Quick start

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/2yadavrajneesh/SnapPost.git
cd SnapPost
npm install
npm run dev
```

Open <http://localhost:3000>. No environment variables are needed to run it.

| Script | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |

## Configuration (optional)

Copy `.env.example` to `.env.local` to change these.

| Variable | Purpose |
|---|---|
| `FX_API_BASE` | FxEmbed API base URL (default `https://api.fxtwitter.com`). |
| `MEDIA_PROXY_HOSTS` | Extra hosts (comma-separated) the media proxies may fetch from. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Store per-IP rate-limit counts in Upstash Redis. Without them, counts are kept in server memory. |
| `RATE_LIMIT_*` | Per-IP limit overrides (`API`, `MEDIA`, `DOWNLOAD`, `ARCHIVE`, each with `_MAX` and `_WINDOW_SEC`). See `.env.example`. |
| `NEXT_PUBLIC_MAX_VIDEO_MB` | Largest video that can be downloaded (default 100). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token, needed by ClipBook and EditPDF's server pipeline. |

## Project layout

| Folder | Contents |
|---|---|
| `app/` | One page per tool (`snappost`, `unroll`, `collage`, `clipbook`, `editpdf`, `links`) and the API routes in `app/api/` |
| `components/` | Shared UI in `ui/` (shadcn), plus `snappost/`, `unroll/`, `layout/`, `collage/`, `linkdesk/` and `pdf/` |
| `lib/` | Post fetching (`fx.ts`), export, rate limiting, session storage, PDF and link helpers |

## Notes

- **Video exports** use the video's thumbnail, because browsers can't capture a playing video from another site. Videos are streamed through your own deployment, so heavy use counts against its bandwidth.
- **Threads** cover the author's own chain of posts. Private or deleted posts can't be fetched.
- **FxEmbed** is a free community service with no guaranteed limits; consider [self-hosting it](https://docs.fxembed.com/deployment) for heavy traffic.
- If you publish your own version, use your own name and logo rather than X/Twitter branding.

## Tech stack

[Next.js](https://nextjs.org/) · React · TypeScript · [Tailwind CSS](https://tailwindcss.com/) · [shadcn/ui](https://ui.shadcn.com/) · [html-to-image](https://github.com/bubkoo/html-to-image) · [jsPDF](https://github.com/parallax/jsPDF) · [pdf-lib](https://github.com/Hopding/pdf-lib) · [fflate](https://github.com/101arrowz/fflate) · [FxEmbed](https://github.com/FxEmbed/FxEmbed)
