const FEEDS = [
  "https://www.kenyanews.go.ke/category/agri/feed/",
  "https://www.kenyanews.go.ke/category/agriculture/feed/",
  "https://www.kenyanews.go.ke/category/food/feed/",
  "https://news.google.com/rss/search?q=Kenya+agriculture+OR+livestock+OR+farming&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=East+Africa+agriculture+farmers+livestock&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+crops+maize+horticulture+farmers&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+poultry+dairy+livestock+markets&hl=en-KE&gl=KE&ceid=KE:en",
  "https://news.google.com/rss/search?q=Kenya+agricultural+research+climate+irrigation&hl=en-KE&gl=KE&ceid=KE:en"
];

const ALLOWED_HOSTS = [
  "kenyanews.go.ke", "fao.org", "kalro.org", "kilimo.go.ke",
  "talkafrica.co.ke", "farmbizafrica.com", "farmersreviewafrica.com",
  "nation.africa", "standardmedia.co.ke", "the-star.co.ke",
  "businessdailyafrica.com", "allafrica.com", "agriculture.com",
  "reliefweb.int", "theeastafrican.co.ke", "capitalfm.co.ke",
  "news.google.com"
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
function firstImage(html, area, baseUrl) {
  const fromMeta = meta(html, "og:image") || meta(html, "og:image:url") || meta(html, "twitter:image");
  const candidates = [];
  if (fromMeta) candidates.push(fromMeta);
  const imgTags = [...area.matchAll(/<(?:img|source)\b[^>]*>/gi)].map(m => m[0]);
  for (const tag of imgTags) {
    const srcset = tag.match(/(?:srcset|data-srcset)=["']([^"']+)["']/i)?.[1];
    if (srcset) candidates.push(srcset.split(",").pop().trim().split(/\s+/)[0]);
    const src = tag.match(/(?:data-lazy-src|data-original|data-src|src)=["']([^"']+)["']/i)?.[1];
    if (src) candidates.push(src);
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, baseUrl);
      if (/^https?:$/.test(url.protocol) && !/data:image/i.test(candidate)) return url.href;
    } catch {}
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
  let area = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  area = area.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|button)\b[\s\S]*?<\/\1>/gi, " ");
  area = area.replace(/<\/(?:p|div|h[1-6]|li|blockquote|section)\s*>/gi, "\n");
  const paragraphs = area.split(/\n+/).map(cleanText).filter(p => p.length > 35);
  const unique = [...new Set(paragraphs)];
  const fullText = extractWords(unique.join("\n\n"), 900);
  const media = structuredMedia(html, baseUrl);
  const imageCandidates = [meta(html, "og:image"), meta(html, "twitter:image"), media.image, firstImage(html, area, baseUrl)].filter(Boolean);
  const image = imageCandidates.find(value => !/(google(news)?[-_ ]?(logo|icon)|placeholder|default[-_ ]?image|avatar|logo\.(png|svg))/i.test(value)) || "";
  const video = meta(html, "og:video:secure_url") || meta(html, "og:video") ||
    media.videoUrl ||
    area.match(/<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    area.match(/<iframe[^>]+src=["']([^"']*(?:youtube|youtu\.be|vimeo)[^"']*)["']/i)?.[1] || "";
  const title = meta(html, "og:title") || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = meta(html, "og:description") || meta(html, "description");
  const published = meta(html, "article:published_time") || meta(html, "date");
  const absolute = value => { try { return value ? new URL(value, baseUrl).href : ""; } catch { return ""; } };
  return { fullText, image: absolute(image), videoUrl: absolute(video), pageTitle: title, description, published };
}
async function scrapeItem(item) {
  let target;
  try { target = new URL(item.url); } catch { return null; }
  if (!allowedHost(target.hostname)) return null;
  if (!(await robotsAllows(target.href))) return null;
  try {
    const page = await fetchText(target.href, 4800);
    const finalUrl = new URL(page.url);
    if (!allowedHost(finalUrl.hostname) || !(await robotsAllows(finalUrl.href))) return null;
    const parsed = readArticle(page.text, finalUrl.href);
    const title = item.title || parsed.pageTitle;
    if (!title) return null;
    const fullText = extractWords(parsed.fullText.length >= 80 ? parsed.fullText : [item.summary, parsed.description].filter(Boolean).join(" "), 900);
    const summary = extractWords(item.summary || parsed.description || fullText, 55);
    const publishedAt = item.publishedAt || parsed.published || null;
    const words = fullText.split(/\s+/).filter(Boolean).length;
    const host = finalUrl.hostname.replace(/^www\./, "");
    const source = item.source && item.source !== "Google News" ? item.source :
      (host === "kenyanews.go.ke" ? "Kenya News Agency" : host.replace(/\.(co\.ke|go\.ke|org|com|int)$/i, "").replace(/^./, c => c.toUpperCase()));
    return {
      id: Buffer.from(finalUrl.href).toString("base64url").slice(0, 32),
      title: title.slice(0, 240), summary, fullText, source, url: finalUrl.href,
      image: item.image || parsed.image || "", videoUrl: parsed.videoUrl || item.videoUrl || "", publishedAt,
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
        summary: cleanText(xmlField(block, "description") || xmlField(block, "content:encoded")).slice(0, 650),
        publishedAt: xmlField(block, "pubDate") || xmlField(block, "published") || null,
        source: cleanText(xmlField(block, "source")) || "",
        image: decode(mediaImage),
        videoUrl: decode(videoUrl)
      };
    }).filter(x => x.title && x.url);
  } catch { return []; }
}
function publicArticle(article, isAdmin) {
  if (isAdmin) return article;
  const { source, url, ...safe } = article;
  return safe;
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
  res.setHeader("Cache-Control", "private, no-store");
  if (stream) {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    try {
      if (!force && cached && Date.now() - cached.time < 10 * 60 * 1000) {
        sendEvent(res, { type: "progress", message: "Loading the latest saved stories…", completed: 0, total: cached.data.articles.length });
        for (let i = 0; i < cached.data.articles.length; i += 4) {
          sendEvent(res, { type: "articles", articles: cached.data.articles.slice(i, i + 4).map(a => publicArticle(a, isAdmin)), cached: true });
        }
        sendEvent(res, { type: "done", fetchedAt: cached.data.fetchedAt, sourceCount: cached.data.sourceCount, sourceVisibility: isAdmin ? "admin" : "restricted" });
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
      const selected = items.slice(0, 16);
      sendEvent(res, { type: "progress", message: selected.length ? "Stories found. Extracting articles and media…" : "No new stories were found in the available feeds.", completed: 0, total: selected.length });
      const articles = [];
      for (let i = 0; i < selected.length; i += 4) {
        const batch = await Promise.all(selected.slice(i, i + 4).map(scrapeItem));
        const ready = batch.filter(Boolean);
        articles.push(...ready);
        sendEvent(res, { type: "articles", articles: ready.map(a => publicArticle(a, isAdmin)), completed: Math.min(i + 4, selected.length), total: selected.length });
      }
      articles.sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
      const data = { ok: true, articles, fetchedAt: new Date().toISOString(), sourceCount: new Set(articles.map(a => a.source)).size };
      globalThis.__shambavetAgriculturalNews = { time: Date.now(), data };
      sendEvent(res, { type: "done", fetchedAt: data.fetchedAt, sourceCount: data.sourceCount, sourceVisibility: isAdmin ? "admin" : "restricted" });
      return res.end();
    } catch (error) {
      sendEvent(res, { type: "error", error: "The agricultural news sources could not be reached. Please try again shortly." });
      return res.end();
    }
  }
  if (!force && cached && Date.now() - cached.time < 10 * 60 * 1000) {
    return res.status(200).json({ ...cached.data, articles: cached.data.articles.map(a => publicArticle(a, isAdmin)), sourceVisibility: isAdmin ? "admin" : "restricted", cached: true });
  }
  try {
    const feedResults = await Promise.all(FEEDS.map(getFeedItems));
    const seen = new Set(), items = [];
    for (const item of feedResults.flat()) {
      try {
        const key = new URL(item.url).href.split("#")[0];
        if (!seen.has(key) && allowedHost(new URL(key).hostname)) { seen.add(key); items.push({ ...item, url: key }); }
      } catch {}
    }
    const scraped = await Promise.all(items.slice(0, 16).map(scrapeItem));
    const articles = scraped.filter(Boolean).sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
    const data = { ok: true, articles, fetchedAt: new Date().toISOString(), sourceCount: new Set(articles.map(a => a.source)).size };
    globalThis.__shambavetAgriculturalNews = { time: Date.now(), data };
    return res.status(200).json({ ...data, articles: articles.map(a => publicArticle(a, isAdmin)), sourceVisibility: isAdmin ? "admin" : "restricted" });
  } catch (error) {
    return res.status(502).json({ error: "The agricultural news sources could not be reached. Please try again shortly." });
  }
}
