<script>
  import { onMount } from 'svelte';

  let input = '';
  let loading = false;
  let conversations = [];
  let activeConversationId = null;
  let messageEnd;
  let showSettings = false;
  let theme = 'dark'; // 'dark' | 'light'
  // local derived view rendered in template
  let messages = [];

  const STORAGE_KEY = 'chronoklchat:conversations:v1';
  const THEME_KEY = 'chronoklchat:theme';

  function saveTheme() { try { localStorage.setItem(THEME_KEY, theme); } catch {} }
  function loadTheme() {
    try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') theme = t; } catch {}
  }

  function applyTheme() {
    const b = document.body;
    if (!b) return;
    b.classList.remove('light');
    if (theme === 'light') b.classList.add('light');
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveTheme();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeConversationId })); } catch {}
  }

  function clearAll() {
    if (confirm('Clear all conversations? This cannot be undone.')) {
      const first = createConversation('Welcome');
      ensureWelcome(first);
      conversations = [first];
      activeConversationId = first.id;
      save();
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function createConversation(title = 'New Chat') {
    return { id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()), title, messages: [] };
  }

  function ensureWelcome(conv) {
    if (conv.messages.length === 0) {
      conv.messages.push(
        { role: 'system', content: 'You are a helpful AI assistant. Keep your responses concise and to the point.' },
        { role: 'ai', content: 'Hello! How can I assist you today?' }
      );
    }
  }

  function newChat() {
    const c = createConversation('Untitled');
    ensureWelcome(c);
    conversations = [c, ...conversations];
    activeConversationId = c.id;
    save();
    queueMicrotask(scrollToBottom);
  }

  function selectChat(id) {
    activeConversationId = id;
    const c = conversations.find(x => x.id === id);
    if (c && c.messages.length === 0) {
      ensureWelcome(c);
      conversations = conversations.map(x => x.id === c.id ? c : x);
    }
    save();
    queueMicrotask(scrollToBottom);
  }

  function activeConv() {
    return conversations.find(c => c.id === activeConversationId);
  }

  // Derived view of messages for the template (track dependencies explicitly)
  $: messages = (conversations.find(c => c.id === activeConversationId)?.messages) ?? [];

  function addMessage(role, content, extra = {}) {
    let c = activeConv();
    // Fallback: create/select a conversation if none active
    if (!c) {
      const created = createConversation('Untitled');
      ensureWelcome(created);
      conversations = [created, ...conversations];
      activeConversationId = created.id;
      c = created;
    }
    c.messages = [...(c.messages || []), { role, content, ...extra }];
    conversations = conversations.map(x => x.id === c.id ? c : x);
    save();
  }

  // Auto-scroll to bottom when messages change
  function scrollToBottom() {
    if (messageEnd) {
      messageEnd.scrollIntoView({ behavior: 'smooth' });
    }
  }

  onMount(() => {
    // theme
    loadTheme();
    applyTheme();

    const data = load();
    if (data && Array.isArray(data.conversations) && data.conversations.length) {
      conversations = data.conversations.map(c => {
        if (!Array.isArray(c.messages)) c.messages = [];
        // normalize legacy roles like 'assistant' -> 'ai'
        c.messages = c.messages.map(m => ({
          ...m,
          role: m?.role === 'assistant' ? 'ai' : m?.role
        }));
        if (c.messages.length === 0) ensureWelcome(c);
        return c;
      });
      const exists = conversations.find(x => x.id === data.activeConversationId);
      activeConversationId = exists ? exists.id : conversations[0]?.id;
      if (!activeConversationId && conversations.length) {
        activeConversationId = conversations[0].id;
      }
    } else {
      const first = createConversation('Welcome');
      ensureWelcome(first);
      conversations = [first];
      activeConversationId = first.id;
      save();
    }
  });

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // Add user message
    addMessage('user', text);
    input = '';

    // Add loading indicator
    const loadingId = Date.now();
    addMessage('ai', '...', { loading: true, id: loadingId });

    loading = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: (activeConv()?.messages || [])
            .filter(m => !m.loading)
            .map(({ role, content }) => ({ role, content }))
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to get response');
      }

      // Replace loading with AI response
      const c = activeConv();
      if (c) {
        c.messages = c.messages.filter(m => !m.loading || m.id !== loadingId).concat(data.message);
        conversations = conversations.map(x => x.id === c.id ? c : x);
        // Title: set to first non-system message start
        if (!c.title || c.title === 'Untitled') {
          const firstUser = c.messages.find(m => m.role === 'user');
          if (firstUser) c.title = (firstUser.content || 'New Chat').slice(0, 40);
        }
        save();
      }

    } catch (e) {
      const c = activeConv();
      if (c) {
        c.messages = c.messages.map(m => m.loading && m.id === loadingId 
          ? { role: 'ai', content: `Error: ${e.message || 'Unknown error'}` }
          : m);
        conversations = conversations.map(x => x.id === c.id ? c : x);
        save();
      }
    } finally {
      loading = false;
      requestAnimationFrame(scrollToBottom);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Scroll when messages change
  $: if (messages.length) {
    requestAnimationFrame(scrollToBottom);
  }
</script>

<svelte:head>
  <title>ChronoklChat</title>
</svelte:head>

<div class="app">
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="brand">ChronoklChat</div>
      <div class="model-pill">openai/gpt-oss-20b</div>
    </div>
    <nav class="nav">
      <button class="primary-btn" on:click={newChat}>+ New Chat</button>
      <div class="section-title">Recent</div>
      <ul class="conversation-list" role="list">
        {#each conversations as c}
          <li>
            <button
              type="button"
              class="conv-item {c.id === activeConversationId ? 'active' : ''}"
              on:click={() => selectChat(c.id)}
              title={c.title}
            >
              {c.title || 'Untitled'}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
    <div class="sidebar-footer">
      <button class="ghost-btn" on:click={() => (showSettings = true)}>Settings</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <div class="topbar-left">
        <h1>{activeConv()?.title || 'Chat'}</h1>
      </div>
      <div class="topbar-right">
        <span class="status-dot online"></span>
        <span class="status-text">Connected</span>
      </div>
    </header>

    <div class="chat-container">
      <!-- TEMP debug: shows message count and basic state to verify render path -->
      
      <div class="chat-messages" class:loading={loading}>
        <div class="messages-inner">
          {#if messages.length === 0}
            <div class="empty-state">
              <div class="empty-card">
                <div class="empty-title">Start a conversation</div>
                <div class="empty-desc">Type a message below to begin.</div>
              </div>
            </div>
          {/if}
          {#each messages as message, i (message.id || i)}
            {#if message.role === 'user' || message.role === 'ai'}
              <div class="message {message.role}">
                <div class="message-content">
                  <div class="message-role">
                    {message.role === 'user' ? 'You' : 'AI'}
                  </div>
                  <div class="message-text">
                    {message.content}
                  </div>
                </div>
              </div>
            {:else if message.role === 'system'}
              <div class="message system">
                <div class="system-card">
                  <div class="message-role">System</div>
                  <div class="message-text">{message.content}</div>
                </div>
              </div>
            {/if}
          {/each}
          <div bind:this={messageEnd}></div>
        </div>
      </div>

      <div class="chat-input-container">
        <form on:submit|preventDefault={send}>
          <div class="input-wrapper">
            <textarea 
              bind:value={input}
              placeholder="Type a message..."
              on:keydown={handleKeyDown}
              disabled={loading}
              rows="1"
            ></textarea>
            <button 
              class="send-button" 
              type="submit" 
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {#if loading}
                <div class="spinner"></div>
              {:else}
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2 .01 7z"></path>
                </svg>
              {/if}
            </button>
          </div>
          <div class="hint">Enter to send • Shift+Enter = new line</div>
        </form>
      </div>
    </div>

    
    {#if showSettings}
      <button class="modal-backdrop" on:click={() => (showSettings = false)} aria-label="Close settings overlay"></button>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="icon-btn" on:click={() => (showSettings = false)} aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <div class="setting-row">
            <div>
              <div class="setting-title">Theme</div>
              <div class="setting-desc">Switch between light and dark</div>
            </div>
            <button class="toggle" on:click={toggleTheme} aria-pressed={theme === 'light'}>
              {theme === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="danger-btn" on:click={() => { showSettings = false; clearAll(); }}>Clear all chats</button>
          <button class="ghost-btn" on:click={() => (showSettings = false)}>Close</button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Theme base */
  :global(body) {
    --bg: #000000;
    --panel: #0e0f11;
    --panel-2: #111315;
    --text: #F4F4F9;
    --muted: #586F7C;
    --accent: #04724D;
    --accent-2: #B8DBD9;
    --border: rgba(255, 255, 255, 0.16);
    --input-border: rgba(88, 111, 124, 0.35);
    --bubble: #22262b;
    --bubble-text: #F4F4F9;
  }
  :global(body.light) {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --panel-2: #ffffff;
    --text: #0e0f11;
    --muted: #586F7C;
    --accent: #04724D;
    --accent-2: #586F7C;
    --border: rgba(0,0,0,0.12);
    --input-border: rgba(0,0,0,0.18);
    --bubble: #ffffff;
    --bubble-text: #0e0f11;
  }
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  :global(html, body) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: var(--text);
    background-color: var(--bg);
    overflow: hidden;
  }
  
  .app {
    display: flex;
    flex-direction: row;
    height: 100vh;
    width: 100%;
    margin: 0;
    padding: 0;
    background: var(--bg);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 100%;
    overflow: hidden;
    color: #F4F4F9;
  }

  /* Sidebar */
  .sidebar {
    width: 260px;
    border-right: 1px solid rgba(184, 219, 217, 0.15);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    padding: 16px 14px;
    gap: 14px;
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .brand {
    font-weight: 700;
    letter-spacing: 0.3px;
    color: var(--text);
  }

  .model-pill {
    display: inline-block;
    font-size: 0.75rem;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--panel-2);
    border: 1px solid var(--input-border);
    color: var(--accent-2);
    width: fit-content;
  }

  .nav .section-title {
    margin: 14px 0 8px;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .conversation-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    margin: 0;
  }

  .conv-item {
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text);
    cursor: pointer;
    display: block;
    width: 100%;
    text-align: left;
    font-size: 1rem;
    min-height: 40px;
  }
  .conv-item:hover {
    background: var(--panel-2);
    border-color: var(--border);
  }
  .conv-item.active {
    background: var(--panel-2);
    border-color: var(--accent);
  }

  .primary-btn {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--text);
    border: none;
    cursor: pointer;
  }
  .primary-btn:hover { background: #036241; }

  .ghost-btn {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    color: var(--accent-2);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .ghost-btn:hover { background: #111315; }

  .sidebar-footer { margin-top: auto; }

  /* Main column */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .topbar h1 { font-size: 1rem; margin: 0; color: var(--text); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .online { background: #04724D; box-shadow: 0 0 8px #04724D; }
  .status-text { color: var(--accent-2); font-size: 0.85rem; }
  
  .chat-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    position: relative;
    width: 100%;
    max-width: 100%;
  }
  
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 120px; /* space for input */
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .messages-inner {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  
  .chat-messages.loading {
    opacity: 0.7;
    pointer-events: none;
  }
  
  .message {
    max-width: 90%;
    align-self: flex-start;
    width: fit-content;
    animation: fadeIn 0.2s ease-out;
    box-sizing: border-box;
  }
  /* Neutralize global app.css bubbles and enforce our layout */
  .chat-messages .message,
  .chat-messages .message.user,
  .chat-messages .message.ai,
  .chat-messages .message.system {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }
  .message.user { align-self: flex-end; }
  
  .message.user {
    align-self: flex-end;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .message-content {
    background: var(--bubble);
    color: var(--bubble-text);
    border-radius: 16px;
    padding: 14px 16px;
    display: inline-block;
    border: 1px solid var(--border);
    box-shadow: 0 10px 28px rgba(0,0,0,0.55);
  }
  
  .message.user .message-content {
    background: var(--bubble); /* unify with AI bubble */
    color: var(--bubble-text);
    border-bottom-right-radius: 0.25rem;
  }
  
  .message.ai .message-content {
    border-bottom-left-radius: 0.25rem;
  }
  
  .message-role {
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    opacity: 0.95;
    color: var(--accent-2);
  }
  /* System message card appearance */
  .system-card {
    background: var(--panel-2);
    border: 1px dashed var(--border);
    color: var(--text);
    border-radius: 12px;
    padding: 10px 12px;
    max-width: 90%;
  }
  
  .message.user .message-role {
    color: #04724D;
  }
  
  .message-text {
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--bubble-text) !important;
  }
  
  .chat-input-container {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 16px 22px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 5;
  }
  
  .input-wrapper {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
  }
  
  textarea {
    flex: 1;
    min-height: 48px;
    max-height: 180px;
    padding: 12px 14px;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    font-family: inherit;
    font-size: 0.95rem;
    resize: none;
    outline: none;
    transition: all 0.2s ease;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
    line-height: 1.45;
    background: var(--panel-2);
    color: var(--text);
  }
  
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(4, 114, 77, 0.25);
    background: var(--panel-2);
  }
  
  .send-button {
    background: var(--accent);
    color: var(--text);
    border: none;
    border-radius: 10px;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 6px 18px rgba(4, 114, 77, 0.35);
  }
  .send-button:hover:not(:disabled) {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }
  .send-button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 4px 14px rgba(4, 114, 77, 0.3);
  }
  
  .send-button:disabled {
    background: var(--panel-2);
    color: var(--muted);
    cursor: not-allowed;
    box-shadow: none;
    border: 1px solid rgba(88, 111, 124, 0.35);
  }
  
  .send-button:not(:disabled):hover {
    background: #036241;
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(4, 114, 77, 0.45);
  }
  
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .hint {
    font-size: 0.75rem;
    color: #999;
    text-align: center;
    margin-top: 0.5rem;
  }
  
  .app-footer {
    text-align: center;
    padding: 8px 16px;
    font-size: 0.8rem;
    color: var(--muted);
    border-top: 1px solid var(--border);
    background: var(--panel);
  }

  .empty-state { display: flex; justify-content: center; align-items: center; padding: 32px 0; }
  .empty-card { border: 1px solid var(--border); background: var(--panel-2); border-radius: 12px; padding: 16px 18px; text-align: center; }
  .empty-title { font-weight: 700; margin-bottom: 4px; }
  .empty-desc { color: var(--muted); font-size: 0.95rem; }

  /* Settings modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }
  .modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92vw);
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  }
  .modal-header, .modal-footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }
  .modal-footer { border-top: 1px solid var(--border); border-bottom: 0; }
  .modal-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .icon-btn { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 8px; padding: 6px 8px; cursor: pointer; }
  .toggle { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
  .danger-btn { background: #b3261e; color: #fff; border: 1px solid #b3261e; border-radius: 10px; padding: 10px 12px; cursor: pointer; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .setting-title { font-weight: 600; }
  .setting-desc { color: var(--muted); font-size: 0.9rem; }
  
  @media (min-width: 768px) {
    .message { max-width: 64%; }
    .message.user { max-width: 64%; }
  }

  @media (max-width: 900px) {
    .sidebar { display: none; }
    .app { flex-direction: column; }
    .topbar { position: sticky; top: 0; z-index: 10; }
  }
  
  @media (max-width: 767px) {
    .message {
      max-width: 90%;
    }
    
    .chat-messages {
      padding: 0.75rem;
    }
    
    .message-content {
      padding: 0.6rem 0.9rem;
    }
    
    .message-role {
      font-size: 0.7rem;
    }
  }
</style>
