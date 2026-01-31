export function normalizeUrl(input) {
  let u = input.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  const url = new URL(u);
  // drop hash
  url.hash = "";
  return url.toString().replace(/\/+$/, "/");
}

export function sameOrigin(a, b, includeSubdomains = false) {
  const ua = new URL(a);
  const ub = new URL(b);

  if (includeSubdomains) {
    // allow *.domain.tld
    const rootA = ua.hostname.split(".").slice(-2).join(".");
    const rootB = ub.hostname.split(".").slice(-2).join(".");
    return rootA === rootB;
  }

  return ua.origin === ub.origin;
}

export function stripTracking(urlStr) {
  const u = new URL(urlStr);
  // remove common tracking params
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach(p =>
    u.searchParams.delete(p)
  );
  u.hash = "";
  return u.toString();
}

export function uniq(arr) {
  return [...new Set(arr)];
}

export function makeAuditId() {
  return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
