import * as cheerio from "cheerio";
import { stripTracking, uniq } from "./utils.js";

export function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || null;
  const meta_description = $('meta[name="description"]').attr("content")?.trim() || null;

  const canonical = $('link[rel="canonical"]').attr("href") || null;

  const robotsMeta = $('meta[name="robots"]').attr("content")?.trim() || null;
  const noindex = robotsMeta ? /noindex/i.test(robotsMeta) : null;

  const h1 = $("h1").first().text().trim() || null;

  const h2 = [];
  $("h2").each((_, el) => {
    const t = $(el).text().trim();
    if (t) h2.push(t);
  });

  // JSON-LD
  const schema_jsonld = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      schema_jsonld.push(parsed);
    } catch {
      // ignore invalid json-ld blocks
    }
  });

  // Internal links (raw; filtering happens in crawler)
  const internal_links = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, pageUrl).toString();
      internal_links.push(stripTracking(abs));
    } catch {}
  });

  // Text snippet: remove scripts/styles/nav/footer, then get body text
  $("script, style, noscript").remove();
  // you can tune these removals later; keep it simple for MVP
  $("nav, footer").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim();
  const text_snippet = text ? text.slice(0, 2500) : null;

  // Simple page type heuristic
  const lowerUrl = pageUrl.toLowerCase();
  let detected_page_type = null;
  if (lowerUrl.endsWith("/") || lowerUrl === new URL(pageUrl).origin + "/") detected_page_type = "home";
  if (/\/about\b/.test(lowerUrl)) detected_page_type = "about";
  if (/\/contact\b/.test(lowerUrl)) detected_page_type = "contact";
  if (/\/services?\b/.test(lowerUrl)) detected_page_type = "service";
  if (/\/faq\b/.test(lowerUrl)) detected_page_type = "faq";
  if (/\/blog\b/.test(lowerUrl)) detected_page_type = "blog";

  return {
    title,
    meta_description,
    canonical,
    indexability: { noindex, robots_meta: robotsMeta },
    h1,
    h2: uniq(h2),
    text_snippet,
    detected_page_type,
    internal_links: uniq(internal_links),
    schema_jsonld
  };
}
