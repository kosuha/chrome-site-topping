# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Site Topping" that displays a glassmorphism-styled sidebar on the right side of web pages with tabbed interface for code editing and chat functionality. The extension is built with React, TypeScript, and Vite using Chrome Extension Manifest V3.

## Architecture

- **React + TypeScript**: Modern component-based architecture with type safety
- **Vite Build System**: Fast development and optimized production builds
- **Manifest V3 Extension**: Uses service worker background script instead of persistent background page
- **Content Script Injection**: React app automatically injected into all web pages (`*://*/*`)
- **Message Passing**: Background script communicates with React content script via `chrome.tabs.sendMessage`
- **CSS Modules**: Scoped glassmorphism styling with CSS modules
- **Component Architecture**: Modular React components for maintainability

## Key Components

- `manifest.json` - Extension configuration with permissions for `activeTab` and `scripting`
- `src/background.ts` - TypeScript service worker handling extension icon clicks and script injection
- `src/content.tsx` - React app entry point with message handling and URL change detection
- `src/SidePanel.tsx` - Main React component with tabbed interface and resize functionality
- `src/SidePanel.module.css` - Glassmorphism styling with CSS modules
- `vite.config.ts` - Vite configuration with Chrome extension plugin

## Development Commands

Modern React development workflow:

```bash
npm run dev        # Start Vite dev server with hot reloading
npm run build      # Build for production
npm run preview    # Preview production build
```

For Chrome extension development:
1. Run `npm run build` to generate `dist/` folder
2. Load unpacked extension from `dist/` folder in Chrome (`chrome://extensions/`)
3. Use `npm run dev` for development with hot reloading
4. Reload extension in Chrome after significant changes

## Architecture Details

**React Component Structure:**
- `App` component manages global state (isOpen) and message handling
- `SidePanel` component handles UI rendering, tab switching, and resize logic
- Proper cleanup of event listeners and observers in useEffect
- State management through React hooks (useState, useRef)

**Tabbed Interface:**
- Two main tabs: "코드 수정" (Code Edit) and "채팅" (Chat)
- Tab switching with smooth animations and visual feedback
- Empty content areas ready for future feature implementation

**Resizable Sidebar:**
- Mouse-based drag resize on left edge (350px-800px range)
- React state management for width with proper event cleanup
- Responsive design maintains glassmorphism effects during resize

**Message Flow:**
1. User clicks extension icon → `background.ts` receives action
2. Background script attempts `chrome.tabs.sendMessage` to React content script
3. If message fails, fallback injects content script then retries message
4. React App component toggles `isOpen` state, triggering SidePanel render

**Glassmorphism Implementation:**
- CSS Modules for scoped styling and component isolation
- Multi-layer backdrop filters with varying blur intensities (10px-20px)
- Transparent backgrounds using rgba with alpha 0.08-0.29
- Inset shadows and highlights using `::before`/`::after` pseudo-elements
- Gradient text effects using background-clip: text
- Smooth cubic-bezier transitions for all interactive elements

## Development Features

**Type Safety:**
- Full TypeScript support with Chrome API types
- CSS Module type definitions
- Proper event handler typing

**Hot Reloading:**
- Vite dev server with instant updates
- Automatic extension recompilation
- React Fast Refresh for component updates

**Modern Build System:**
- Tree-shaking and code splitting
- Optimized bundle sizes for extension performance
- Source maps for debugging