import type { CommandFolder } from "./bridge";

export type CommandSuggestionSource = "history" | "shortcut" | "linux";

export interface CommandSuggestion {
  id: string;
  command: string;
  label: string;
  description?: string;
  source: CommandSuggestionSource;
}

const MAX_HISTORY_ITEMS = 80;
const MAX_SUGGESTIONS = 6;
const FULL_SCREEN_COMMANDS = new Set(["vi", "vim", "nvim", "nano", "less", "more", "man", "top", "htop", "watch", "tmux", "screen"]);

const LINUX_COMMANDS: Array<Omit<CommandSuggestion, "id" | "source">> = [
  { label: "ls", command: "ls -la", description: "list files" },
  { label: "cd", command: "cd " },
  { label: "cat", command: "cat " },
  { label: "grep", command: "grep -R " },
  { label: "find", command: "find . -name " },
  { label: "systemctl status", command: "systemctl status " },
  { label: "journalctl", command: "journalctl -u " },
  { label: "docker ps", command: "docker ps" },
  { label: "podman ps", command: "podman ps" },
  { label: "ps", command: "ps aux" },
  { label: "top", command: "top" },
  { label: "free", command: "free -m" },
  { label: "df", command: "df -h" },
  { label: "du", command: "du -sh *" },
  { label: "tar", command: "tar -czf archive.tar.gz " },
  { label: "curl", command: "curl -I " },
  { label: "wget", command: "wget " },
  { label: "ssh", command: "ssh user@host" },
  { label: "scp", command: "scp " },
  { label: "iptables", command: "iptables -L -n" }
];

export function recordCommandHistory(history: string[], command: string) {
  const trimmed = command.trim();
  if (!trimmed) return history;

  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY_ITEMS);
}

export function buildCommandSuggestions(prefix: string, history: string[], folders: CommandFolder[], limit = MAX_SUGGESTIONS): CommandSuggestion[] {
  const query = normalizeCommand(prefix);
  if (!query) return [];

  const suggestions: CommandSuggestion[] = [];
  const seen = new Set<string>();
  const add = (suggestion: CommandSuggestion) => {
    const key = normalizeCommand(suggestion.command);
    if (!key || seen.has(key) || key === query || !key.startsWith(query)) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  history.forEach((command, index) => {
    add({
      id: `history-${index}-${command}`,
      label: command,
      command,
      source: "history"
    });
  });

  folders.forEach((folder) => {
    folder.commands.forEach((command) => {
      add({
        id: `shortcut-${folder.id}-${command.id}`,
        label: command.name,
        command: command.command,
        description: command.description,
        source: "shortcut"
      });
    });
  });

  LINUX_COMMANDS.forEach((command, index) => {
    add({
      id: `linux-${index}`,
      ...command,
      source: "linux"
    });
  });

  return suggestions.slice(0, limit);
}

export function isFullScreenCommand(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const firstCommand = tokens[0] === "sudo" ? tokens[1] : tokens[0];
  if (!firstCommand) return false;
  const executable = firstCommand.split(/[\\/]/).at(-1) || firstCommand;
  return FULL_SCREEN_COMMANDS.has(executable);
}

function normalizeCommand(command: string) {
  return command.trimStart().replace(/\s+/g, " ").toLowerCase();
}
