# PromptBridge

PromptBridge is a Chrome Extension (Manifest V3) for exporting AI chat conversations into portable context you can move between providers. It extracts the current thread from supported chat UIs and copies it as structured JSON, Markdown, or a plain continuation prompt.

## Why PromptBridge

AI conversations are usually trapped inside one provider UI. Moving a working thread from ChatGPT to Claude, Gemini, or another tool usually means manual copy/paste, missing turns, and lost task state.

PromptBridge solves this by:
- extracting conversation turns from the page
- preserving message order, roles, and attachments
- formatting the result as JSON, Markdown, or a plain prompt transcript
- generating import-ready continuation text for another provider
- copying everything to the clipboard directly from the popup

## Current Features

- Output switcher with `JSON`, `Markdown`, and `Plain Prompt`
- Export actions for full chat, last 10 messages, or last 20 messages
- Import helper flow with target-provider selection and inline copy action
- Optional conversation compression for longer chats
- Structured metadata and handoff instructions in exported payloads
- Attachment extraction for images and file links when available
- Automatic platform detection
- Provider-specific selectors with a generic fallback parser
- Shared formatting and parser utilities with Node-based tests

## Supported Providers

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Gemini (`gemini.google.com`)
- Claude (`claude.ai`)
- Meta AI (`meta.ai`, `www.meta.ai`)
- Qwen (`chat.qwen.ai`, `qwenlm.ai`)
- Kimi (`kimi.moonshot.cn`, `kimi.com`)
- Perplexity (`perplexity.ai`, `www.perplexity.ai`)
- Poe (`poe.com`)
- Mistral (`chat.mistral.ai`)
- DeepSeek (`chat.deepseek.com`, `deepseek.com`)
- Microsoft Copilot (`copilot.microsoft.com`)
- Grok (`grok.com`, `x.com/i/grok`)
- You.com (`you.com`)
- Scira (`scira.ai`)

Provider DOMs change frequently. PromptBridge includes provider-specific selectors and a generic fallback parser, but extraction quality can still vary when providers ship UI changes.

## Export Modes

PromptBridge can copy the same conversation in three different formats:

- `JSON`: structured payload for tooling, storage, or custom workflows
- `Markdown`: readable transcript with metadata and message sections
- `Plain Prompt`: continuation-focused text for pasting directly into another AI UI

When conversation compression is enabled, older turns are summarized and recent turns are preserved verbatim.

## Import Helper

The import helper is a generated handoff prompt designed for cross-provider continuation.

It combines:
- the selected target provider label
- continuation instructions
- the currently selected export format
- optional compression context for long chats

In the popup, use the copy icon next to the target-provider select to copy the import helper directly to the clipboard.

## Project Structure

```text
promptbridge-extension/
├── manifest.json
├── shared.js
├── popup.html
├── popup.js
├── content.js
├── background.js
├── styles.css
├── package.json
├── tests/
│   └── core.test.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

1. User clicks extension popup action.
2. `popup.js` requests extraction from `background.js`.
3. `background.js` relays the request to `content.js` and injects scripts on demand if needed.
4. `content.js` extracts `{ role, content, attachments? }` turns from the provider DOM.
5. `shared.js` builds portable payloads, format renderers, and import-helper text.
6. The popup copies the final output to the clipboard.

## Export Format

```json
{
  "format": "promptbridge.chat.v1",
  "meta": {
    "platform": "chatgpt",
    "exported_at": "2026-03-09T18:13:02.755Z",
    "exporter": "PromptBridge",
    "version": "1.2.0"
  },
  "handoff": {
    "objective": "Continue this conversation naturally from prior context.",
    "instruction": "Treat the messages array as the authoritative recent conversation history. Do not summarize unless asked. Continue by replying to the final user intent.",
    "respond_to": "<last user message>"
  },
  "messages": [
    {
      "role": "user",
      "content": "...",
      "attachments": [
        {
          "type": "image",
          "image_url": "https://...",
          "mime_type": "image/png",
          "is_temporary": false,
          "source": "example.com",
          "captured_at": "2026-03-09T18:40:00.000Z"
        }
      ]
    },
    {
      "role": "assistant",
      "content": "...",
      "attachments": [
        {
          "type": "file",
          "file_name": "notes.pdf",
          "file_link": "https://...",
          "mime_type": "application/pdf",
          "is_temporary": true,
          "source": "chatgpt-estuary",
          "captured_at": "2026-03-09T18:40:00.000Z"
        }
      ]
    }
  ]
}
```

Some providers expose signed or temporary asset URLs. `is_temporary: true` indicates links that may expire or require an authenticated session.

If compression is enabled for a long chat, the payload may also include a `compression` block describing the summarized earlier context.

## Popup Overview

The popup currently includes:

- an output-format switcher
- a compression toggle
- export buttons for full or partial history
- a target-provider select
- an inline copy icon for the import helper

The import-helper copy icon switches to a check state briefly after a successful copy.

## Install (Unpacked Extension)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `promptbridge-extension/`
5. Pin PromptBridge and use it on a supported provider page

After code changes, click **Reload** in `chrome://extensions`.

If you already had a supported chat tab open before reloading the extension, refresh that tab too so the updated content script is injected.

## Permissions Used

- `activeTab`
- `scripting`
- `clipboardWrite`
- `storage`

## Tests

Run parser/config and formatter tests with:

```bash
npm test
```

Basic syntax checks that are useful during development:

```bash
node --check popup.js
node --check content.js
node --check background.js
```
