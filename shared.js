(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.PromptBridgeCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DOCUMENT_POSITION_FOLLOWING = 4;

  const PROVIDER_SELECTORS = {
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

  const PROVIDER_DIRECTORY = [
    { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "claude", label: "Claude", url: "https://claude.ai/" },
    { id: "gemini", label: "Gemini", url: "https://gemini.google.com/" },
    { id: "copilot", label: "Copilot", url: "https://copilot.microsoft.com/" },
    { id: "perplexity", label: "Perplexity", url: "https://perplexity.ai/" },
    { id: "grok", label: "Grok", url: "https://grok.com/" },
    { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/" },
    { id: "poe", label: "Poe", url: "https://poe.com/" },
    { id: "mistral", label: "Mistral", url: "https://chat.mistral.ai/" },
    { id: "you", label: "You.com", url: "https://you.com/" },
  ];

  function detectPlatformFromHost(host) {
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

  function getProviderLabel(providerId) {
    const match = PROVIDER_DIRECTORY.find((provider) => provider.id === providerId);
    if (match) return match.label;
    return providerId ? providerId.charAt(0).toUpperCase() + providerId.slice(1) : "Unknown";
  }

  function summarizeAttachment(attachment) {
    if (attachment.type === "image") {
      return attachment.image_url ? `image: ${attachment.image_url}` : "image attachment";
    }

    const name = attachment.file_name || attachment.file_link || "file attachment";
    return attachment.mime_type ? `${name} (${attachment.mime_type})` : name;
  }

  function summarizeMessage(message, index) {
    const content = (message.content || "").replace(/\s+/g, " ").trim();
    const shortContent = content.length > 180 ? `${content.slice(0, 177)}...` : content;
    const attachmentCount = Array.isArray(message.attachments) ? message.attachments.length : 0;
    const attachmentSummary =
      attachmentCount > 0
        ? ` Attachments: ${message.attachments.map(summarizeAttachment).slice(0, 2).join(", ")}${attachmentCount > 2 ? ", ..." : ""}.`
        : "";
    return `${index + 1}. ${message.role}: ${shortContent || "[Attachment only]"}${attachmentSummary}`;
  }

  function compressConversation(messages, options = {}) {
    const threshold = options.threshold ?? 12;
    const recentCount = options.recentCount ?? 8;

    if (!Array.isArray(messages) || messages.length <= threshold) {
      return { messages: Array.isArray(messages) ? messages.slice() : [], compression: null };
    }

    const keepCount = Math.min(Math.max(recentCount, 2), messages.length);
    const older = messages.slice(0, messages.length - keepCount);
    const recent = messages.slice(-keepCount);

    const summaryLines = older.slice(-12).map(summarizeMessage);
    const userTurns = older.filter((item) => item.role === "user").length;
    const assistantTurns = older.length - userTurns;

    return {
      messages: recent,
      compression: {
        strategy: "deterministic-summary",
        original_message_count: messages.length,
        retained_message_count: recent.length,
        summarized_message_count: older.length,
        summary:
          `Earlier context compressed from ${older.length} messages (${userTurns} user, ${assistantTurns} assistant).\n` +
          summaryLines.join("\n"),
      },
    };
  }

  function buildPayload(platform, messages, options = {}) {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const extensionVersion = options.extensionVersion || "1.0.0";
    const compressed = options.compress ? compressConversation(sourceMessages, options.compressionOptions) : null;
    const finalMessages = compressed ? compressed.messages : sourceMessages.slice();
    const lastUserMessage = [...finalMessages].reverse().find((item) => item.role === "user");

    const payload = {
      format: "promptbridge.chat.v1",
      meta: {
        platform,
        exported_at: new Date().toISOString(),
        exporter: "PromptBridge",
        version: extensionVersion,
      },
      handoff: {
        objective: "Continue this conversation naturally from prior context.",
        instruction:
          "Treat the messages array as the authoritative recent conversation history. Do not summarize unless asked. Continue by replying to the final user intent.",
        respond_to: lastUserMessage?.content || "Use the latest unresolved user request in messages.",
      },
      messages: finalMessages,
    };

    if (compressed && compressed.compression) {
      payload.compression = compressed.compression;
    }

    return payload;
  }

  function renderMessageMarkdown(message) {
    const lines = [`### ${message.role === "user" ? "User" : "Assistant"}`, "", message.content || "[Attachment only]"];
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      lines.push("");
      lines.push("Attachments:");
      message.attachments.forEach((attachment) => {
        lines.push(`- ${summarizeAttachment(attachment)}`);
      });
    }
    return lines.join("\n");
  }

  function renderMarkdown(payload) {
    const lines = [
      "# PromptBridge Export",
      "",
      `- Source: ${getProviderLabel(payload.meta.platform)}`,
      `- Exported: ${payload.meta.exported_at}`,
      `- Version: ${payload.meta.version}`,
      "",
      "## Handoff",
      "",
      payload.handoff.objective,
      "",
      payload.handoff.instruction,
      "",
      `Respond to: ${payload.handoff.respond_to}`,
    ];

    if (payload.compression) {
      lines.push("");
      lines.push("## Compression");
      lines.push("");
      lines.push(payload.compression.summary);
    }

    lines.push("");
    lines.push("## Messages");
    lines.push("");
    lines.push(payload.messages.map(renderMessageMarkdown).join("\n\n"));
    return lines.join("\n");
  }

  function renderPlainPrompt(payload) {
    const lines = [
      "Continue this conversation using the imported context below.",
      "Treat recent messages as authoritative history.",
      "Reply directly to the latest unresolved user request.",
    ];

    if (payload.compression) {
      lines.push("");
      lines.push("Compressed earlier context:");
      lines.push(payload.compression.summary);
    }

    lines.push("");
    lines.push("Recent transcript:");
    payload.messages.forEach((message, index) => {
      lines.push(`${index + 1}. ${message.role.toUpperCase()}: ${message.content || "[Attachment only]"}`);
      if (Array.isArray(message.attachments) && message.attachments.length > 0) {
        message.attachments.forEach((attachment) => {
          lines.push(`   Attachment: ${summarizeAttachment(attachment)}`);
        });
      }
    });

    return lines.join("\n");
  }

  function renderConversationExport(payload, outputFormat) {
    if (outputFormat === "markdown") {
      return renderMarkdown(payload);
    }

    if (outputFormat === "prompt") {
      return renderPlainPrompt(payload);
    }

    return JSON.stringify(payload, null, 2);
  }

  function buildImportHelperText(payload, options = {}) {
    const targetProvider = options.targetProvider || "chatgpt";
    const format = options.outputFormat || "json";
    const targetLabel = getProviderLabel(targetProvider);
    const sourceLabel = getProviderLabel(payload.meta.platform);
    const body = renderConversationExport(payload, format);
    const formatLabel =
      format === "markdown" ? "Markdown" : format === "prompt" ? "plain prompt transcript" : "JSON";

    return [
      `Import this ${sourceLabel} conversation into ${targetLabel}.`,
      `Use the attached ${formatLabel} as the source of truth.`,
      "Continue naturally from the final user request, preserving task state, constraints, and unresolved questions.",
      "If earlier context was compressed, treat the compression summary as authoritative background rather than asking for a recap.",
      "",
      body,
    ].join("\n");
  }

  function collectRoleRows(queryAll, selectors) {
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
    PROVIDER_SELECTORS,
    PROVIDER_DIRECTORY,
    buildImportHelperText,
    buildPayload,
    collectRoleRows,
    compressConversation,
    detectPlatformFromHost,
    getProviderLabel,
    renderConversationExport,
  };
});
