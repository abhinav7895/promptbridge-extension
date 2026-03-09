(() => {
/**
 * Content script for PromptBridge.
 * Extracts user/assistant chat turns across multiple AI providers.
 */

if (window.__PROMPTBRIDGE_CONTENT_READY__) {
  return;
}
window.__PROMPTBRIDGE_CONTENT_READY__ = true;

const fallbackCore = (() => {
  const DOCUMENT_POSITION_FOLLOWING = 4;
  const providerSelectors = {
    chatgpt: {
      user: [
        "[data-message-author-role='user']",
        "article[data-testid*='conversation-turn'][data-message-author-role='user']",
      ],
      assistant: [
        "[data-message-author-role='assistant']",
        "article[data-testid*='conversation-turn'][data-message-author-role='assistant']",
      ],
    },
    gemini: {
      user: ["user-query", "[data-test-id*='user-query']", "[data-testid*='user-query']"],
      assistant: ["model-response", "[data-test-id*='model-response']", "[data-testid*='model-response']"],
    },
    claude: {
      user: ["[data-testid*='user']", "[data-test-render-count][data-testid*='human']"],
      assistant: ["[data-testid*='assistant']", "[data-testid*='claude']"],
    },
    meta: {
      user: ["[data-testid*='user']", "[data-testid*='prompt']"],
      assistant: ["[data-testid*='assistant']", "[data-testid*='response']"],
    },
    qwen: {
      user: ["[data-role='user']", "[class*='user']"],
      assistant: ["[data-role='assistant']", "[class*='assistant']", "[class*='bot']"],
    },
    kimi: {
      user: ["[data-role='user']", "[class*='user']"],
      assistant: ["[data-role='assistant']", "[class*='assistant']", "[class*='ai']"],
    },
    perplexity: {
      user: ["[data-testid*='user']", "[class*='query']"],
      assistant: ["[data-testid*='assistant']", "[class*='answer']"],
    },
    poe: {
      user: ["[data-testid*='user']", "[class*='ChatMessage_user']"],
      assistant: ["[data-testid*='bot']", "[class*='ChatMessage_bot']", "[class*='assistant']"],
    },
    mistral: {
      user: ["[data-role='user']", "[class*='user']"],
      assistant: ["[data-role='assistant']", "[class*='assistant']", "[class*='bot']"],
    },
    deepseek: {
      user: ["[data-role='user']", "[class*='user']"],
      assistant: ["[data-role='assistant']", "[class*='assistant']", "[class*='bot']"],
    },
    copilot: {
      user: ["[data-testid*='user']", "[class*='user']"],
      assistant: ["[data-testid*='assistant']", "[class*='assistant']"],
    },
    you: {
      user: ["[data-testid*='user']", "[class*='user']"],
      assistant: ["[data-testid*='assistant']", "[class*='answer']"],
    },
    grok: {
      user: ["[data-testid*='user']", "[class*='user']"],
      assistant: ["[data-testid*='assistant']", "[class*='grok']", "[class*='bot']"],
    },
    scira: {
      user: ["[data-testid*='user']", "[class*='user']"],
      assistant: ["[data-testid*='assistant']", "[class*='assistant']", "[class*='bot']"],
    },
  };

  function detectPlatform(host) {
    if (host === "chat.openai.com" || host === "chatgpt.com") return "chatgpt";
    if (host === "gemini.google.com") return "gemini";
    if (host === "claude.ai") return "claude";
    if (host === "meta.ai" || host === "www.meta.ai") return "meta";
    if (host === "chat.qwen.ai" || host === "qwenlm.ai") return "qwen";
    if (host === "kimi.moonshot.cn" || host === "kimi.com") return "kimi";
    if (host === "perplexity.ai" || host === "www.perplexity.ai") return "perplexity";
    if (host === "poe.com") return "poe";
    if (host === "chat.mistral.ai") return "mistral";
    if (host === "chat.deepseek.com" || host === "deepseek.com") return "deepseek";
    if (host === "copilot.microsoft.com") return "copilot";
    if (host === "grok.com" || host === "x.com") return "grok";
    if (host === "you.com") return "you";
    if (host === "scira.ai") return "scira";
    return "unknown";
  }

  function collectRows(queryAll, selectors) {
    const rows = [];

    selectors.user.forEach((selector) => {
      Array.from(queryAll(selector)).forEach((node) => rows.push({ node, role: "user" }));
    });
    selectors.assistant.forEach((selector) => {
      Array.from(queryAll(selector)).forEach((node) => rows.push({ node, role: "assistant" }));
    });

    const seenNodes = new Set();
    const uniqueRows = rows.filter((row) => {
      if (seenNodes.has(row.node)) return false;
      seenNodes.add(row.node);
      return true;
    });

    uniqueRows.sort((a, b) => {
      if (a.node === b.node) return 0;
      const position = a.node.compareDocumentPosition(b.node);
      return position & DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    return uniqueRows;
  }

  return {
    PROVIDER_SELECTORS: providerSelectors,
    collectRoleRows: collectRows,
    detectPlatformFromHost: detectPlatform,
  };
})();

const core = globalThis.PromptBridgeCore || fallbackCore;
const { PROVIDER_SELECTORS, collectRoleRows, detectPlatformFromHost } = core;

/**
 * Normalize extracted text by removing excessive blank lines and trimming.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  return text.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Canonicalize message text for dedupe comparisons.
 * @param {string} text
 * @returns {string}
 */
function canonicalizeForDedupe(text) {
  return cleanText(text).replace(/^you said:?\s*\n*/i, "").trim();
}

/**
 * Guess MIME type from URL/path extension.
 * @param {string} value
 * @returns {string | null}
 */
function mimeFromPath(value) {
  const lower = value.toLowerCase();
  const ext = lower.split("?")[0].split("#")[0].split(".").pop() || "";
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || null;
}

/**
 * Return absolute URL if valid.
 * @param {string} value
 * @returns {string | null}
 */
function toAbsoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, window.location.href).toString();
  } catch (_error) {
    return null;
  }
}

/**
 * Resolve wrapped/redirected URLs to direct asset URLs when possible.
 * @param {string} url
 * @returns {string}
 */
function normalizeAssetUrl(url) {
  try {
    const parsed = new URL(url);
    const wrapped =
      parsed.searchParams.get("url") ||
      parsed.searchParams.get("u") ||
      parsed.searchParams.get("q") ||
      parsed.searchParams.get("target");
    if (wrapped) {
      const absolute = toAbsoluteUrl(wrapped);
      if (absolute) return absolute;
    }
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

/**
 * Best-effort file name from URL.
 * @param {string} url
 * @returns {string | null}
 */
function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").pop() || "").trim();
    return name || null;
  } catch (_error) {
    return null;
  }
}

/**
 * Build a stable signature for deduping attachments.
 * @param {Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>} attachments
 * @returns {string}
 */
function attachmentSignature(attachments) {
  if (!attachments.length) return "";
  return attachments
    .map((item) =>
      [item.type, item.image_url || "", item.file_name || "", item.file_link || "", item.mime_type || ""].join("|")
    )
    .sort()
    .join("::");
}

/**
 * Infer attachment metadata from URL.
 * @param {string} url
 * @returns {{ is_temporary: boolean, source: string }}
 */
function attachmentMetaFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    const hasSigParams =
      parsed.searchParams.has("sig") ||
      parsed.searchParams.has("token") ||
      parsed.searchParams.has("expires") ||
      parsed.searchParams.has("ts");

    if (host.includes("chatgpt.com") && path.includes("/backend-api/estuary/")) {
      return { is_temporary: true, source: "chatgpt-estuary" };
    }
    if (host.includes("googleusercontent.com") && path.includes("/gg/")) {
      return { is_temporary: true, source: "gemini-googleusercontent" };
    }
    if (hasSigParams) {
      return { is_temporary: true, source: host };
    }
    return { is_temporary: false, source: host || "unknown" };
  } catch (_error) {
    return { is_temporary: false, source: "unknown" };
  }
}

/**
 * Add common metadata fields to an attachment.
 * @param {{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }} base
 * @returns {{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string, is_temporary: boolean, source: string, captured_at: string }}
 */
function withAttachmentMeta(base) {
  const link = base.image_url || base.file_link || "";
  const meta = attachmentMetaFromUrl(link);
  return {
    ...base,
    is_temporary: meta.is_temporary,
    source: meta.source,
    captured_at: new Date().toISOString(),
  };
}

/**
 * Extract attachments (images/files) from a message node.
 * @param {Element} messageEl
 * @returns {Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string, is_temporary: boolean, source: string, captured_at: string }>}
 */
function extractAttachments(messageEl) {
  const output = [];
  const dedupe = new Set();
  const addAttachment = (attachment, key) => {
    if (dedupe.has(key)) return;
    dedupe.add(key);
    output.push(attachment);
  };

  // Capture inline images.
  messageEl.querySelectorAll("img").forEach((img) => {
    const imageUrl = normalizeAssetUrl(toAbsoluteUrl(img.currentSrc || img.getAttribute("src") || "") || "");
    if (!imageUrl || imageUrl.startsWith("data:image/gif")) return;

    const mime = img.getAttribute("type") || mimeFromPath(imageUrl) || "image/*";
    addAttachment(
      withAttachmentMeta({
        type: "image",
        image_url: imageUrl,
        mime_type: mime,
      }),
      `image|${imageUrl}`
    );
  });

  // Capture <source srcset> assets used in picture/video wrappers.
  messageEl.querySelectorAll("source[srcset]").forEach((source) => {
    const firstSrc = (source.getAttribute("srcset") || "").split(",")[0]?.trim().split(" ")[0];
    const imageUrl = normalizeAssetUrl(toAbsoluteUrl(firstSrc || "") || "");
    if (!imageUrl) return;
    const mime = source.getAttribute("type") || mimeFromPath(imageUrl) || "image/*";
    addAttachment(
      withAttachmentMeta({
        type: "image",
        image_url: imageUrl,
        mime_type: mime,
      }),
      `image|${imageUrl}`
    );
  });

  // Capture links that are likely files/assets.
  messageEl.querySelectorAll("a[href]").forEach((anchor) => {
    const href = normalizeAssetUrl(toAbsoluteUrl(anchor.getAttribute("href") || "") || "");
    if (!href) return;
    if (href.startsWith("javascript:") || href.startsWith("#")) return;

    const text = cleanText(anchor.textContent || "");
    const name =
      cleanText(anchor.getAttribute("download") || "") || fileNameFromUrl(href) || text || "attachment";

    const mime =
      anchor.getAttribute("type") ||
      anchor.getAttribute("data-mime-type") ||
      mimeFromPath(name) ||
      mimeFromPath(href) ||
      null;

    const isImageLink = /(\.png|\.jpg|\.jpeg|\.webp|\.gif|\.svg)(\?|#|$)/i.test(href);
    if (isImageLink) {
      addAttachment(
        withAttachmentMeta({
          type: "image",
          image_url: href,
          mime_type: mime || "image/*",
        }),
        `image|${href}`
      );
      return;
    }

    const looksLikeFile =
      Boolean(anchor.getAttribute("download")) ||
      Boolean(mime) ||
      /(\.pdf|\.txt|\.md|\.csv|\.json|\.zip|\.rar|\.7z|\.docx?|\.pptx?|\.xlsx?)(\?|#|$)/i.test(href) ||
      /file|attachment|download|upload|asset/i.test(
        `${anchor.className || ""} ${anchor.getAttribute("aria-label") || ""} ${text}`
      );

    if (!looksLikeFile) return;

    addAttachment(
      withAttachmentMeta({
        type: "file",
        file_name: name,
        file_link: href,
        mime_type: mime || "application/octet-stream",
      }),
      `file|${href}|${name}`
    );
  });

  // Capture file metadata from data attributes used by some chat UIs.
  messageEl.querySelectorAll("[data-file-name], [data-filename], [data-mime-type], [data-file-url]").forEach((el) => {
    const name = cleanText(el.getAttribute("data-file-name") || el.getAttribute("data-filename") || "");
    const link = normalizeAssetUrl(toAbsoluteUrl(el.getAttribute("data-file-url") || "") || "");
    const mime = cleanText(el.getAttribute("data-mime-type") || "") || mimeFromPath(name || link || "") || null;
    if (!name && !link) return;

    if (mime && mime.startsWith("image/") && link) {
      addAttachment(
        withAttachmentMeta({
          type: "image",
          image_url: link,
          mime_type: mime,
        }),
        `image|${link}`
      );
      return;
    }

    addAttachment(
      withAttachmentMeta({
        type: "file",
        file_name: name || fileNameFromUrl(link || "") || "attachment",
        file_link: link || undefined,
        mime_type: mime || "application/octet-stream",
      }),
      `file|${name}|${link}|${mime}`
    );
  });

  return output;
}

/**
 * Detect platform from current hostname.
 * @returns {string}
 */
function detectPlatform() {
  return detectPlatformFromHost(window.location.hostname);
}

/**
 * Return text for a message container, favoring likely prose nodes.
 * @param {Element} messageEl
 * @param {"user" | "assistant"} role
 * @returns {string}
 */
function extractMessageText(messageEl, role) {
  const preferredSelector =
    role === "assistant"
      ? ".markdown, [data-message-content], .prose, .model-response-text"
      : "[data-message-content], .whitespace-pre-wrap, .markdown, .query-text";

  const proseNodes = messageEl.querySelectorAll(preferredSelector);

  if (proseNodes.length > 0) {
    const joined = Array.from(proseNodes)
      .map((node) => cleanText(node.innerText || node.textContent || ""))
      .filter(Boolean)
      .join("\n\n");

    if (joined) return joined;
  }

  // Fallback: remove common controls and then read text.
  const clone = messageEl.cloneNode(true);
  if (clone instanceof Element) {
    clone
      .querySelectorAll(
        "button, nav, svg, textarea, input, [role='button'], [aria-label*='copy'], [aria-label*='edit']"
      )
      .forEach((el) => {
        el.remove();
      });
  }

  return cleanText(clone.textContent || "");
}

/**
 * Attempt to infer role from message node.
 * @param {Element} messageEl
 * @returns {"user" | "assistant" | null}
 */
function inferRole(messageEl) {
  const roleAttrs = [
    messageEl.getAttribute("data-message-author-role"),
    messageEl.getAttribute("data-author-role"),
    messageEl.getAttribute("data-role"),
    messageEl.getAttribute("author"),
    messageEl.getAttribute("data-testid"),
    messageEl.getAttribute("class"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(^|\b)(user|human|prompt|query)(\b|$)/.test(roleAttrs)) return "user";
  if (/(^|\b)(assistant|bot|ai|model|response)(\b|$)/.test(roleAttrs)) return "assistant";

  const text = (messageEl.textContent || "").trim().toLowerCase();
  if (/^you\b/.test(text)) return "user";

  return null;
}

/**
 * Build ordered messages from explicit role selectors.
 * @param {{ user: string[], assistant: string[] }} selectors
 * @returns {Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }>}
 */
function extractByRoleSelectors(selectors) {
  const uniqueRows = collectRoleRows((selector) => document.querySelectorAll(selector), selectors);
  const dedupe = new Set();
  const messages = [];

  for (const row of uniqueRows) {
    const content = extractMessageText(row.node, row.role);
    const canonical = canonicalizeForDedupe(content);
    const attachments = extractAttachments(row.node);
    if (!canonical && attachments.length === 0) continue;
    const safeContent = canonical || "[Attachment]";

    const key = `${row.role}::${safeContent}::${attachmentSignature(attachments)}`;
    if (dedupe.has(key)) continue;

    dedupe.add(key);
    if (attachments.length > 0) {
      messages.push({ role: row.role, content: safeContent, attachments });
    } else {
      messages.push({ role: row.role, content: safeContent });
    }
  }

  return messages;
}

/**
 * Extract ChatGPT messages from conversation turns so attachments are included.
 * @returns {Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }>}
 */
function extractChatGptMessages() {
  const turns = Array.from(
    document.querySelectorAll(
      "article[data-testid*='conversation-turn'], div[data-testid*='conversation-turn'], [data-testid^='conversation-turn-']"
    )
  );
  const dedupe = new Set();
  const messages = [];

  for (const turn of turns) {
    const roleNode = turn.querySelector("[data-message-author-role]");
    const role = roleNode ? inferRole(roleNode) : inferRole(turn);
    if (!role) continue;

    // Prefer the role-specific inner node for text, but use whole turn for attachments.
    const textSource = roleNode || turn;
    const content = extractMessageText(textSource, role);
    const canonical = canonicalizeForDedupe(content);
    const attachments = extractAttachments(turn);
    if (!canonical && attachments.length === 0) continue;

    const safeContent = canonical || "[Attachment]";
    const key = `${role}::${safeContent}::${attachmentSignature(attachments)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    if (attachments.length > 0) {
      messages.push({ role, content: safeContent, attachments });
    } else {
      messages.push({ role, content: safeContent });
    }
  }

  return messages;
}

/**
 * Generic fallback extraction based on common turn containers + inferred roles.
 * @returns {Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }>}
 */
function extractGenericMessages() {
  const candidates = Array.from(
    document.querySelectorAll(
      "[data-message-author-role], [data-author-role], [data-role], [data-testid*='turn'], [data-testid*='message'], article, main article"
    )
  );

  const dedupe = new Set();
  const messages = [];

  for (const node of candidates) {
    const role = inferRole(node);
    if (!role) continue;

    const content = extractMessageText(node, role);
    const canonical = canonicalizeForDedupe(content);
    const attachments = extractAttachments(node);
    if (!canonical && attachments.length === 0) continue;
    const safeContent = canonical || "[Attachment]";

    const key = `${role}::${safeContent}::${attachmentSignature(attachments)}`;
    if (dedupe.has(key)) continue;

    dedupe.add(key);
    if (attachments.length > 0) {
      messages.push({ role, content: safeContent, attachments });
    } else {
      messages.push({ role, content: safeContent });
    }
  }

  return messages;
}

/**
 * Extract messages for active platform.
 * @returns {{
 *   platform: string,
 *   messages: Array<{
 *     role: "user" | "assistant",
 *     content: string,
 *     attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 *   }>
 * }}
 */
function extractChatMessages() {
  const platform = detectPlatform();

  let messages = [];
  if (platform === "chatgpt") {
    messages = extractChatGptMessages();
  }

  if (!messages.length) {
    const selectors = PROVIDER_SELECTORS[platform];
    messages = selectors ? extractByRoleSelectors(selectors) : [];
  }

  if (!messages.length) {
    messages = extractGenericMessages();
  }

  return { platform, messages };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "PROMPTBRIDGE_EXTRACT_MESSAGES") {
    return;
  }

  try {
    const result = extractChatMessages();
    sendResponse({ ok: true, platform: result.platform, messages: result.messages });
  } catch (error) {
    sendResponse({ ok: false, error: error.message || "Extraction failed." });
  }
});
})();
