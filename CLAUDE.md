# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Site Topping" that displays a sidebar on the right side of web pages with tabbed interface for code editing, AI chat functionality, and live code preview. The extension is built with React, TypeScript, and Vite using Chrome Extension Manifest V3 with Supabase authentication integration.

## Architecture

- **React + TypeScript**: Modern component-based architecture with type safety
- **Vite Build System**: Fast development and optimized production builds with dual-mode configuration
- **Manifest V3 Extension**: Uses service worker background script with permissions for `activeTab`, `scripting`, `identity`, `tabs`, `storage`
- **Content Script Injection**: React app automatically injected into all web pages (`*://*/*`)
- **Message Passing**: Background script communicates with React content script via `chrome.tabs.sendMessage`
- **CSS Modules**: Scoped styling with CSS modules
- **Component Architecture**: Modular React components with Context API for state management
- **Supabase Integration**: Authentication using Chrome extension storage for session persistence
- **CodeMirror Editor**: Advanced code editing with JavaScript/CSS syntax highlighting and themes
- **Live Code Preview**: Real-time CSS/JS injection into web pages with CSP-aware execution methods

## Key Components

- `manifest.json` - Extension configuration with permissions for `activeTab`, `scripting`, `identity`, `tabs`, `storage`
- `src/background.ts` - TypeScript service worker handling extension icon clicks, script injection, and OAuth
- `src/content.tsx` - React app entry point with message handling and URL change detection
- `src/components/AppWrapper.tsx` - Main wrapper component orchestrating FloatingButton and SidePanel
- `src/components/SidePanel.tsx` - Main React component with tabbed interface and resize functionality
- `src/contexts/AppContext.tsx` - React Context with useReducer for global state management
- `src/contexts/AuthContext.tsx` - Authentication context with Supabase integration and Chrome storage
- `src/services/chrome.ts` - Chrome extension API abstraction with retry logic
- `src/services/codePreview.ts` - Live code injection service with CSS scoping and CSP-aware JS execution
- `src/services/supabase.ts` - Supabase client configured for Chrome extension storage
- `vite.config.ts` - Dual-mode Vite configuration for development preview and extension builds

## Development Commands

### Standard Development Workflow

```bash
npm run dev        # Start Vite dev server for Chrome extension development
npm run build      # TypeScript compilation + Vite build for production (generates dist/ folder)
npm run preview    # Preview production build
```

**No linting or type-checking commands configured** - TypeScript compilation happens during build process.

### Development Preview Mode

```bash
npm run dev:preview # Start standalone web preview mode (opens dev.html)
```

This special mode allows developing the UI components in a regular browser without Chrome extension APIs, useful for rapid UI development and testing.

### Chrome Extension Development Process

1. Run `npm run build` to generate `dist/` folder
2. Load unpacked extension from `dist/` folder in Chrome (`chrome://extensions/`)
3. Use `npm run dev` for development with hot reloading
4. Reload extension in Chrome after significant changes to background script or manifest

## Architecture Details

### State Management Pattern

The application uses a centralized state management pattern:

- **AppContext** (`src/contexts/AppContext.tsx`) - React Context with useReducer for global state
- **State Structure**: `{ isOpen, activeTab, width, isLoading, error }`
- **Action-based Updates**: Dispatched through context actions (togglePanel, setActiveTab, etc.)
- **Component Integration**: All components access state via `useAppContext()` hook

### Chrome Extension Communication Flow

1. **User Interaction**: User clicks extension icon
2. **Background Script**: `background.ts` receives `chrome.action.onClicked` event
3. **Message Passing**: Background calls `toggleSidePanel(tabId)` from `services/chrome.ts`
4. **Retry Logic**: If first message fails, injects content script and retries after 100ms
5. **Content Script**: React app in `content.tsx` receives message via `useChromeMessage` hook
6. **State Update**: AppWrapper component calls `actions.togglePanel()` to update global state
7. **UI Render**: SidePanel component re-renders based on updated `isOpen` state

### Component Hierarchy

```
content.tsx (App)
├── AuthProvider (Supabase authentication context)
    └── AppProvider (Application state context)
        └── AppWrapper
            ├── FloatingButton (visible when panel closed)
            └── SidePanel (visible when panel open)
                ├── CodeEditTab (CodeMirror Editor with JavaScript/CSS + live preview)
                ├── ChatTab (placeholder for future chat functionality)
                ├── FileListTab (file management interface)
                └── UserTab (authentication and user profile)
```

### Tabbed Interface System

- **Tab Management**: Controlled by `activeTab` state in AppContext
- **Tab Components**: `CodeEditTab` and `ChatTab` with independent state
- **Tab Switching**: Icon-based tab buttons with active state styling
- **Content Rendering**: Tab content conditionally rendered with CSS transitions

### Resizable Sidebar Implementation

- **Mouse-based Resize**: Drag handle on left edge of sidebar
- **Size Constraints**: 450px-2000px width range (defined in `utils/constants.ts`)
- **Event Handling**: Mouse events managed in SidePanel with proper cleanup
- **State Persistence**: Width stored in AppContext state (resets on page reload)

### CodeMirror Integration

- **Code Editor**: Uses `@uiw/react-codemirror` with language extensions
- **Language Support**: JavaScript (`@codemirror/lang-javascript`) and CSS (`@codemirror/lang-css`) with language switcher
- **Theme Support**: One Dark theme (`@codemirror/theme-one-dark`) with additional themes from `@uiw/codemirror-themes-all`
- **Live Preview**: Real-time code execution via `src/services/codePreview.ts` with CSS scoping and multiple JS execution fallbacks

### Development Mode Configuration

The Vite config supports two distinct modes:

- **Extension Mode** (default): Builds for Chrome extension with crx plugin
- **Preview Mode** (`DEV_PREVIEW=true`): Standalone web app for UI development

### Authentication System

- **Supabase Auth**: OAuth integration with Chrome identity API
- **Session Persistence**: Uses Chrome storage API instead of localStorage for session data
- **Provider Support**: Configured for OAuth providers via background script
- **Context Integration**: `AuthContext` provides authentication state across components
- **Extension Storage**: Custom storage adapter for Supabase in `src/services/supabase.ts`

### Live Code Preview System

- **CSS Injection**: Direct style element insertion with automatic scoping to exclude extension UI
- **JS Execution**: Multi-method approach with CSP-aware fallbacks:
  1. Background script execution via `chrome.runtime.sendMessage`
  2. Blob URL method for strict CSP environments
  3. Data URL method as secondary fallback
  4. Function constructor as final fallback
- **Code Scoping**: Automatic CSS rule modification to prevent conflicts with extension UI using `:not(#site-topping-root)` selectors
- **Cleanup Management**: Automatic removal of previously applied code before new application

### Custom Hooks

- `useChromeMessage` - Handles Chrome extension message listening
- `useUrlChange` - Detects URL changes for SPA navigation
- `useAppContext` - Provides access to global state and actions
- `useAuth` - Provides authentication state and methods
- `useDebounce` - Debounces rapid state changes for performance

### Styling System

- **CSS Modules**: Scoped styling prevents conflicts with host page
- **Component-based Styling**: Individual component stylesheets for maintainability
- **Smooth Transitions**: Cubic-bezier animations for interactive elements
