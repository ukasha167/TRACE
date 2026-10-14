import { test } from "node:test";
import assert from "node:assert/strict";
import { archivePageUrl, isPlaceholderApod, parseArchivePage } from "@/lib/apod/apodArchive";
import { fetchApod } from "@/lib/apod/apodClient";

/**
 * A page in the shape science.nasa.gov serves for an archived APOD, with the
 * words made up. The structure is what the parser depends on: og:url and
 * og:image in the head, the title in the h1, the explanation in the hero's
 * description paragraph, and Date and Credit rows in the meta table.
 */
function page(opts: { slug?: string; image?: string; date?: string; credit?: string } = {}) {
  const slug = opts.slug ?? "apod-2015-september-28-a-made-up-title";
  const image =
    opts.image ??
    "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2015/september/made_up.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg";
  return `<!doctype html><html><head>
<meta property="og:title" content="APOD: 2015 September 28 &#8211; A Made Up Title - NASA Science" />
<meta property="og:url" content="https://science.nasa.gov/image-article/${slug}/" />
<meta property="og:image" content="${image}" />
</head><body>
<h1 class="display-48 margin-top-0">A Made &amp; Up Title</h1>
<p class="p-md margin-0 media-detail-hero__description">
  <strong>Explanation:</strong> An invented <a href="x">sentence</a> about a picture . It has two parts.
</p>
<table>
<tr class="media-detail-hero__meta-row"><th scope="row" class="label">Date</th>
<td class="p-sm">${opts.date ?? "September 28, 2015"}</td></tr>
<tr class="media-detail-hero__meta-row"><th scope="row" class="label">Credit</th>
<td class="p-sm"> ${opts.credit ?? "Image Credit &amp; Copyright: A. Person / <a href=\"y\">Somewhere</a>"}</td></tr>
</table></body></html>`;
}

test("the API's logo object is recognised as not a picture", () => {
  assert.ok(isPlaceholderApod({ title: "NASA Science", url: "https://science.nasa.gov/x/nasa-logo@2x.png" }));
  assert.ok(!isPlaceholderApod({ title: "Total Lunar Eclipse", url: "https://apod.nasa.gov/apod/image/x.jpg" }));
});

test("the archive URL is the old two-digit-year form", () => {
  assert.equal(archivePageUrl("2015-09-28"), "https://apod.nasa.gov/apod/ap150928.html");
  assert.equal(archivePageUrl("1999-12-31"), "https://apod.nasa.gov/apod/ap991231.html");
});

test("a day's page gives its title, image, explanation and credit", () => {
  const r = parseArchivePage(page(), "2015-09-28");
  assert.ok(r.ok);
  assert.equal(r.title, "A Made & Up Title");
  assert.equal(r.mediaType, "image");
  assert.match(r.url, /\/apod\/apod\/2015\/september\/made_up\.jpg/);
  assert.equal(r.explanation, "An invented sentence about a picture. It has two parts.");
  assert.equal(r.credit, "A. Person / Somewhere");
  assert.equal(r.copyrighted, true);
});

test("another day's page is refused, whichever way the date shows it", () => {
  assert.deepEqual(parseArchivePage(page(), "2015-09-27"), { ok: false, reason: "wrong-page" });
  // The front page a not-yet-filed date redirects to has no dated slug.
  const front = page({ slug: "x" }).replace(/og:url" content="[^"]*"/, 'og:url" content="https://science.nasa.gov/apod/"');
  assert.deepEqual(parseArchivePage(front, "2026-10-13", "https://science.nasa.gov/apod/"), { ok: false, reason: "wrong-page" });
});

const STOCK = "https://assets.science.nasa.gov/content/dam/science/astro/images/misc/news-thumbnail.png";

test("a stock thumbnail is not the day's picture", () => {
  assert.deepEqual(parseArchivePage(page({ image: STOCK }), "2015-09-28"), { ok: false, reason: "no-image" });
});

test("a video day is a video, found by its embed rather than the stock thumbnail", () => {
  const html = page({ image: STOCK }).replace(
    "</h1>",
    '</h1><iframe src="https://www.googletagmanager.com/ns.html?id=X"></iframe><iframe title="A clip" src="https://www.youtube.com/embed/abc123?feature=oembed"></iframe>'
  );
  const r = parseArchivePage(html, "2015-09-28");
  assert.ok(r.ok);
  assert.equal(r.mediaType, "video");
  assert.equal(r.url, "https://www.youtube.com/embed/abc123?feature=oembed");
});

test("an old date goes to the archive, and the API's logo is never taken for a picture", async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url.startsWith("https://apod.nasa.gov/apod/ap150928")) {
      return new Response(page(), { status: 200 });
    }
    return new Response(
      JSON.stringify({ date: "2015-09-28", title: "NASA Science", url: "https://x/nasa-logo@2x.png", media_type: "image", explanation: "", service_version: "v1" }),
      { status: 200 }
    );
  }) as typeof fetch;
  try {
    const now = new Date(Date.UTC(2026, 9, 14));
    const old = await fetchApod("2015-09-28", "KEY", now);
    assert.ok(old.ok);
    assert.equal(old.entry.title, "A Made & Up Title");
    assert.ok(seen.every((u) => !u.includes("api.nasa.gov")), "the archive answered, so the API was not asked");

    // A recent date whose API answer is the logo is a failure, not a picture.
    const recent = await fetchApod("2026-10-10", "KEY", now);
    assert.equal(recent.ok, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
