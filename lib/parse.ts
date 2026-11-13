export type ParsedTweetUrl = { username: string; id: string };

const TWEET_URL =
  /^https?:\/\/(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com)\/([A-Za-z0-9_]{1,30})\/status(?:es)?\/(\d{1,25})/i;

/** Extracts the username and status id from an X/Twitter-style link. */
export function parseTweetUrl(input: string): ParsedTweetUrl | null {
  const match = input.trim().match(TWEET_URL);
  if (!match) return null;
  return { username: match[1], id: match[2] };
}

const TWEET_IN_TEXT = /(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com)\/[A-Za-z0-9_]{1,30}\/status(?:es)?\/\d{1,25}/gi;

/** Finds every tweet link inside any text (a pasted paragraph, a CSV, an HTML page), with or without https://. */
export function findTweetLinks(text: string): string[] {
  return (text.match(TWEET_IN_TEXT) ?? []).map((m) => (/^https?:/i.test(m) ? m : `https://${m}`));
}
