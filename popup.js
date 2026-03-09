/**
 * Popup controller for PromptBridge.
 * - Requests extraction from content script via background service worker.
 * - Builds structured JSON payload.
 * - Copies to clipboard.
 */

const statusEl = document.getElementById("status");

/**
 * Set a status message in popup.
 * @param {string} message
 * @param {"success" | "error" | ""} type
 */
function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

/**
 * Get currently active tab.
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found.");
  }
  return tab;
}

/**
 * Ask background to fetch messages from content script.
 * @param {number} tabId
 * @returns {Promise<{ platform: string, messages: Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }> }>}
 */
async function requestMessages(tabId) {
  const response = await chrome.runtime.sendMessage({
    type: "PROMPTBRIDGE_EXPORT_REQUEST",
    tabId,
  });

  if (!response || response.ok !== true) {
    throw new Error(response?.error || "Could not extract messages from this page.");
  }

  return {
    platform: response.platform || "unknown",
    messages: response.messages || [],
  };
}

/**
 * Build final export payload.
 * @param {string} platform
 * @param {Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }>} messages
 * @returns {{
 *   format: string,
 *   meta: { platform: string, exported_at: string, exporter: string, version: string },
 *   handoff: { objective: string, instruction: string, respond_to: string },
 *   messages: Array<{
 *     role: "user" | "assistant",
 *     content: string,
 *     attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 *   }>
 * }}
 */
function buildPayload(platform, messages) {
  const lastUserMessage = [...messages].reverse().find((item) => item.role === "user");
  const extensionVersion = chrome.runtime.getManifest().version || "1.0.0";

  return {
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
        "Treat the messages array as the full conversation history. Do not summarize unless asked. Continue by replying to the final user intent.",
      respond_to: lastUserMessage?.content || "Use the latest unresolved user request in messages.",
    },
    messages,
  };
}

/**
 * Copy given object as pretty JSON.
 * @param {object} data
 */
async function copyJson(data) {
  const json = JSON.stringify(data, null, 2);
  await navigator.clipboard.writeText(json);
}

/**
 * Copy an explicit handoff prompt with embedded JSON payload.
 * @param {object} data
 */
async function copyTransferPrompt(data) {
  const body = [
    "Continue this conversation from the imported context below.",
    "Use the messages as authoritative history.",
    "Reply to the latest user request directly. Do not summarize unless asked.",
    "",
    JSON.stringify(data, null, 2),
  ].join("\n");

  await navigator.clipboard.writeText(body);
}

/**
 * Main export handler.
 * @param {number | null} limit
 * @param {"json" | "transfer"} mode
 */
async function exportConversation(limit = null, mode = "json") {
  try {
    setStatus("Extracting messages...");

    const tab = await getActiveTab();
    const result = await requestMessages(tab.id);
    const { platform, messages } = result;

    if (!messages.length) {
      throw new Error("No chat messages detected on this page.");
    }

    const selected = typeof limit === "number" ? messages.slice(-limit) : messages;
    const payload = buildPayload(platform, selected);

    if (mode === "transfer") {
      await copyTransferPrompt(payload);
    } else {
      await copyJson(payload);
    }

    setStatus("Context copied to clipboard", "success");
  } catch (error) {
    setStatus(error.message || "Failed to copy context.", "error");
  }
}

document.getElementById("copy-all").addEventListener("click", () => {
  void exportConversation(null);
});

document.getElementById("copy-transfer").addEventListener("click", () => {
  void exportConversation(null, "transfer");
});

document.getElementById("copy-10").addEventListener("click", () => {
  void exportConversation(10);
});

document.getElementById("copy-20").addEventListener("click", () => {
  void exportConversation(20);
});
