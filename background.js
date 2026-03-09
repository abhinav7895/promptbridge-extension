/**
 * Background service worker for PromptBridge.
 * Acts as a relay between popup and content script.
 */

/**
 * Send extraction request to content script.
 * @param {number} tabId
 * @returns {Promise<{ ok: boolean, platform?: string, messages?: Array<{
 *   role: "user" | "assistant",
 *   content: string,
 *   attachments?: Array<{ type: "image" | "file", image_url?: string, file_name?: string, file_link?: string, mime_type?: string }>
 * }>, error?: string }>}
 */
function sendExtractMessage(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "PROMPTBRIDGE_EXTRACT_MESSAGES" },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "No receiver" });
          return;
        }

        if (!response || response.ok !== true) {
          resolve({
            ok: false,
            error: response?.error || "Failed to extract conversation.",
          });
          return;
        }

        resolve({
          ok: true,
          platform: response.platform || "unknown",
          messages: response.messages || [],
        });
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "PROMPTBRIDGE_EXPORT_REQUEST") {
    return;
  }

  const { tabId } = message;

  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "Invalid tab id." });
    return;
  }

  (async () => {
    let result = await sendExtractMessage(tabId);
    if (result.ok) {
      sendResponse(result);
      return;
    }

    // If content script is not attached yet (e.g. existing tab after install),
    // inject it and retry once.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"],
      });
    } catch (_error) {
      sendResponse({
        ok: false,
        error: "Unable to access this page. Open a supported AI chat page and try again.",
      });
      return;
    }

    result = await sendExtractMessage(tabId);
    if (!result.ok) {
      sendResponse({
        ok: false,
        error: "Unable to access this page. Open a supported AI chat page and try again.",
      });
      return;
    }

    sendResponse(result);
  })();

  return true;
});
