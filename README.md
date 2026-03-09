# PromptBridge

PromptBridge is a Chrome Extension (Manifest V3) that exports chat conversations from AI providers into structured JSON so you can continue the same context across tools like ChatGPT, Claude, Gemini, Qwen, Kimi, and others.

## Why PromptBridge

AI conversations are usually locked inside one platform. When you switch providers, context gets lost and you have to manually copy/paste chat history.

PromptBridge solves this by:
- extracting conversation turns from the page
- formatting them into clean, portable JSON
- copying them to clipboard in one click

## Current Features

- `Copy Chat as JSON`
- `Copy Transfer Prompt + JSON` (best for continuation in other AI UIs)
- `Copy Last 10 Messages`
- `Copy Last 20 Messages`
- Pretty JSON output with metadata and handoff instructions
- Automatic platform detection in export metadata
- Attachment export per message:
  - image URLs
  - file names
  - file links
  - MIME/type hints
  - temporary-link detection (`is_temporary`)
  - source host/type (`source`)
  - capture timestamp (`captured_at`)

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

Note: AI product DOMs change frequently. Provider-specific selectors and a generic fallback parser are both included.

## Project Structure

```text
promptbridge-extension/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
├── background.js
├── styles.css
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

1. User clicks extension popup action.
2. `popup.js` requests extraction from `background.js`.
3. `background.js` relays request to `content.js` (and injects script if needed).
4. `content.js` extracts `{ role, content, attachments? }` turns from DOM.
5. Popup builds export payload and copies to clipboard.

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
    "instruction": "Treat the messages array as the full conversation history. Do not summarize unless asked. Continue by replying to the final user intent.",
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

Note: some providers expose signed/temporary asset URLs. `is_temporary: true` indicates links that may expire or require an authenticated session.

## Install (Unpacked Extension)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `promptbridge-extension/`
5. Pin PromptBridge and use it on a supported provider page

After code changes, click **Reload** in `chrome://extensions`.

## Permissions Used

- `activeTab`
- `scripting`
- `clipboardWrite`
- `storage`

## Roadmap

- JSON / Markdown / Plain Prompt output switcher
- Provider-specific parser tests
- Import helper flows for faster cross-provider continuation
- Optional conversation compression for long chats
