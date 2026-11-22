import { createHash } from "node:crypto";
const FEEDS = [
  "https://www.kenyanews.go.ke/category/agri/feed/",
  "https://www.kenyanews.go.ke/category/agriculture/feed/",
  "https://www.kenyanews.go.ke/category/food/feed/",
  "https://www.kenyanews.go.ke/feed/",
  "https://www.standardmedia.co.ke/rss/agriculture.php",
  "https://www.fao.org/feeds/fao-newsroom-rss",
  "https://eastleighvoice.co.ke/rss/agriculture",
  "https://farmbizafrica.com/feed/",
  "https://farmersreviewafrica.com/feed/",
  "https://news.google.com/rss/search?q=Kenya+agriculture+OR+livestock+OR+farming&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=East+Africa+agriculture+farmers+livestock&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+crops+maize+horticulture+farmers&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+poultry+dairy+livestock+markets&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+agricultural+research+climate+irrigation&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+maize+wheat+rice+beans+crop+farmers&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+dairy+milk+farmers+cooperatives&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+livestock+cattle+goats+animal+health&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+poultry+chicken+eggs+farmers&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+agricultural+commodity+prices+markets+exports&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+weather+rainfall+drought+climate+farmers&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+agricultural+policy+KALRO+research+extension&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Africa+agriculture+food+security+farming+innovation&hl=en-KE&gl=KE&ceid=KE:en"
];

const ALLOWED_HOSTS = [
  "kenyanews.go.ke", "fao.org", "kalro.org", "kilimo.go.ke",
  "talkafrica.co.ke", "farmbizafrica.com", "farmersreviewafrica.com",
  "nation.africa", "standardmedia.co.ke", "the-star.co.ke",
  "businessdailyafrica.com", "allafrica.com", "agriculture.com",
  "reliefweb.int", "theeastafrican.co.ke", "capitalfm.co.ke",
  "news.google.com", "eastleighvoice.co.ke"
];
const ROBOTS_CACHE = new Map();
const FETCH_HEADERS = {
  "user-agent": "ShambaVetAgriculturalNewsBot/1.0 (+https://shambavet.vercel.app; public agricultural news reader)",
  "accept": "text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.7"
};

function decode(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/&rsquo;|&#8217;/gi, "’").replace(/&lsquo;|&#8216;/gi, "‘").replace(/&rdquo;|&#8221;/gi, "”").replace(/&ldquo;|&#8220;/gi, "“").replace(/&ndash;|&#8211;/gi, "–").replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function xmlField(block, name) {
  const re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i");
  return decode(block.match(re)?.[1] || "").trim();
}
function cleanText(html = "") {
  return decode(String(html).replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}
function meta(html, key) {
  const patterns = [
    new RegExp("<meta[^>]+(?:property|name)=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"']", "i"),
    new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']" + key + "[\"']", "i")
  ];
  for (const re of patterns) { const match = html.match(re); if (match) return decode(match[1]); }
  return "";
}
function allowedHost(host) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some(domain => h === domain || h.endsWith("." + domain));
}
async function fetchText(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return { text: await response.text(), url: response.url || url, contentType: response.headers.get("content-type") || "" };
  } finally { clearTimeout(timer); }
}
async function robotsAllows(url) {
  const parsed = new URL(url);
  if (ROBOTS_CACHE.has(parsed.origin)) return ROBOTS_CACHE.get(parsed.origin).then(paths => !paths.some(path => path !== "/" && parsed.pathname.startsWith(path)));
  const pending = (async () => {
    try {
      const response = await fetch(parsed.origin + "/robots.txt", { headers: FETCH_HEADERS, signal: AbortSignal.timeout(3000) });
      if (!response.ok) return [];
      const lines = (await response.text()).split(/\r?\n/);
      let applies = false, paths = [];
      for (const raw of lines) {
        const line = raw.split("#")[0].trim();
        if (!line) continue;
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (!match) continue;
        const key = match[1].toLowerCase(), value = match[2].trim();
        if (key === "user-agent") applies = value === "*" || /shambavet/i.test(value);
        else if (applies && key === "disallow" && value) paths.push(value);
      }
      return paths;
    } catch { return []; }
  })();
  ROBOTS_CACHE.set(parsed.origin, pending);
  const paths = await pending;
  return !paths.some(path => path !== "/" && parsed.pathname.startsWith(path));
}
function classify(text = "") {
  const t = text.toLowerCase();
  if (/dairy|milk|milk cooling|dairy cooperative/.test(t)) return "Dairy";
  if (/cattle|beef|goat|sheep|livestock|veterinar|animal health/.test(t)) return "Livestock";
  if (/poultry|chicken|broiler|egg|hatchery/.test(t)) return "Poultry";
  if (/coffee|tea|maize price|market price|export|commodity|auction|trade/.test(t)) return "Markets";
  if (/rain|drought|weather|climate|flood|irrigation/.test(t)) return "Weather & climate";
  if (/research|policy|kalro|extension|innovation|government/.test(t)) return "Research & policy";
  if (/crop|maize|wheat|rice|potato|seed|fertili|horticulture|farming/.test(t)) return "Crops";
  return "Agriculture";
}
function extractWords(text, limit = 400) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, limit).join(" ");
}
function usableArticleImage(value, baseUrl, hint = "") {
  if (!value || /^data:/i.test(value)) return "";
  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return "";
    const probe = (url.pathname + " " + url.search + " " + hint).toLowerCase();
    if (/(facebook|fb[-_]?icon|twitter|instagram|whatsapp|linkedin|social|share|comment|avatar|author|profile|logo|favicon|sprite|placeholder|default[-_]?image|epaper|app[-_]?store|play-lh\.googleusercontent|badge|icon|\.svg(?:$|[?#]))/i.test(probe)) return "";
    if (/(1x1|pixel|tracking)/i.test(probe)) return "";
    return url.href;
  } catch { return ""; }
}
function firstImage(html, area, baseUrl) {
  const candidates = [];
  for (const key of ["og:image", "og:image:url", "twitter:image"]) {
    const value = meta(html, key);
    if (value) candidates.push({ value, hint: key });
  }
  const imgTags = [...area.matchAll(/<(?:img|source)\b[^>]*>/gi)].map(m => m[0]);
  for (const tag of imgTags) {
    const hint = [tag.match(/alt=["']([^"']*)["']/i)?.[1], tag.match(/(?:class|id)=["']([^"']*)["']/i)?.[1]].filter(Boolean).join(" ");
    const srcset = tag.match(/(?:srcset|data-srcset)=["']([^"']+)["']/i)?.[1];
    if (srcset) candidates.push({ value: srcset.split(",")[0].trim().split(/\s+/)[0], hint });
    const src = tag.match(/(?:data-lazy-src|data-original|data-src|src)=["']([^"']+)["']/i)?.[1];
    if (src) candidates.push({ value: src, hint });
  }
  for (const candidate of candidates) {
    const accepted = usableArticleImage(candidate.value, baseUrl, candidate.hint);
    if (accepted) return accepted;
  }
  return "";
}
function structuredMedia(html, baseUrl) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let image = "", video = "";
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (!image && value.image) {
      const img = typeof value.image === "string" ? value.image : value.image.url || value.image.contentUrl;
      if (img) image = img;
    }
    if (!video && value.video) {
      const v = Array.isArray(value.video) ? value.video[0] : value.video;
      video = typeof v === "string" ? v : v.contentUrl || v.embedUrl || v.url || "";
    }
    if (!video && (value["@type"] === "VideoObject" || String(value["@type"] || "").includes("Video"))) {
      video = value.contentUrl || value.embedUrl || value.url || "";
    }
    Object.values(value).forEach(visit);
  };
  for (const match of scripts) { try { visit(JSON.parse(match[1])); } catch {} }
  const absolute = value => { try { return value ? new URL(value, baseUrl).href : ""; } catch { return ""; } };
  return { image: absolute(image), videoUrl: absolute(video) };
}
function readArticle(html, baseUrl) {
  const removeNoise = value => String(value || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|button|iframe|dialog)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:div|section|ul|ol)[^>]*(?:class|id)=["'][^"']*(?:cookie|consent|newsletter|subscribe|advert|promo|social|share|related|recommend|breadcrumb|navigation|menu|footer|header|sidebar|app-download|epaper|logo)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul|ol)>/gi, " ");
  const cleanRegion = value => {
    let area = removeNoise(value);
    area = area.replace(/<\/(?:p|h[1-6]|li|blockquote|figure|figcaption|div|section|article)\s*>/gi, "\n");
    const reject = /^(?:advertisement|subscribe|sign up|download our app|read more|related (?:stories|articles)|share this|follow us|advert|cookie policy|privacy policy|terms and conditions|the standard group plc|standard media group|contact us|all rights reserved|home|news|business|sports|entertainment|opinion|epaper)\b/i;
    const paragraphs = area.split(/\n+/).map(cleanText)
      .filter(p => p.length > 55 && !reject.test(p) &&
        !/^(?:https?:\/\/|©\s*\d{4}|telephone number:|email:|mombasa road|download the app)/i.test(p) &&
        !/^(?:the standard group plc|the standard group center|follow us on)/i.test(p));
    return [...new Set(paragraphs)];
  };
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  const candidates = [
    article,
    ...[...html.matchAll(/<(?:div|section|main)\b([^>]*)>([\s\S]*?)<\/(?:div|section|main)>/gi)]
      .filter(m => /(?:article|story|post|entry)[-_ ]?(?:body|content|text)?|(?:body|content)[-_ ]?(?:article|story|post)?/i.test(m[1]) && !/(?:footer|header|related|sidebar|navigation)/i.test(m[1]))
      .map(m => m[2])
  ].filter(Boolean);
  let paragraphs = [];
  for (const candidate of candidates) {
    const found = cleanRegion(candidate);
    if (found.join(" ").length > paragraphs.join(" ").length) paragraphs = found;
  }
  if (paragraphs.join(" ").length < 180) {
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
    const fallback = cleanRegion(main || article);
    if (fallback.join(" ").length > paragraphs.join(" ").length) paragraphs = fallback;
  }
  const fullText = extractWords(paragraphs.join("\n\n"), 900);
  const media = structuredMedia(html, baseUrl);
  // Prefer a real image embedded in the article body. Social/profile icons and
  // publisher logos are common in page metadata and must never become story art.
  const image = firstImage(html, candidates.join(" "), baseUrl) ||
    usableArticleImage(media.image, baseUrl, "structured article image") ||
    usableArticleImage(meta(html, "og:image"), baseUrl, "open graph image") ||
    usableArticleImage(meta(html, "twitter:image"), baseUrl, "twitter image");
  const video = meta(html, "og:video:secure_url") || meta(html, "og:video") || media.videoUrl ||
    article.match(/<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    article.match(/<iframe[^>]+src=["']([^"']*(?:youtube|youtu\.be|vimeo)[^"']*)["']/i)?.[1] || "";
  const title = meta(html, "og:title") || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = cleanText(meta(html, "og:description") || meta(html, "description"));
  const published = meta(html, "article:published_time") || meta(html, "date");
  const absolute = value => { try { return value ? new URL(value, baseUrl).href : ""; } catch { return ""; } };
  return { fullText, image, videoUrl: absolute(video), pageTitle: title, description, published };
}
async function resolveGoogleNewsUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return ""; }
  if (parsed.hostname !== "news.google.com" || !/\/(?:rss\/)?articles\//.test(parsed.pathname)) return value;
  const articleId = parsed.pathname.split("/").filter(Boolean).pop();
  if (!articleId) return "";
  try {
    const page = await fetchText(value, 2500);
    const redirected = new URL(page.url);
    if (redirected.hostname !== "news.google.com" && allowedHost(redirected.hostname) && redirected.protocol === "https:") return redirected.href;
    const signature = page.text.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1];
    const timestamp = page.text.match(/data-n-a-ts=["'](\d+)["']/i)?.[1];
    if (!signature || !timestamp) return "";
    const rpc = ["Fbv4je", JSON.stringify(["garturlreq", [["X","X",["X","X"],null,null,1,1,"KE:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0], articleId, Number(timestamp), signature])];
    const body = new URLSearchParams({ "f.req": JSON.stringify([[rpc]]) });
    const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { ...FETCH_HEADERS, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return "";
    const result = await response.text();
    const marker = result.indexOf("garturlres");
    if (marker >= 0) {
      const tail = result.slice(marker + 10);
      const match = tail.match(/https?:\\?\/\\?\/[^"\\]+/);
      if (match) {
        const url = match[0].replace(/\\\//g, "/").replace(/\\u003d/g, "=");
        const resolved = new URL(url);
        return resolved.protocol === "https:" ? resolved.href : "";
      }
    }
    const rows = result.split("\n").filter(line => line.trim().startsWith("["));
    for (const line of rows) {
      try {
        const parsedRows = JSON.parse(line);
        for (const row of parsedRows) {
          if (Array.isArray(row) && row[0] === "wrb.fr" && row[2]) {
            const decoded = JSON.parse(row[2]);
            if (typeof decoded?.[1] === "string" && decoded[1].startsWith("https://")) return decoded[1];
          }
        }
      } catch {}
    }
    return "";
  } catch { return ""; }
}
async function scrapeItem(item) {
  let resolvedUrl = item.url;
  try { if (new URL(item.url).hostname === "news.google.com") resolvedUrl = await resolveGoogleNewsUrl(item.url); } catch { return null; }
  if (!resolvedUrl) return null;
  let target;
  try { target = new URL(resolvedUrl); } catch { return null; }
  if (!allowedHost(target.hostname)) return null;
  if (!(await robotsAllows(target.href))) return null;
  try {
    const page = await fetchText(target.href, 4500);
    const finalUrl = new URL(page.url);
    if (!allowedHost(finalUrl.hostname) || !(await robotsAllows(finalUrl.href))) return null;
    const parsed = readArticle(page.text, finalUrl.href);
    const title = item.title || parsed.pageTitle;
    if (!title) return null;
    const extractedText = parsed.fullText || "";
    const feedSummary = cleanText(item.summary || "");
    // Some publishers expose a useful RSS description but block their full page.
    // Keep those verified feed summaries rather than dropping the story entirely.
    const candidateText = extractedText.split(/\s+/).filter(Boolean).length >= 35
      ? extractedText
      : feedSummary.split(/\s+/).filter(Boolean).length >= 30 ? feedSummary : "";
    const boilerplate = /the standard group plc|download our app|telephone number:|corporate@standardmedia|all rights reserved|the standard group center/i.test(candidateText);
    if (boilerplate || candidateText.split(/\s+/).filter(Boolean).length < 30) return null;
    const fullText = extractWords(candidateText, 900);
    const summary = extractWords(fullText || parsed.description, 55);
    if (!fullText || fullText.split(/\s+/).filter(Boolean).length < 30) return null;
    const publishedAt = item.publishedAt || parsed.published || null;
    const words = fullText.split(/\s+/).filter(Boolean).length;
    const host = finalUrl.hostname.replace(/^www\./, "");
    const source = item.source && item.source !== "Google News" ? item.source :
      (host === "kenyanews.go.ke" ? "Kenya News Agency" : host.replace(/\.(co\.ke|go\.ke|org|com|int)$/i, "").replace(/^./, c => c.toUpperCase()));
    return {
      id: createHash("sha256").update(finalUrl.href).digest("hex").slice(0, 24),
      title: title.slice(0, 240), summary, fullText, source, url: finalUrl.href,
      image: usableArticleImage(parsed.image, finalUrl.href, "article image") || usableArticleImage(item.image, finalUrl.href, "feed thumbnail"), videoUrl: parsed.videoUrl || item.videoUrl || "", publishedAt,
      category: classify(title + " " + summary + " " + fullText.slice(0, 1200)),
      readMinutes: Math.max(1, Math.ceil(words / 220))
    };
  } catch { return null; }
}
async function getFeedItems(url) {
  try {
    const { text } = await fetchText(url, 6500);
    return [...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(match => {
      const block = match[0];
      const rawLink = xmlField(block, "link") || block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";
      const mediaImage = block.match(/<(?:media:thumbnail|media:content)[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']+["'])?/i)?.[1] || "";
      const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?/i);
      const videoUrl = enclosure && /^video\//i.test(enclosure[2] || "") ? enclosure[1] : "";
      return {
        title: cleanText(xmlField(block, "title")),
        url: decode(rawLink).trim(),
        summary: /^https?:\/\/news\.google\.com\//i.test(rawLink) ? "" : cleanText(xmlField(block, "description") || xmlField(block, "content:encoded")).slice(0, 650),
        publishedAt: xmlField(block, "pubDate") || xmlField(block, "published") || null,
        source: cleanText(xmlField(block, "source")) || "",
        image: decode(mediaImage),
        videoUrl: decode(videoUrl)
      };
    }).filter(x => x.title && x.url);
  } catch { return []; }
}
function publicArticle(article, isAdmin) {
  // Only enabled developer administrators may inspect publisher identities
  // and original source URLs. Public readers receive the article content only.
  if (isAdmin) return article;
  const { source, url, ...publicFields } = article;
  return publicFields;
}
function sendEvent(res, payload) {
  res.write(JSON.stringify(payload) + "\n");
}
export async function getAgriculturalNews(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const force = req.query?.refresh === "1";
  const stream = req.query?.stream === "1";
  const isAdmin = req.newsAdmin === true;
  const cached = globalThis.__shambavetAgriculturalNews;
  const cacheIsCurrent = cached?.version === 7;
  res.setHeader("Cache-Control", "private, no-store");
  if (stream) {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    try {
      if (!force && cacheIsCurrent && cached && Date.now() - cached.time < 2 * 60 * 1000) {
        sendEvent(res, { type: "progress", message: "Loading the latest saved stories…", completed: 0, total: cached.data.articles.length });
        for (let i = 0; i < cached.data.articles.length; i += 4) {
          sendEvent(res, { type: "articles", articles: cached.data.articles.slice(i, i + 4).map(a => publicArticle(a, isAdmin)), cached: true });
        }
        sendEvent(res, { type: "done", fetchedAt: cached.data.fetchedAt, sourceCount: cached.data.sourceCount, diagnostics: isAdmin ? cached.data.diagnostics : { articlesExtracted: cached.data.diagnostics?.articlesExtracted || 0 }, sourceVisibility: isAdmin ? "admin" : "restricted" });
        return res.end();
      }
      sendEvent(res, { type: "progress", message: "Connecting to agricultural news feeds…", completed: 0, total: FEEDS.length });
      const feedResults = await Promise.all(FEEDS.map(async (feed, index) => {
        const items = await getFeedItems(feed);
        sendEvent(res, { type: "progress", message: "Checking news feeds…", completed: index + 1, total: FEEDS.length });
        return items;
      }));
      const seen = new Set(), items = [];
      const maxFeedItems = Math.max(0, ...feedResults.map(feed => feed.length));
      for (let index = 0; index < maxFeedItems; index++) {
        for (const feed of feedResults) {
          const item = feed[index];
          if (!item) continue;
          try {
            const key = new URL(item.url).href.split("#")[0];
            if (!seen.has(key) && allowedHost(new URL(key).hostname)) { seen.add(key); items.push({ ...item, url: key }); }
          } catch {}
        }
      }
      const selected = items.slice(0, 32);
      sendEvent(res, { type: "progress", message: selected.length ? "Stories found. Extracting articles and media…" : "No new stories were found in the available feeds.", completed: 0, total: selected.length });
      const articles = [];
      let checkedStories = 0;
      // Bounded concurrency keeps feed extraction fast without flooding publishers.
      let nextIndex = 0;
      const workers = Array.from({ length: Math.min(8, selected.length) }, async () => {
        while (nextIndex < selected.length) {
          const item = selected[nextIndex++];
          const article = await scrapeItem(item);
          checkedStories += 1;
          if (article) articles.push(article);
          sendEvent(res, {
            type: "articles",
            articles: article ? [publicArticle(article, isAdmin)] : [],
            completed: checkedStories,
            total: selected.length
          });
        }
      });
      await Promise.all(workers);
      const seenImages = new Set();
      for (const article of articles) {
        if (article.image && seenImages.has(article.image)) article.image = "";
        else if (article.image) seenImages.add(article.image);
      }
      articles.sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
      const data = { ok: true, articles, fetchedAt: new Date().toISOString(), sourceCount: new Set(articles.map(a => a.source)).size, diagnostics: { feedsChecked: FEEDS.length, feedEntries: items.length, articlesExtracted: articles.length } };
      globalThis.__shambavetAgriculturalNews = { version: 7, time: Date.now(), data };
      sendEvent(res, { type: "done", fetchedAt: data.fetchedAt, sourceCount: data.sourceCount, diagnostics: isAdmin ? data.diagnostics : { articlesExtracted: data.diagnostics.articlesExtracted }, sourceVisibility: isAdmin ? "admin" : "restricted" });
      return res.end();
    } catch (error) {
      sendEvent(res, { type: "error", error: "The agricultural news sources could not be reached. Please try again shortly." });
      return res.end();
    }
  }
  if (!force && cached?.version === 7 && Date.now() - cached.time < 10 * 60 * 1000) {
    return res.status(200).json({ ...cached.data, articles: cached.data.articles.map(a => publicArticle(a, isAdmin)), sourceVisibility: isAdmin ? "admin" : "restricted", cached: true });
  }
  try {
    const feedResults = await Promise.all(FEEDS.map(getFeedItems));
    const seen = new Set(), items = [];
    // Interleave feed results so one publisher cannot dominate the first page.
    const maxFeedItems = Math.max(0, ...feedResults.map(feed => feed.length));
    for (let index = 0; index < maxFeedItems; index++) {
      for (const feed of feedResults) {
        const item = feed[index];
        if (!item) continue;
        try {
          const key = new URL(item.url).href.split("#")[0];
          if (!seen.has(key) && allowedHost(new URL(key).hostname)) { seen.add(key); items.push({ ...item, url: key }); }
        } catch {}
      }
    }
    const selected = items.slice(0, 32);
    const scraped = [];
    for (let i = 0; i < selected.length; i += 8) scraped.push(...await Promise.all(selected.slice(i, i + 8).map(scrapeItem)));
    const articles = scraped.filter(Boolean).sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
    const seenImages = new Set();
    for (const article of articles) {
      if (article.image && seenImages.has(article.image)) article.image = "";
      else if (article.image) seenImages.add(article.image);
    }
    const data = {
      ok: true, articles, fetchedAt: new Date().toISOString(),
      sourceCount: new Set(articles.map(a => a.source)).size,
      diagnostics: { feedsChecked: FEEDS.length, feedEntries: items.length, articlesExtracted: articles.length }
    };
    globalThis.__shambavetAgriculturalNews = { version: 7, time: Date.now(), data };
    return res.status(200).json({ ...data, articles: articles.map(a => publicArticle(a, isAdmin)), sourceVisibility: isAdmin ? "admin" : "restricted" });
  } catch (error) {
    return res.status(502).json({ error: "The agricultural news sources could not be reached. Please try again shortly." });
  }
}
