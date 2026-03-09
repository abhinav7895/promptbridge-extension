/**
 * Popup controller for PromptBridge.
 * - Requests extraction from content script via background service worker.
 * - Builds structured payloads.
 * - Copies to clipboard.
 */

const core = globalThis.PromptBridgeCore || null;
const PROVIDER_DIRECTORY = core?.PROVIDER_DIRECTORY || [];
const buildImportHelperText = core?.buildImportHelperText || null;
const buildPayload = core?.buildPayload || null;
const renderConversationExport = core?.renderConversationExport || null;

const statusEl = document.getElementById("status");
const compressEl = document.getElementById("compress-context");
const targetProviderEl = document.getElementById("target-provider");
const copyImportHelperIconEl = document.getElementById("copy-import-helper-icon");
const formatEls = Array.from(document.querySelectorAll("input[name='output-format']"));
const copyAllEl = document.getElementById("copy-all");
const copy10El = document.getElementById("copy-10");
const copy20El = document.getElementById("copy-20");
const STORAGE_KEYS = {
  outputFormat: "promptbridge.outputFormat",
  compress: "promptbridge.compress",
  targetProvider: "promptbridge.targetProvider",
};
let copyIconResetTimer = null;

/**
 * Set a status message in popup.
 * @param {string} message
 * @param {"success" | "error" | ""} type
 */
function setStatus(message, type = "") {
  if (!statusEl) return;
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
 * Copy text to the clipboard.
 * @param {string} value
 */
async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function getSelectedFormat() {
  return formatEls.find((item) => item.checked)?.value || "json";
}

async function persistPreferences() {
  if (!compressEl || !targetProviderEl) return;
  await chrome.storage.local.set({
    [STORAGE_KEYS.outputFormat]: getSelectedFormat(),
    [STORAGE_KEYS.compress]: compressEl.checked,
    [STORAGE_KEYS.targetProvider]: targetProviderEl.value,
  });
}

async function hydratePreferences() {
  if (!compressEl || !targetProviderEl) return;
  const defaults = {
    [STORAGE_KEYS.outputFormat]: "json",
    [STORAGE_KEYS.compress]: false,
    [STORAGE_KEYS.targetProvider]: "claude",
  };
  const values = await chrome.storage.local.get(defaults);

  formatEls.forEach((item) => {
    item.checked = item.value === values[STORAGE_KEYS.outputFormat];
  });
  compressEl.checked = Boolean(values[STORAGE_KEYS.compress]);
  targetProviderEl.value = values[STORAGE_KEYS.targetProvider];
}

function populateTargetProviders() {
  if (!targetProviderEl) return;
  const options = PROVIDER_DIRECTORY.map(
    (provider) => `<option value="${provider.id}">${provider.label}</option>`
  ).join("");
  targetProviderEl.innerHTML = options;
}

function showCopySuccessIcon() {
  if (!copyImportHelperIconEl) return;
  if (copyIconResetTimer) {
    window.clearTimeout(copyIconResetTimer);
  }

  copyImportHelperIconEl.classList.add("is-success");
  copyIconResetTimer = window.setTimeout(() => {
    copyImportHelperIconEl.classList.remove("is-success");
    copyIconResetTimer = null;
  }, 1500);
}

/**
 * Main export handler.
 * @param {number | null} limit
 * @param {"export" | "import-helper"} mode
 */
async function exportConversation(limit = null, mode = "export") {
  try {
    if (!core || !buildPayload || !renderConversationExport || !buildImportHelperText) {
      throw new Error("PromptBridge failed to initialize. Reload the extension and try again.");
    }
    if (!compressEl || !targetProviderEl) {
      throw new Error("PromptBridge popup is missing required controls.");
    }

    setStatus("Extracting messages...");

    const tab = await getActiveTab();
    const result = await requestMessages(tab.id);
    const { platform, messages } = result;

    if (!messages.length) {
      throw new Error("No chat messages detected on this page.");
    }

    const selected = typeof limit === "number" ? messages.slice(-limit) : messages;
    const payload = buildPayload(platform, selected, {
      compress: compressEl.checked,
      compressionOptions: { threshold: 12, recentCount: 8 },
      extensionVersion: chrome.runtime.getManifest().version || "1.0.0",
    });

    const text =
      mode === "import-helper"
        ? buildImportHelperText(payload, {
            targetProvider: targetProviderEl.value,
            outputFormat: getSelectedFormat(),
          })
        : renderConversationExport(payload, getSelectedFormat());

    await copyText(text);
    await persistPreferences();

    if (mode === "import-helper") {
      showCopySuccessIcon();
    }

    setStatus("Context copied to clipboard", "success");
  } catch (error) {
    setStatus(error.message || "Failed to copy context.", "error");
  }
}

function initializePopup() {
  if (!core) {
    setStatus("PromptBridge failed to initialize. Reload the extension.", "error");
    return;
  }

  populateTargetProviders();
  void hydratePreferences();

  formatEls.forEach((item) => {
    item.addEventListener("change", () => {
      void persistPreferences();
    });
  });

  compressEl?.addEventListener("change", () => {
    void persistPreferences();
  });

  targetProviderEl?.addEventListener("change", () => {
    void persistPreferences();
  });

  copyAllEl?.addEventListener("click", () => {
    void exportConversation(null);
  });

  copy10El?.addEventListener("click", () => {
    void exportConversation(10);
  });

  copy20El?.addEventListener("click", () => {
    void exportConversation(20);
  });

  copyImportHelperIconEl?.addEventListener("click", () => {
    void exportConversation(null, "import-helper");
  });
}

initializePopup();
