// Shared between main, preload and renderer. Keep it free of runtime imports.
export type Output =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown };

// Subthread events are keyed by the tool_use id of the call that spawned the subagent.
export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | Output
  | { type: 'done'; ok: boolean; result: string }
  | { type: 'error'; message: string }
  | { type: 'state'; state: 'running' | 'idle' | 'requires_action' }
  // The CLI started on these sent messages; ids are the uuids passed to send.
  | { type: 'picked'; ids: string[] }
  // The session's process is gone; the next send starts a new one.
  | { type: 'end' }
  | { type: 'subthread'; id: string; title: string }
  | { type: 'subthread-output'; id: string; output: Output }
  | { type: 'subthread-end'; id: string; ok: boolean }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'permission-end'; id: string }
  // The user's answers to the AskUserQuestion call with this tool_use id.
  | { type: 'answers'; id: string; answers: Record<string, string> }
  // Percent of the context window in use after the last turn.
  | { type: 'context'; percentage: number };

// Claude Code permission modes the user can switch between.
export type Permission =
  | 'auto'
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions';

export interface PermissionRequest {
  id: string;
  tool: string;
  input: unknown;
  title?: string;
  toolUseId: string;
}

export interface Image {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  // Base64 without the data URL prefix.
  data: string;
}

export type ThreadItem =
  | Exclude<
      AgentEvent,
      {
        type:
          | 'session'
          | 'state'
          | 'picked'
          | 'end'
          | 'context'
          | 'answers'
          | `subthread${string}`
          | `permission${string}`;
      }
    >
  | { type: 'user'; text: string; images?: Image[] };

export interface Subthread {
  id: string;
  title: string;
  items: Output[];
  // 'read' marks a subagent that never reported ending, e.g. after a cancel.
  state: 'running' | 'done' | 'error' | 'read';
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface UsageWindow {
  label: string;
  // Percent used, 0-100.
  utilization: number;
  resetsAt: string | null;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Model {
  value: string;
  displayName: string;
  efforts: Effort[];
  // What Claude Code uses when no effort is sent.
  defaultEffort?: Effort;
}

// No effort means Claude Code's default for the model.
export interface ModelChoice {
  model: string;
  effort?: Effort;
}

export interface AgentApi {
  // Starts the run's session or queues into the live one; resolves once queued.
  send(
    runId: string,
    prompt: string,
    images: Image[],
    cwd: string,
    resume: string | undefined,
    choice: ModelChoice,
    permission: Permission,
    uuid: string,
  ): Promise<void>;
  setPermission(runId: string, permission: Permission): Promise<void>;
  // Answers, keyed by question text, allow an AskUserQuestion call with the user's choices.
  answerPermission(
    runId: string,
    id: string,
    allow: boolean,
    answers?: Record<string, string>,
  ): Promise<void>;
  pickWorkspace(): Promise<string | undefined>;
  // Which of the paths, relative to cwd, exist.
  paths(
    cwd: string,
    candidates: string[],
  ): Promise<Record<string, 'file' | 'folder'>>;
  catalog(cwd: string): Promise<{ commands: SlashCommand[]; models: Model[] }>;
  // Fires with the workspace whose skills or commands changed on disk.
  onCatalogChange(listener: (cwd: string) => void): () => void;
  // Entries of the folder in partial (relative to cwd) whose names start with its last segment; folders end in '/'.
  complete(cwd: string, partial: string): Promise<string[]>;
  // Stops the running turn and cancels every queued message.
  interrupt(runId: string): Promise<void>;
  close(runId: string): Promise<void>;
  // Null when plan rate limits don't apply, e.g. API key auth.
  usage(): Promise<UsageWindow[] | null>;
  onEvent(listener: (runId: string, event: AgentEvent) => void): () => void;
  listThreads(cwd: string): Promise<
    {
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      worktree?: string;
      branch?: string;
    }[]
  >;
  loadThread(sessionId: string, cwd: string): Promise<ThreadItem[]>;
  // Also removes the thread's worktree when Zephyr created it.
  deleteThread(
    sessionId: string,
    cwd: string,
    worktree?: string,
  ): Promise<void>;
  // Null outside a git repo.
  branch(cwd: string): Promise<string | null>;
  // A new worktree and branch for one thread, off the workspace's current HEAD,
  // set up with the given command or the one detected from its lockfile.
  createWorktree(
    cwd: string,
    name: string,
    setup?: string,
  ): Promise<{
    path: string;
    branch: string;
    setup?: { command: string; ok: boolean; output: string };
  }>;
  // The setup command detected from the workspace's lockfile.
  setupCommand(cwd: string): Promise<string | null>;
  // Squash merges the worktree into the workspace's branch, then removes the worktree and its branch.
  mergeWorktree(cwd: string, worktree: string, message: string): Promise<void>;
}

// A `- [ ]` line of the project's .zephyr/backlog.md; line is its 0-based index there.
export interface BacklogEntry {
  line: number;
  text: string;
  done: boolean;
}

export type BacklogEdit =
  | { type: 'add'; text: string }
  | { type: 'toggle' | 'remove'; entry: BacklogEntry }
  | { type: 'rename'; entry: BacklogEntry; text: string }
  // Moves the entry and its nested lines to just before `before`, or after the last entry.
  | { type: 'move'; entry: BacklogEntry; before?: BacklogEntry };

export interface BacklogApi {
  // Starts watching cwd's entry file, replacing the previous watch, and resolves its entries.
  watch(cwd: string): Promise<BacklogEntry[]>;
  edit(cwd: string, edit: BacklogEdit): Promise<BacklogEntry[]>;
  onChange(
    listener: (cwd: string, entries: BacklogEntry[]) => void,
  ): () => void;
}

export interface UpdateStatus {
  // Subjects of the commits this build is missing, empty when up to date.
  commits: string[];
  // Set when the last update failed to install.
  error?: string;
}

export interface UpdateApi {
  check(): Promise<UpdateStatus>;
  // Quits, installs the update and relaunches into workspace; resolves to an error if the pull fails.
  install(workspace: string): Promise<string | undefined>;
}

export interface TerminalApi {
  // Starts the workspace shell if needed and resolves to its recent output.
  open(cwd: string, cols: number, rows: number): Promise<string>;
  write(cwd: string, data: string): void;
  resize(cwd: string, cols: number, rows: number): void;
  close(cwd: string): void;
  onData(listener: (cwd: string, data: string) => void): () => void;
  onExit(listener: (cwd: string) => void): () => void;
}
