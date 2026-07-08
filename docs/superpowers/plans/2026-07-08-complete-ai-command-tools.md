# Complete AI And Command Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the AI tool panel and quick command library so they are usable in the local desktop client instead of static UI placeholders.

**Architecture:** Reuse the existing React shell and native WebView bridge. Command library state is persisted through the existing C++ `get_command_library/save_command_library` actions; commands are sent to the active xterm session through `send_input_base64`. Codex CLI execution uses a new native `run_codex` action because browser JavaScript cannot spawn local processes. Hermes is configurable from the UI and uses browser `fetch` for health checks and chat requests.

**Tech Stack:** React, TypeScript, xterm.js, Vitest, Testing Library, WebView2 native bridge, C++ Win32.

---

## Chunk 1: Command Library

### Task 1: Bridge and UI tests

**Files:**
- Modify: `frontend/src/lib/bridge.ts`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`

- [x] Write failing tests for loading folder-based commands, searching, sending a command to the active session, adding a folder, and adding a command.
- [x] Run `npm test` and verify failures are caused by missing command-library UI/bridge behavior.
- [x] Implement `getCommandLibrary` and `saveCommandLibrary` bridge methods.
- [x] Replace the static command page with folder/search/create/send behavior.
- [x] Run `npm test` and verify command tests pass.

## Chunk 2: AI Execution

### Task 2: Codex CLI and Hermes

**Files:**
- Modify: `frontend/src/lib/bridge.ts`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `prismssh-cpp/main.cpp`
- Modify: `src/api.py`
- Add: `tests/test_api_ai_command_tools.py`

- [x] Write failing tests for Codex prompt execution through `run_codex`.
- [x] Write failing tests for Hermes base URL configuration and health check.
- [x] Add `runCodex` bridge method.
- [x] Add native C++ `run_codex` action using hidden process execution and captured output.
- [x] Add Python bridge `run_codex` fallback for pywebview launches.
- [x] Add AI config inputs and message execution states in React.
- [x] Run `npm test` and verify AI tests pass.

## Chunk 3: Verification

### Task 3: Build and sync

**Files:**
- Generated: `prismssh-cpp/ui/*`
- Generated: `src/ui/*`

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `.venv\Scripts\python.exe -m pytest`.
- [x] Run `git diff --check`.
- [x] Commit with `feat: complete AI and command tools`.
