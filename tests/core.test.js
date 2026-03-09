const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PROVIDER_SELECTORS,
  buildImportHelperText,
  buildPayload,
  collectRoleRows,
  compressConversation,
  detectPlatformFromHost,
  renderConversationExport,
} = require("../shared.js");

test("detectPlatformFromHost maps supported providers", () => {
  assert.equal(detectPlatformFromHost("chatgpt.com"), "chatgpt");
  assert.equal(detectPlatformFromHost("claude.ai"), "claude");
  assert.equal(detectPlatformFromHost("gemini.google.com"), "gemini");
  assert.equal(detectPlatformFromHost("chat.deepseek.com"), "deepseek");
  assert.equal(detectPlatformFromHost("example.com"), "unknown");
});

test("provider selectors cover user and assistant roles", () => {
  Object.entries(PROVIDER_SELECTORS).forEach(([provider, selectors]) => {
    assert.ok(selectors.user.length > 0, `${provider} user selectors missing`);
    assert.ok(selectors.assistant.length > 0, `${provider} assistant selectors missing`);
  });
});

test("collectRoleRows deduplicates and sorts nodes in document order", () => {
  const first = {
    compareDocumentPosition(other) {
      return other === second ? 4 : 0;
    },
  };
  const second = {
    compareDocumentPosition(other) {
      return other === first ? 0 : 0;
    },
  };

  const queryAll = (selector) => {
    if (selector === ".user-a") return [second];
    if (selector === ".user-b") return [second];
    if (selector === ".assistant-a") return [first];
    return [];
  };

  const rows = collectRoleRows(queryAll, {
    user: [".user-a", ".user-b"],
    assistant: [".assistant-a"],
  });

  assert.deepEqual(
    rows.map((row) => [row.role, row.node]),
    [
      ["assistant", first],
      ["user", second],
    ]
  );
});

test("compression summarizes older messages and keeps recent ones", () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index + 1}`,
  }));

  const result = compressConversation(messages, { threshold: 12, recentCount: 4 });

  assert.equal(result.messages.length, 4);
  assert.equal(result.compression.summarized_message_count, 10);
  assert.match(result.compression.summary, /Earlier context compressed/);
});

test("renderers produce json, markdown, prompt, and import helper output", () => {
  const payload = buildPayload(
    "chatgpt",
    [
      { role: "user", content: "Need the final answer." },
      { role: "assistant", content: "Draft ready." },
    ],
    { extensionVersion: "1.2.0" }
  );

  const json = renderConversationExport(payload, "json");
  const markdown = renderConversationExport(payload, "markdown");
  const prompt = renderConversationExport(payload, "prompt");
  const helper = buildImportHelperText(payload, { targetProvider: "claude", outputFormat: "markdown" });

  assert.match(json, /"format": "promptbridge\.chat\.v1"/);
  assert.match(markdown, /# PromptBridge Export/);
  assert.match(prompt, /Recent transcript:/);
  assert.match(helper, /Import this ChatGPT conversation into Claude/);
});
