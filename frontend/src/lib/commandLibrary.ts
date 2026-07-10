import type { CommandFolder, CommandItem } from "./bridge";

export interface CommandLibraryImportResult {
  source: string;
  folders: CommandFolder[];
  imported: number;
}

const DEFAULT_IMPORT_FOLDER = "导入命令";
const COMMAND_KEYS = ["command", "cmd", "commandText", "script", "shell", "content"];
const NAME_KEYS = ["name", "title", "label"];
const DESCRIPTION_KEYS = ["description", "desc", "remark", "memo"];

export function serializeCommandLibraryExport(folders: CommandFolder[]) {
  return JSON.stringify(
    {
      app: "LdSSH",
      version: 1,
      exportedAt: new Date().toISOString(),
      folders: normalizeCommandFolders(folders)
    },
    null,
    2
  );
}

export function parseCommandLibraryImport(text: string, source = "本地文件"): CommandLibraryImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { source, folders: [], imported: 0 };
  }

  const folders = trimmed.startsWith("<")
    ? parseXmlCommands(trimmed, source)
    : parseJsonCommands(trimmed, source) || parseTextCommands(trimmed, source);

  const normalized = normalizeCommandFolders(folders);
  return {
    source,
    folders: normalized,
    imported: normalized.reduce((sum, folder) => sum + folder.commands.length, 0)
  };
}

export function mergeCommandFolders(current: CommandFolder[], incoming: CommandFolder[]) {
  const next = normalizeCommandFolders(current).map((folder) => ({
    ...folder,
    commands: [...folder.commands]
  }));

  for (const folder of normalizeCommandFolders(incoming)) {
    let target = next.find((item) => item.name === folder.name);
    if (!target) {
      target = {
        id: uniqueFolderId(next, folder.id || makeStableId("folder", folder.name)),
        name: folder.name,
        commands: []
      };
      next.push(target);
    }

    const existing = new Set(target.commands.map(commandKey));
    for (const command of folder.commands) {
      const key = commandKey(command);
      if (existing.has(key)) continue;
      target.commands.push({
        ...command,
        id: uniqueCommandId(target.commands, command.id || makeStableId("cmd", `${folder.name}:${command.name}:${command.command}`))
      });
      existing.add(key);
    }
  }

  return next;
}

export function normalizeCommandFolders(folders: CommandFolder[]) {
  return folders
    .map((folder, index) => ({
      id: String(folder.id || makeStableId("folder", `${folder.name || DEFAULT_IMPORT_FOLDER}:${index}`)),
      name: String(folder.name || DEFAULT_IMPORT_FOLDER).trim() || DEFAULT_IMPORT_FOLDER,
      commands: normalizeCommands(folder.commands || [], folder.name || DEFAULT_IMPORT_FOLDER)
    }))
    .filter((folder) => folder.commands.length > 0);
}

function parseJsonCommands(text: string, source: string) {
  try {
    const data = JSON.parse(text);
    const folders = Array.isArray(data) ? data : Array.isArray(data?.folders) ? data.folders : null;
    if (folders) {
      return normalizeCommandFolders(folders as CommandFolder[]);
    }

    const collected = new Map<string, CommandItem[]>();
    collectJsonCommands(data, [], collected);
    return foldersFromMap(collected, source || DEFAULT_IMPORT_FOLDER);
  } catch {
    return null;
  }
}

function collectJsonCommands(value: unknown, path: string[], collected: Map<string, CommandItem[]>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonCommands(item, path, collected));
    return;
  }
  if (!isRecord(value)) return;

  const name = firstString(value, NAME_KEYS);
  const nextPath = name ? [...path, name] : path;
  const command = firstString(value, COMMAND_KEYS);
  if (command) {
    addCollectedCommand(collected, path.at(-1) || name || DEFAULT_IMPORT_FOLDER, {
      id: makeStableId("cmd", `${name || command}:${command}`),
      name: name || commandName(command),
      command,
      description: firstString(value, DESCRIPTION_KEYS)
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (COMMAND_KEYS.includes(key) || DESCRIPTION_KEYS.includes(key)) continue;
    collectJsonCommands(child, shouldTreatAsCommandGroup(key, child) ? nextPath : path, collected);
  }
}

function parseXmlCommands(text: string, source: string) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) {
    return [];
  }

  const collected = new Map<string, CommandItem[]>();
  const nodes = Array.from(doc.querySelectorAll("command, cmd, item"));
  for (const node of nodes) {
    const command =
      node.getAttribute("command") ||
      node.getAttribute("cmd") ||
      childText(node, "command") ||
      childText(node, "cmd") ||
      node.textContent ||
      "";
    const trimmed = command.trim();
    if (!trimmed) continue;
    const folder = node.parentElement?.getAttribute("name") || node.parentElement?.getAttribute("title") || source || DEFAULT_IMPORT_FOLDER;
    addCollectedCommand(collected, folder, {
      id: makeStableId("cmd", `${folder}:${trimmed}`),
      name: node.getAttribute("name") || node.getAttribute("title") || childText(node, "name") || commandName(trimmed),
      command: trimmed,
      description: node.getAttribute("desc") || childText(node, "description") || childText(node, "desc") || undefined
    });
  }
  return foldersFromMap(collected, source || DEFAULT_IMPORT_FOLDER);
}

function parseTextCommands(text: string, source: string) {
  const commands = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => {
      const named = /^(.{1,80}?)(?:\t|=|:)\s*(.+)$/.exec(line);
      const name = named?.[1]?.trim();
      const command = named?.[2]?.trim() || line;
      return {
        id: makeStableId("cmd", `${name || command}:${command}`),
        name: name || commandName(command),
        command
      };
    });

  return commands.length
    ? [
        {
          id: makeStableId("folder", source || DEFAULT_IMPORT_FOLDER),
          name: source || DEFAULT_IMPORT_FOLDER,
          commands
        }
      ]
    : [];
}

function normalizeCommands(commands: CommandItem[], folderName: string) {
  return commands
    .map((command, index) => ({
      id: String(command.id || makeStableId("cmd", `${folderName}:${command.name}:${command.command}:${index}`)),
      name: String(command.name || commandName(command.command || "")).trim(),
      command: String(command.command || "").trim(),
      description: command.description ? String(command.description).trim() : undefined
    }))
    .filter((command) => command.name && command.command);
}

function foldersFromMap(collected: Map<string, CommandItem[]>, fallbackName: string) {
  return Array.from(collected.entries()).map(([name, commands]) => ({
    id: makeStableId("folder", name || fallbackName),
    name: name || fallbackName,
    commands
  }));
}

function addCollectedCommand(collected: Map<string, CommandItem[]>, folderName: string, command: CommandItem) {
  const name = folderName.trim() || DEFAULT_IMPORT_FOLDER;
  const list = collected.get(name) || [];
  list.push(command);
  collected.set(name, list);
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function childText(node: Element, selector: string) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

function shouldTreatAsCommandGroup(key: string, child: unknown) {
  if (!Array.isArray(child)) return false;
  return ["children", "childs", "items", "commands", "cmds", "groups", "folders"].includes(key);
}

function commandName(command: string) {
  return command.trim().replace(/\s+/g, " ").slice(0, 48) || "未命名命令";
}

function commandKey(command: CommandItem) {
  return `${command.name.trim().toLowerCase()}\n${command.command.trim()}`;
}

function uniqueFolderId(folders: CommandFolder[], id: string) {
  const existing = new Set(folders.map((folder) => folder.id));
  return uniqueId(existing, id, "folder");
}

function uniqueCommandId(commands: CommandItem[], id: string) {
  const existing = new Set(commands.map((command) => command.id));
  return uniqueId(existing, id, "cmd");
}

function uniqueId(existing: Set<string>, id: string, prefix: string) {
  let next = id || `${prefix}_${Date.now()}`;
  let index = 2;
  while (existing.has(next)) {
    next = `${id}_${index}`;
    index += 1;
  }
  return next;
}

function makeStableId(prefix: string, value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
