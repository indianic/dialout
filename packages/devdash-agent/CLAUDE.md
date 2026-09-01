# BrowserConnect

**Session start:** run `ToolSearch` with query `select:get_pending_message,send_response,clear_messages,get_console_log,get_network_requests,take_screenshot,click_element,fill_input,get_dom,execute_js,get_storage,get_performance,navigate_to,scroll_page,wait_for_element,get_selected_text,hover_element,type_text,press_key,find_element` once — this pre-loads the deferred MCP tool schemas so the first real call has no extra latency.

Only call these tools when explicitly asked — e.g. "check the panel", "any new message?", "read browser message".

When asked:
1. Call `get_pending_message`
2. If `pending: false` — say so briefly
3. If a message is waiting — print it:

   > 📨 **Panel message:** [the text]
   > 📸 **Screenshot:** [attached / not attached]

   Read it, reply helpfully, then call `send_response` with your reply.

Tools:
- `get_pending_message` — read the next message from the panel (clears it on read)
- `send_response` — send a reply back to the panel
- `clear_messages` — clear the queue
- `get_console_log` — fetch live browser console output (errors, warnings, logs, stack traces) from the active tab
- `get_network_requests` — fetch intercepted fetch/XHR requests (URL, method, status, duration, errors) from the active tab
- `take_screenshot` — capture the current visible tab as a JPEG and return it as an image; call proactively to see the page before clicking or when you need to understand the UI
- `click_element(selector)` — click a DOM element by CSS selector on the active tab
- `fill_input(selector, value)` — set an input/textarea value and fire input+change events
- `get_dom(selector?)` — get the outerHTML of the page or a specific element; useful for reading form state, finding selectors, or inspecting hidden content
- `execute_js(code)` — run arbitrary JS in the page's MAIN world and return the serialized result; use for reading page state, calling page APIs, or anything the DOM tools can't reach
- `get_storage()` — read localStorage, sessionStorage, and cookies from the active tab
- `get_performance()` — navigation timing, Core Web Vitals, and slowest resources
- `navigate_to(url)` — navigate the pinned tab to a URL and wait for load complete
- `scroll_page(direction, amount?)` — scroll the page: "down"/"up" by pixels, or "top"/"bottom" to jump
- `wait_for_element(selector, timeout?)` — poll until a CSS selector appears (useful after async renders)
- `get_selected_text()` — return whatever text the user has highlighted on the page
- `hover_element(selector)` — trigger mouseenter/mouseover to reveal tooltips or dropdown menus
- `type_text(text)` — type text into the focused element via real keyboard events; works on React controlled inputs and contenteditables
- `press_key(key)` — press a key on the focused element (Enter, Tab, Escape, ArrowDown, Backspace, etc.)
- `find_element(description)` — find a DOM element by natural language (e.g. "submit button", "email input"); returns CSS selector + outerHTML

**Auto-demand rule:** Call these proactively — don't ask the user to copy-paste.
- User mentions a JS error / bug → `get_console_log`
- User mentions API failure, 404, slow load, CORS, network issue → `get_network_requests`
- User mentions auth issue, unexpected logout, missing session, cookie problem → `get_storage`
- User mentions slow page, performance issue, Core Web Vitals, LCP/CLS → `get_performance`
- When in doubt about a page problem, call both console and network.
