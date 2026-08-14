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
  deleteSavedConnection(key: string) {
    return callNative<{ success: boolean; error?: string }>("delete_saved_connection", { success: false }, key);
  },
  getCommandLibrary() {
    return callNative<CommandLibraryResult>("get_command_library", { success: false, folders: [] });
  },
  saveCommandLibrary(folders: CommandFolder[]) {
    return callNative<{ success: boolean; error?: string }>("save_command_library", { success: false }, JSON.stringify(folders));
  },
  listDirectory(sessionId: string, path: string) {
    return callNative<DirectoryListResult>("list_directory", { success: false, files: [] }, sessionId, path);
  },
  downloadFile(sessionId: string, remotePath: string, localPath: string) {
    return callNative<{ success: boolean; error?: string }>(
      "download_file_to_path",
      { success: false, error: "Download bridge unavailable" },
      sessionId,
      remotePath,
      localPath
    );
  },
  uploadFile(sessionId: string, localPath: string, remotePath: string) {
    return callNative<{ success: boolean; error?: string }>(
      "upload_file",
      { success: false, error: "Upload bridge unavailable" },
      sessionId,
      localPath,
      remotePath
    );
  },
  uploadFileContent(sessionId: string, content: string, remotePath: string) {
    return callNative<{ success: boolean; error?: string }>(
      "upload_file_content",
      { success: false, error: "Upload content bridge unavailable" },
      sessionId,
      content,
      remotePath
    );
  },
  readFileContent(sessionId: string, remotePath: string) {
    return callNative<{ success: boolean; content?: string; error?: string }>(
      "download_file_content",
      { success: false, error: "Download file content bridge unavailable" },
      sessionId,
      remotePath
    );
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
  showOpenFileDialog(title = "") {
    return callNative<{ filePath?: string }>("show_open_file_dialog", {}, title);
  },
  showOpenFolderDialog(title = "") {
    return callNative<{ folderPath?: string }>("show_open_folder_dialog", {}, title);
  },
  launchScrcpy(scrcpyDir: string, serial: string, extraArgs = "") {
    return callNative<{ success: boolean; command?: string; error?: string }>(
      "launch_scrcpy",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial,
      extraArgs
    );
  },
  getAdbDevices(scrcpyDir = "") {
    return callNative<{
      success: boolean;
      devices: Array<{
        serial: string;
        state: string;
        model?: string;
        product?: string;
        device?: string;
        transport_id?: string;
      }>;
      rawOutput?: string;
      error?: string;
    }>("get_adb_devices", { success: false, devices: [] }, scrcpyDir);
  },
  adbConnect(scrcpyDir: string, target: string) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_connect",
      { success: false },
      scrcpyDir,
      target
    );
  },
  installApk(scrcpyDir: string, serial: string, apkPath: string) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_install_apk",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial,
      apkPath
    );
  },
  screencapAdb(scrcpyDir: string, serial: string) {
    return callNative<{ success: boolean; filePath?: string; base64?: string; error?: string }>(
      "adb_screencap",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial
    );
  },
  rebootAdb(scrcpyDir: string, serial: string) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_reboot",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial
    );
  },
  adbTcpip(scrcpyDir: string, serial: string, port = 5555) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_tcpip",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial,
      port
    );
  },
  adbPair(scrcpyDir: string, ipPort: string, pairCode: string) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_pair",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      ipPort,
      pairCode
    );
  },
  adbKeyevent(scrcpyDir: string, serial: string, keyCode: string) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "adb_keyevent",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      serial,
      keyCode
    );
  },
  runAdbCommand(scrcpyDir: string, args: string[]) {
    return callNative<{ success: boolean; output?: string; error?: string }>(
      "run_adb_command",
      { success: false, error: "Native bridge unavailable" },
      scrcpyDir,
      args
    );
  },
  showSaveFileDialog(defaultName: string) {
    return callNative<{ filePath?: string }>("show_save_file_dialog", {}, defaultName);
  },
  readBase64File(filePath: string) {
    return callNative<{ content?: string; error?: string }>("read_base64_file", {}, filePath);
  },
  writeBase64File(filePath: string, content: string) {
    return callNative<{ success: boolean; error?: string }>("write_base64_file", { success: false }, filePath, content);
  },
  saveAiAttachment(name: string, content: string) {
    return callNative<{ success: boolean; filePath?: string; error?: string }>(
      "save_ai_attachment",
      { success: false },
      name,
      content
    );
  },
  isAdmin() {
    return callNative<{ success: boolean; isAdmin?: boolean }>("is_admin", { success: false, isAdmin: false });
  },
  getWebFavorites() {
    return callNative<WebFavorite[]>("get_web_favorites", []);
  },
  addWebFavorite(title: string, url: string) {
    return callNative<{ success: boolean; favorite?: WebFavorite; error?: string }>(
      "add_web_favorite",
      { success: false },
      title,
      url
    );
  },
  deleteWebFavorite(id: string) {
    return callNative<{ success: boolean; error?: string }>("delete_web_favorite", { success: false }, id);
  },
  openInExternalBrowser(url: string) {
    return callNative<{ success: boolean; error?: string }>("open_in_external_browser", { success: false }, url);
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
  clipboardCopy(text: string) {
    return callNative<{ success: boolean }>("clipboard_copy", { success: false }, text);
  },
  clipboardPaste() {
    return callNative<{ success: boolean; text?: string }>("clipboard_paste", { success: false, text: "" });
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
  folder?: string;
  tags?: string[];
  keyPath?: string;
  environment?: "prod" | "staging" | "local";
  useJumpHost?: boolean;
  jumpHost?: string;
  jumpPort?: number;
  jumpUser?: string;
  jumpPass?: string;
  jumpKey?: string;
  jumpKeyPassphrase?: string;
  jumpSavedConnectionId?: string;
}

export interface SshKeyPair {
  id: string;
  name: string;
  type: "ed25519" | "rsa";
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  createdAt: string;
}

export interface TransferTask {
  id: string;
  name: string;
  type: "upload" | "download";
  localPath: string;
  remotePath: string;
  size: number;
  progress: number;
  status: "queued" | "transferring" | "completed" | "error";
  speed?: string;
  error?: string;
}

export interface FilePermissions {
  owner: { read: boolean; write: boolean; execute: boolean };
  group: { read: boolean; write: boolean; execute: boolean };
  others: { read: boolean; write: boolean; execute: boolean };
  octal: string;
  ownerName?: string;
  groupName?: string;
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

export interface DirectoryEntry {
  name: string;
  type?: "directory" | "file" | string;
  size?: string | number;
  raw_size?: number;
  date?: string;
  mtime?: number;
  permissions?: string | number;
}

export interface DirectoryListResult {
  success: boolean;
  files: DirectoryEntry[];
  error?: string;
}

export interface WebFavorite {
  id: string;
  title: string;
  url: string;
}

export interface CodexRunParams {
  command: string;
  workingDirectory: string;
  prompt: string;
  model?: string;
  noiseMode?: string;
  continueSession?: boolean;
  codexSessionId?: string;
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
  cookie?: string;
  token?: string;
}

export interface HermesHttpRequestResult {
  success: boolean;
  status?: number;
  contentType?: string;
  body?: string;
  cookie?: string;
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
  folder?: string;
  tags?: string[];
  preservePassword?: boolean;
  environment?: "prod" | "staging" | "local";
  useJumpHost?: boolean;
  jumpHost?: string;
  jumpPort?: number;
  jumpUser?: string;
  jumpPass?: string;
  jumpKey?: string;
  jumpKeyPassphrase?: string;
}

export interface NativeResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}
