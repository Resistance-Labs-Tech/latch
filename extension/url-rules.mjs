export function normalizeRules(lines = []) {
  return lines
    .map((line) => String(line || "").trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function isUrlAllowed(url, rules = [], lockedTabUrl = "") {
  if (!url) return false;
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
    return true;
  }
  if (lockedTabUrl && sameOriginAndPath(url, lockedTabUrl)) return true;

  return normalizeRules(rules).some((rule) => ruleMatches(url, rule));
}

function sameOriginAndPath(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return left === right;
  }
}

export function ruleMatches(url, rule) {
  if (!rule) return false;
  if (rule.includes("*")) {
    const pattern = "^" + rule.split("*").map(escapeRegExp).join(".*") + "$";
    return new RegExp(pattern, "i").test(url);
  }

  try {
    const parsedUrl = new URL(url);
    if (!rule.includes("://") && !rule.includes("/")) {
      return parsedUrl.hostname === rule || parsedUrl.hostname.endsWith(`.${rule}`);
    }
  } catch {
    return false;
  }

  return url.toLowerCase().startsWith(rule.toLowerCase());
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
