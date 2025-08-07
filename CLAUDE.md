# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Site Topping" that displays a glassmorphism-styled sidebar on the right side of web pages with tabbed interface for code editing and chat functionality. The extension is built with React, TypeScript, and Vite using Chrome Extension Manifest V3.

## Architecture

- **React + TypeScript**: Modern component-based architecture with type safety
- **Vite Build System**: Fast development and optimized production builds with dual-mode configuration
- **Manifest V3 Extension**: Uses service worker background script instead of persistent background page
- **Content Script Injection**: React app automatically injected into all web pages (`*://*/*`)
- **Message Passing**: Background script communicates with React content script via `chrome.tabs.sendMessage`
- **CSS Modules**: Scoped glassmorphism styling with CSS modules
- **Component Architecture**: Modular React components with Context API for state management

## Key Components

- `manifest.json` - Extension configuration with permissions for `activeTab` and `scripting`
- `src/background.ts` - TypeScript service worker handling extension icon clicks and script injection
- `src/content.tsx` - React app entry point with message handling and URL change detection
- `src/components/AppWrapper.tsx` - Main wrapper component orchestrating FloatingButton and SidePanel
- `src/components/SidePanel.tsx` - Main React component with tabbed interface and resize functionality
- `src/contexts/AppContext.tsx` - React Context with useReducer for global state management
- `src/services/chrome.ts` - Chrome extension API abstraction with retry logic
- `vite.config.ts` - Dual-mode Vite configuration for development preview and extension builds

## Development Commands

### Standard Development Workflow

```bash
npm run dev        # Start Vite dev server for Chrome extension development
npm run build      # Build extension for production (generates dist/ folder)
npm run preview    # Preview production build
```

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
├── AppProvider (Context)
    └── AppWrapper
        ├── FloatingButton (visible when panel closed)
        └── SidePanel (visible when panel open)
            ├── CodeEditTab (Monaco Editor with JavaScript/CSS)
            └── ChatTab (placeholder for future chat functionality)
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

### Monaco Editor Integration

- **Code Editor**: Uses `@monaco-editor/react` for syntax highlighting
- **Language Support**: JavaScript and CSS with language switcher
- **Editor Configuration**: Dark theme, no minimap, word wrap enabled
- **Default Content**: Provides sample code for both JavaScript and CSS

### Development Mode Configuration

The Vite config supports two distinct modes:
- **Extension Mode** (default): Builds for Chrome extension with crx plugin
- **Preview Mode** (`DEV_PREVIEW=true`): Standalone web app for UI development

### Custom Hooks

- `useChromeMessage` - Handles Chrome extension message listening
- `useUrlChange` - Detects URL changes for SPA navigation
- `useAppContext` - Provides access to global state and actions

### Glassmorphism Styling

- **CSS Modules**: Scoped styling prevents conflicts with host page
- **Multi-layer Effects**: Backdrop filters with varying blur intensities
- **Transparency**: RGBA backgrounds with subtle opacity
- **Depth Effects**: Inset shadows and highlights using pseudo-elements
- **Smooth Transitions**: Cubic-bezier animations for interactive elements