import assert from "node:assert/strict";
import { isUrlAllowed, normalizeRules, ruleMatches } from "../extension/url-rules.mjs";

assert.deepEqual(normalizeRules(["", " docs.google.com ", "# comment"]), ["docs.google.com"]);

assert.equal(ruleMatches("https://docs.google.com/document/d/abc", "docs.google.com"), true);
assert.equal(ruleMatches("https://mail.google.com/mail/u/0", "docs.google.com"), false);
assert.equal(ruleMatches("https://github.com/openai/codex", "https://github.com/*"), true);
assert.equal(ruleMatches("https://example.com/work/a", "https://example.com/work"), true);

assert.equal(isUrlAllowed("chrome://extensions", []), true);
assert.equal(isUrlAllowed("https://docs.google.com/document/d/abc", ["docs.google.com"]), true);
assert.equal(isUrlAllowed("https://youtube.com/watch?v=123", ["docs.google.com"]), false);
assert.equal(
  isUrlAllowed("https://app.example.com/task/1?x=2", [], "https://app.example.com/task/1"),
  true
);

console.log("url rule tests passed");
