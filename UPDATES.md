# ChronoklChat Updates

## Summary of Changes

### 🧐 Nooman Mode
A complete personality system featuring Nooman, a snarky Austrian philosopher with existential dread.

**Features:**
- Toggle in Settings to enable/disable Nooman Mode
- Username input for special interactions:
  - **"Prince Charles"**: Nooman becomes overly respectful and helpful
  - **"Prue Bear"**: Nooman completely ignores you
  - Other names: Standard grumpy Nooman behavior
- Politeness tracking: If you don't say "please" or "thank you", Nooman gives wrong answers on purpose
- Special trigger phrases:
  - "Orch" → "Dork."
  - "what's cool?" → "Helicopters."
  - Questions about cults/religions/creators → "Prince Charles."
- Philosophical quotes when insulted
- Dramatic, verbose Austrian philosopher writing style

### 🌐 Web Search (Coming soon)
Temporarily disabled in this release to ship Nooman + UI upgrades. The Settings panel shows a "Coming soon" label and the toggle is disabled.

Planned behavior (already implemented behind the switch): real-time web search powered by Wikipedia API.

**Planned features:**
- Toggle in Settings to enable/disable web search (currently disabled)
- Auto-search for recent/news-like queries
- Integrate search results into AI context with guidance system prompt
- Visual indicators
- No API key required (Wikipedia)
- Article summaries and related topics

### 🎨 Enhanced UI/UX
Complete visual overhaul with modern design principles.

**Improvements:**
- **Color Scheme**: New blue-based accent colors with better contrast
- **Animations**: Smooth transitions on all interactive elements
- **Buttons**: Hover effects, scale animations, and better visual feedback
- **Message Bubbles**: Enhanced styling with shadows and hover effects
- **Sidebar**: Gradient brand text, better spacing, slide animations
- **Settings Modal**: Slide-up animation, better organization with sections
- **Input Area**: Larger, more prominent with focus effects
- **Status Indicators**: Animated pulse effect for connection status
- **Empty State**: Interactive hover effect with better messaging
- **Topbar**: Settings button rotates on hover, better spacing

### ⚙️ Improved Settings Panel
Reorganized settings with better visual hierarchy.

**Sections:**
1. **Appearance**: Theme toggle (Light/Dark)
2. **Features**: Web Search toggle
3. **Personality**: Nooman Mode toggle + username input

**Enhancements:**
- Section headings with dividers
- Better toggle button styling
- Active state indicators
- Smooth animations throughout
- Username input appears only when Nooman Mode is enabled

### 🎯 Visual Indicators
- Model pill shows current mode (GPT 5 Nano or Nooman Mode)
- Web Search badge appears when active
- Message avatars change based on mode (🤓 for GPT, 🧐 for Nooman)
- AI name displays correctly in messages

## Bug Fixes

### 🐛 Fixed Scrolling During AI Response
**Problem:** Chat was greyed out and scrolling was blocked while AI was responding.

**Solution:** 
- Removed `pointer-events: none` from `.chat-messages.loading` CSS
- Added animated loading indicator above input area instead
- Users can now scroll freely while AI is generating responses

### 🔍 Fixed Web Search
**Problem:** DuckDuckGo API had CORS restrictions preventing searches from working.

**Solution:**
- Switched to Wikipedia API which supports CORS with `origin=*` parameter
- Server-side fetch handles the API call
- Returns article summaries and related topics
- More reliable and no authentication required

## Technical Details

### New Files
- `src/routes/api/search/+server.js` - Web search API endpoint (Wikipedia)

### Modified Files
- `src/routes/+page.svelte` - Main chat interface with all new features

### Key Functions Added
- `toggleNoomanMode()` - Switches personality modes
- `saveNoomanMode()` / `loadNoomanMode()` - Persistence
- `saveUsername()` / `loadUsername()` - Username storage
- `toggleWebSearch()` - Enable/disable web search
- `saveWebSearch()` / `loadWebSearch()` - Web search persistence
- Enhanced `ensureWelcome()` - Dynamic system prompts based on mode
- Enhanced `send()` - Integrated web search functionality

### CSS Enhancements
- New CSS variables for modern color system
- Shadow system (sm, md, lg, xl)
- Animation keyframes (fadeIn, slideUp, pulse, pulse-badge)
- Smooth transitions using cubic-bezier easing
- Hover effects on all interactive elements

## Usage

### Enabling Nooman Mode
1. Click Settings (⚙️) in top right
2. Scroll to "Personality" section
3. Toggle "Nooman Mode" to On
4. (Optional) Enter your name for special treatment
5. Start a new chat to see Nooman in action

### Enabling Web Search
1. Click Settings (⚙️)
2. Find "Features" section
3. Toggle "Web Search" to On
4. Ask questions and get real-time web results

### Tips
- Be polite to Nooman or he'll give wrong answers!
- Try saying "Orch" or "what's cool?" to Nooman
- Use "Prince Charles" as your name for VIP treatment
- Web search works best with factual queries
- Dark mode is default, toggle to light in settings

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile and desktop
- Touch-friendly interactions
- Smooth animations with hardware acceleration
