import { crawlSite } from "../lib/crawler.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const url = body?.url;
    const max_pages = Number.isFinite(body?.max_pages) ? body.max_pages : 25;
    const include_subdomains = !!body?.include_subdomains;

    if (!url) return res.status(400).json({ error: "Missing `url`" });

    const result = await crawlSite({ url, maxPages: max_pages, includeSubdomains: include_subdomains });

    // Sync-style response compatible with your earlier schema
    return res.status(200).json({
      audit_id: result.audit_id,
      status: "complete",
      error: null,
      result
    });
  } catch (err) {
    return res.status(500).json({
      audit_id: null,
      status: "failed",
      error: err?.message || "Unknown error",
      result: null
    });
  }
}
