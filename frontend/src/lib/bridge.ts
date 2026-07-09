import { parseMaybeJson } from "./utils";

type NativeApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

declare global {
  interface Window {
    pywebview?: { api?: NativeApi };
    chrome?: {
      webview?: {
        postMessage: (message: string) => void;
        addEventListener?: (type: "message", handler: (event: MessageEvent) => void) => void;
      };
    };
    windowMinimize?: () => void;
    windowMaximize?: () => void;
    windowClose?: () => void;
    handlePushOutput?: (sessionId: string, data: string) => void;
  }
}

async function callNativeRaw(action: string, ...args: unknown[]) {
  if (window.pywebview?.api?.[action]) {
    return window.pywebview.api[action](...args);
  }

  if (window.chrome?.webview?.postMessage) {
    const id = `react_${Math.random().toString(36).slice(2)}`;
    window.chrome.webview.postMessage(JSON.stringify({ id, action, args }));
  }

  return null;
}

export async function callNative<T>(action: string, fallback: T, ...args: unknown[]): Promise<T> {
  const result = await callNativeRaw(action, ...args);
  return parseMaybeJson<T>(result, fallback);
}

export async function callNativeText(action: string, ...args: unknown[]): Promise<string> {
  const result = await callNativeRaw(action, ...args);
  return typeof result === "string" ? result : "";
}

export const nativeBridge = {
  minimize() {
    window.windowMinimize?.();
  },
  maximize() {
    window.windowMaximize?.();
  },
  close() {
    window.windowClose?.();
  },
  drag() {
    void callNative("window_drag", null);
  },
  createSession() {
    return callNativeText("create_session");
  },
  createLocalSession() {
    return callNativeText("create_local_session");
  },
  getSavedConnections() {
    return callNative<Record<string, SavedConnection>>("get_saved_connections", {});
  },
  getCommandLibrary() {
    return callNative<CommandLibraryResult>("get_command_library", { success: false, folders: [] });
  },
  saveCommandLibrary(folders: CommandFolder[]) {
    return callNative<{ success: boolean; error?: string }>("save_command_library", { success: false }, JSON.stringify(folders));
  },
  connect(sessionId: string, params: ConnectParams) {
    return callNative<{ success: boolean; error?: string }>("connect", { success: false }, sessionId, JSON.stringify(params));
  },
  disconnect(sessionId: string) {
    return callNative<{ success: boolean; error?: string }>("disconnect", { success: false }, sessionId);
  },
  saveSavedConnection(key: string, params: ConnectParams) {
    return callNative<{ success: boolean; key?: string; error?: string }>(
      "save_saved_connection",
      { success: false },
      key,
      JSON.stringify(params)
    );
  },
  runCodex(params: CodexRunParams) {
    return callNative<CodexRunResult>("run_codex", { success: false, error: "Codex native bridge unavailable" }, JSON.stringify(params));
  },
  startCodexRun(params: CodexRunParams) {
    return callNative<CodexStartResult>("start_codex_run", { success: false, error: "Codex native bridge unavailable" }, JSON.stringify(params));
  },
  getCodexRun(jobId: string) {
    return callNative<CodexJobResult>("get_codex_run", { success: false, error: "Codex job unavailable" }, jobId);
  },
  hermesHttpRequest(params: HermesHttpRequestParams) {
    return callNative<HermesHttpRequestResult>(
      "hermes_http_request",
      { success: false, error: "Hermes native bridge unavailable" },
      JSON.stringify(params)
    );
  },
  sendInput(sessionId: string, data: string) {
    return callNative<{ success: boolean }>("send_input", { success: false }, sessionId, data);
  },
  sendInputBase64(sessionId: string, data: string) {
    return callNative<{ success: boolean }>("send_input_base64", { success: false }, sessionId, data);
  },
  getOutput(sessionId: string) {
    return callNative<{ output?: string }>("get_output", {}, sessionId);
  },
  resizeTerminal(sessionId: string, cols: number, rows: number) {
    return callNative<{ success: boolean }>("resize_terminal", { success: false }, sessionId, cols, rows);
  },
  getSystemInfo(sessionId: string) {
    return callNative<NativeResult>("get_system_info", { success: false, error: "Session not found" }, sessionId);
  },
  getSystemStats(sessionId: string) {
    return callNative<NativeResult>("get_system_stats", { success: false, error: "Session not found" }, sessionId);
  },
  getProcessList(sessionId: string) {
    return callNative<NativeResult>("get_process_list", { success: false, error: "Session not found" }, sessionId);
  },
  getDiskUsage(sessionId: string) {
    return callNative<NativeResult>("get_disk_usage", { success: false, error: "Session not found" }, sessionId);
  },
  getNetworkInfo(sessionId: string) {
    return callNative<NativeResult>("get_network_info", { success: false, error: "Session not found" }, sessionId);
  }
};

export interface SavedConnection {
  key?: string;
  name?: string;
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
  password_unavailable?: boolean;
  group?: string;
  keyPath?: string;
}

export interface CommandItem {
  id: string;
  name: string;
  command: string;
  description?: string;
}

export interface CommandFolder {
  id: string;
  name: string;
  commands: CommandItem[];
}

export interface CommandLibraryResult {
  success: boolean;
  folders: CommandFolder[];
  error?: string;
}

export interface CodexRunParams {
  command: string;
  workingDirectory: string;
  prompt: string;
}

export interface CodexRunResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  timedOut?: boolean;
  commandPreview?: string;
}

export interface CodexStartResult {
  success: boolean;
  jobId?: string;
  commandPreview?: string;
  error?: string;
}

export interface CodexJobResult extends CodexRunResult {
  running?: boolean;
  completed?: boolean;
}

export interface HermesHttpRequestParams {
  method: "GET" | "POST";
  url: string;
  body?: string;
  token?: string;
}

export interface HermesHttpRequestResult {
  success: boolean;
  status?: number;
  contentType?: string;
  body?: string;
  error?: string;
}

export interface ConnectParams {
  name?: string;
  hostname: string;
  port: number;
  username: string;
  password?: string;
  keyPath?: string;
  save?: boolean;
  group?: string;
  preservePassword?: boolean;
}

export interface NativeResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}
