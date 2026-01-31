import { normalizeUrl, sameOrigin, uniq, makeAuditId } from "./utils.js";
import { extractPage } from "./extract.js";

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "WebsiteAuditEngine/1.0 (+https://example.com)"
    }
  });
  const status = res.status;
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  return { status, contentType, text, headers: res.headers };
}

function parseSitemapXml(xml) {
  // very small, permissive parser for <loc> URLs
  const urls = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1].trim());
  }
  return uniq(urls);
}

function detectContactAndName(pages) {
  // crude MVP signals; GPT will refine based on evidence
  let detected_name = null;
  let phone = null, email = null, address = null;

  for (const p of pages) {
    const snip = p.text_snippet || "";
    if (!detected_name && p.h1) detected_name = p.h1;

    if (!email) {
      const em = snip.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (em) email = em[0];
    }

    if (!phone) {
      const ph = snip.match(/(\+?\d[\d\s().-]{7,}\d)/);
      if (ph) phone = ph[0];
    }

    // address detection is hard; keep null for MVP unless you want to add a library later
  }

  return {
    detected_name: detected_name || null,
    contact: { phone, email, address, city: null, region: null, country: null }
  };
}

export async function crawlSite({ url, maxPages = 25, includeSubdomains = false }) {
  const audit_id = makeAuditId();
  const root = normalizeUrl(url);
  const origin = new URL(root).origin;

  // sitemap attempt
  let has_sitemap = false;
  let sitemap_urls = [];
  try {
    const smUrl = `${origin}/sitemap.xml`;
    const sm = await fetchText(smUrl);
    if (sm.status >= 200 && sm.status < 300 && /xml/i.test(sm.contentType)) {
      const parsed = parseSitemapXml(sm.text);
      sitemap_urls = parsed.filter(u => sameOrigin(u, root, includeSubdomains));
      has_sitemap = sitemap_urls.length > 0;
    }
  } catch {}

  // BFS queue
  const queue = [];
  const seen = new Set();

  // seed URLs: root + a few sitemap URLs
  queue.push(root);
  for (const u of sitemap_urls.slice(0, 15)) queue.push(normalizeUrl(u));

  const pages = [];
  const link_graph = [];

  while (queue.length && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) continue;

    let normalized;
    try {
      normalized = normalizeUrl(next);
    } catch {
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (!sameOrigin(normalized, root, includeSubdomains)) continue;

    // fetch
    let fetched;
    try {
      fetched = await fetchText(normalized);
    } catch {
      pages.push({
        url: normalized,
        status_code: 0,
        canonical: null,
        indexability: { noindex: null, robots_meta: null },
        title: null,
        meta_description: null,
        h1: null,
        h2: [],
        text_snippet: null,
        detected_page_type: null,
        internal_links: [],
        schema_jsonld: []
      });
      continue;
    }

    const status_code = fetched.status;

    // only parse HTML-ish pages
    if (!/text\/html/i.test(fetched.contentType)) {
      pages.push({
        url: normalized,
        status_code,
        canonical: null,
        indexability: { noindex: null, robots_meta: null },
        title: null,
        meta_description: null,
        h1: null,
        h2: [],
        text_snippet: null,
        detected_page_type: null,
        internal_links: [],
        schema_jsonld: []
      });
      continue;
    }

    const extracted = extractPage(fetched.text, normalized);

    // enqueue discovered internal links
    for (const link of extracted.internal_links || []) {
      if (!sameOrigin(link, root, includeSubdomains)) continue;
      if (!seen.has(link)) queue.push(link);
      link_graph.push({ from: normalized, to: link });
    }

    pages.push({
      url: normalized,
      status_code,
      ...extracted
    });
  }

  const { detected_name, contact } = detectContactAndName(pages);

  // basic service guesses: look for service-ish H2s (MVP; optional)
  const detected_services = [];
  for (const p of pages) {
    if (p.detected_page_type === "service") {
      if (p.h1) detected_services.push(p.h1);
      for (const h of p.h2.slice(0, 8)) detected_services.push(h);
    }
  }

  // very simple findings
  const findings = [];
  if (!has_sitemap) {
    findings.push({
      code: "missing_sitemap",
      severity: "medium",
      message: "No sitemap detected at /sitemap.xml (or it was empty/unreadable).",
      evidence: [{ url: root, snippet: null, field: "site.technical.has_sitemap" }]
    });
  }

  return {
    audit_id,
    site: {
      root_url: root,
      detected_name,
      detected_industry: null,
      detected_services: uniq(detected_services).slice(0, 15),
      contact,
      technical: {
        has_sitemap,
        sitemap_urls: sitemap_urls.slice(0, 200),
        robots_txt: null
      }
    },
    pages,
    link_graph: uniq(link_graph.map(e => JSON.stringify(e))).map(s => JSON.parse(s)),
    findings
  };
}
