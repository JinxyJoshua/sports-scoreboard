// Worker entry point. Serves the static app from ./site and adds one endpoint:
//   GET /api/highlight?q=<search text>&from=<ISO time>
// It calls the YouTube Data API with the key stored as the secret YOUTUBE_KEY, so the key never
// reaches the browser. Results are cached at the edge for 10 minutes to save quota.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/highlight") {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      return highlight(url, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function highlight(url, env) {
  const q = (url.searchParams.get("q") || "").trim();
  const from = url.searchParams.get("from") || "";
  if (!q || q.length > 200) return json({ error: "missing or long query" }, 400);
  if (from && isNaN(Date.parse(from))) return json({ error: "bad from date" }, 400);
  if (!env.YOUTUBE_KEY) return json({ error: "YOUTUBE_KEY secret is not set" }, 500);

  const yt = new URL("https://www.googleapis.com/youtube/v3/search");
  yt.searchParams.set("part", "snippet");
  yt.searchParams.set("type", "video");
  yt.searchParams.set("maxResults", "10");
  yt.searchParams.set("q", q);
  if (from) yt.searchParams.set("publishedAfter", new Date(from).toISOString());
  yt.searchParams.set("key", env.YOUTUBE_KEY);

  let res;
  try {
    res = await fetch(yt.toString(), { cf: { cacheTtl: 600, cacheEverything: true } });
  } catch (err) {
    return json({ error: "could not reach YouTube" }, 502);
  }
  if (!res.ok) {
    // pass on YouTube's reason (e.g. "API key not valid") so setup problems are visible; it never echoes the key
    const body = await res.json().catch(function () { return {}; });
    const reason = (body.error && body.error.message) || "";
    return json({ error: "YouTube returned " + res.status, reason: reason }, 502);
  }

  const data = await res.json();
  const items = (data.items || []).map(function (it) {
    return { videoId: (it.id && it.id.videoId) || "", title: (it.snippet && it.snippet.title) || "" };
  }).filter(function (it) { return it.videoId; });
  return json({ items: items }, 200);
}
