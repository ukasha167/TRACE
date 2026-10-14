/**
 * NASA'S PICTURE OF THE DAY, READ FROM ITS ARCHIVE PAGE.
 *
 * APOD moved onto science.nasa.gov, and the JSON API stopped answering for
 * past dates. For anything older than the last few days it now returns the
 * same object every time: title "NASA Science", a stock blurb and the NASA
 * logo as the image, with a 200. The app took that for a picture, cached it
 * for good, and put NASA's logo on every record under "NASA's picture for
 * that day".
 *
 * The archive URLs still work. apod.nasa.gov/apod/apYYMMDD.html redirects to
 * that day's page on the new site, and the page carries the title, the image,
 * the explanation and the credit. This reads them. The API stays first,
 * because it is still right for recent days and costs one small JSON reply.
 *
 * TWO WAYS TO GET THE WRONG PAGE, both seen: a date the new site has not
 * filed redirects to the APOD front page, which shows some other day; and a
 * few old pages have no image of their own, only a generic thumbnail. The
 * page's own date has to match, and the image has to be one of APOD's.
 */

/** The object the API returns for dates it no longer serves. */
export function isPlaceholderApod(raw: { title?: unknown; url?: unknown }): boolean {
  const url = typeof raw.url === "string" ? raw.url : "";
  return raw.title === "NASA Science" || /nasa-logo/i.test(url);
}

export function archivePageUrl(date: string): string {
  const [y, m, d] = date.split("-");
  return `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…",
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => NAMED[name.toLowerCase()] ?? all);
}

/** Tags out, entities decoded, whitespace collapsed. */
function plain(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

function meta(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? decode(m[1]) : null;
}

export type ArchiveParse =
  | {
      ok: true;
      title: string;
      /** The day's image, or for a video day the video's embed address. */
      url: string;
      mediaType: "image" | "video";
      explanation: string;
      /** The credit line without its "Image Credit:" label, or null. */
      credit: string | null;
      /** True when the credit names a copyright holder. */
      copyrighted: boolean;
    }
  | { ok: false; reason: "wrong-page" | "no-image" };

/** The page's own date, from its slug or its Date row, as "YYYY-MM-DD". */
function pageDate(html: string, finalUrl?: string): string | null {
  const fromSlug = (finalUrl ?? meta(html, "og:url") ?? "").match(/apod-(\d{4})-([a-z]+)-(\d{1,2})\b/i);
  const fromRow = html.match(/>\s*Date\s*<\/th>\s*<td[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  let y: number, mo: number, d: number;
  if (fromSlug) {
    y = Number(fromSlug[1]);
    mo = MONTHS.indexOf(fromSlug[2].toLowerCase()) + 1;
    d = Number(fromSlug[3]);
  } else if (fromRow) {
    y = Number(fromRow[3]);
    mo = MONTHS.indexOf(fromRow[1].toLowerCase()) + 1;
    d = Number(fromRow[2]);
  } else return null;
  if (mo < 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseArchivePage(html: string, date: string, finalUrl?: string): ArchiveParse {
  if (pageDate(html, finalUrl) !== date) return { ok: false, reason: "wrong-page" };

  // APOD's own images live under /apod/ on the asset host. Anything else is
  // the site's stock thumbnail, which is not that day's picture. A video day
  // has the stock thumbnail and the video embedded in the page.
  const og = meta(html, "og:image");
  const image = og && /\/apod\//i.test(og) && !/news-thumbnail|nasa-logo/i.test(og) ? og : null;
  const video = image
    ? null
    : html.match(/<iframe[^>]+src="(https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/embed|player\.vimeo\.com\/video)\/[^"]+)"/i)?.[1] ?? null;
  if (!image && !video) return { ok: false, reason: "no-image" };

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title =
    (h1 && plain(h1[1])) ||
    (meta(html, "og:title") ?? "")
      .replace(/^APOD:\s*\d{4}\s+\w+\s+\d{1,2}\s*[-–]\s*/i, "")
      .replace(/\s*-\s*NASA Science\s*$/i, "")
      .trim();
  if (!title) return { ok: false, reason: "wrong-page" };

  const desc = html.match(/media-detail-hero__description[^>]*>([\s\S]*?)<\/p>/i);
  const explanation = desc ? plain(desc[1]).replace(/^Explanation:\s*/i, "") : "";

  const creditCell = html.match(/>\s*Credit\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  const creditText = creditCell ? plain(creditCell[1]) : "";
  const copyrighted = /copyright/i.test(creditText);
  const credit =
    creditText.replace(/^(?:Image|Video|Illustration|Animation)?\s*Credits?(?:\s*(?:&|and)\s*Copyright)?\s*:\s*/i, "").trim() ||
    null;

  return {
    ok: true,
    title,
    url: image ?? decode(video!),
    mediaType: image ? "image" : "video",
    explanation,
    credit,
    copyrighted,
  };
}
