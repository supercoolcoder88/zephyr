import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type {
  AgentApi,
  Image,
  Model,
  ModelChoice,
  SlashCommand,
} from '../../agent-types';
import Button from '../ui/Button';
import ModelPicker from './ModelPicker';
import BranchPicker from './BranchPicker';

// Cached per workspace until its skills change on disk.
const catalogs = new Map<string, ReturnType<AgentApi['catalog']>>();

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
// The API rejects images whose base64 data is over 5 MB.
const maxImageBytes = 5 * 1024 * 1024;

const tint = {
  command: 'text-command',
  file: 'text-file',
  folder: 'text-folder',
};

interface Segment {
  text: string;
  kind?: keyof typeof tint;
  // Workspace-relative or absolute path to look up.
  path?: string;
}

// Splits the prompt into plain text, a leading slash command and @ paths.
function parse(prompt: string, commands: SlashCommand[]) {
  return prompt.split(/(\s+)/).flatMap((word, i): Segment[] => {
    if (!word || /\s/.test(word)) return [{ text: word }];
    if (i === 0 && commands.some((c) => `/${c.name}` === word))
      return [{ text: word, kind: 'command' }];
    const [, before, core, after] = /^([`'"(]*)(.*?)([`'",.;:!?)]*)$/.exec(
      word,
    )!;
    const path = core.slice(1);
    if (!core.startsWith('@') || !path) return [{ text: word }];
    return [{ text: before }, { text: core, path }, { text: after }];
  });
}

interface Props {
  cwd: string;
  isolated: boolean;
  locked: boolean;
  onIsolate(isolated: boolean): void;
  // Offered once a worktree thread is idle.
  onMerge?: () => void;
  running: boolean;
  history: string[];
  prompt: string;
  onPrompt(text: string): void;
  images: Image[];
  onImages(update: (images: Image[]) => Image[]): void;
  onSend(prompt: string, images: Image[], choice: ModelChoice): void;
  onCancel(): void;
  composer: RefObject<HTMLTextAreaElement | null>;
}

export default function Composer({
  cwd,
  isolated,
  locked,
  onIsolate,
  onMerge,
  running,
  history,
  prompt,
  onPrompt,
  images,
  onImages,
  onSend,
  onCancel,
  composer,
}: Props) {
  const [tooBig, setTooBig] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [catalogStale, setCatalogStale] = useState(0);
  // Cached so the composer shows the model and effort before the catalog loads.
  const [models, setModels] = useState<Model[]>(() =>
    JSON.parse(localStorage.getItem('models') ?? '[]'),
  );
  const [choice, setChoice] = useState<ModelChoice>(() =>
    JSON.parse(localStorage.getItem('model') ?? '{"model":"opus"}'),
  );
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Steps back through sent messages; undefined while editing the draft.
  const [recall, setRecall] = useState<number>();
  const draft = useRef('');
  const [paths, setPaths] = useState<Record<string, 'file' | 'folder'>>({});
  const [caret, setCaret] = useState(0);
  const [completions, setCompletions] = useState<{
    partial: string;
    entries: string[];
  }>();
  const nextCaret = useRef<number>(undefined);
  const menu = useRef<HTMLUListElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const listId = useId();

  const segments = parse(prompt, commands).map((s) =>
    s.path ? { ...s, kind: paths[s.path] } : s,
  );
  const candidates = [
    ...new Set(segments.flatMap((s) => (s.path ? [s.path] : []))),
  ];
  const lookup = candidates.join('\0');

  const typed = /^\/(\S*)$/.exec(prompt)?.[1].toLowerCase();
  const matches =
    typed === undefined || dismissed
      ? []
      : [
          ...commands.filter((c) => c.name.toLowerCase().startsWith(typed)),
          ...commands.filter(
            (c) =>
              !c.name.toLowerCase().startsWith(typed) &&
              c.name.toLowerCase().includes(typed),
          ),
        ];
  // The @ path being typed at the caret.
  const at = dismissed
    ? undefined
    : /(?:^|\s)@(\S*)$/.exec(prompt.slice(0, caret));
  const partial = at?.[1];
  const entries =
    partial !== undefined && completions?.partial === partial
      ? completions.entries.filter((e) => e !== partial)
      : [];
  const options = matches.length || entries.length;
  const highlighted = Math.min(selected, options - 1);

  useEffect(() => {
    let catalog = catalogs.get(cwd);
    if (!catalog) {
      catalog = window.agent.catalog(cwd);
      catalogs.set(cwd, catalog);
      catalog.catch(() => catalogs.delete(cwd));
    }
    let live = true;
    catalog
      .then((c) => {
        if (!live) return;
        setCommands(c.commands);
        setModels(c.models);
        localStorage.setItem('models', JSON.stringify(c.models));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [cwd, catalogStale]);

  useEffect(
    () =>
      window.agent.onCatalogChange((dir) => {
        catalogs.delete(dir);
        if (dir === cwd) setCatalogStale((n) => n + 1);
      }),
    [cwd],
  );

  // Paths are re-checked as the prompt changes, so files the agent creates light up too.
  useEffect(() => {
    if (!lookup) return setPaths({});
    let live = true;
    const timer = setTimeout(() => {
      window.agent.paths(cwd, lookup.split('\0')).then(
        (found) => live && setPaths(found),
        () => {},
      );
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [cwd, lookup]);

  useEffect(() => {
    if (partial === undefined) return;
    let live = true;
    window.agent.complete(cwd, partial).then(
      (found) => live && setCompletions({ partial, entries: found }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [cwd, partial]);

  useLayoutEffect(() => {
    if (nextCaret.current === undefined) return;
    composer.current?.setSelectionRange(nextCaret.current, nextCaret.current);
    nextCaret.current = undefined;
  });

  useEffect(() => {
    menu.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function edit(text: string, at = text.length) {
    onPrompt(text);
    setCaret(at);
    setSelected(0);
    setDismissed(false);
    setRecall(undefined);
  }

  function send(text: string) {
    if (!text.trim() && !images.length) return;
    onSend(text, images, choice);
    edit('');
    setTooBig(false);
    setExpanded(false);
  }

  function choose(next: ModelChoice) {
    setChoice(next);
    localStorage.setItem('model', JSON.stringify(next));
  }

  // Commands that take arguments are completed; the rest run straight away.
  function pick(command: SlashCommand, run: boolean) {
    if (run && !command.argumentHint) return send(`/${command.name}`);
    edit(`/${command.name} `);
  }

  // Folders stay open for the next segment; files end the path.
  function complete(entry: string) {
    const start = caret - partial!.length;
    const insert = entry.endsWith('/') ? entry : `${entry} `;
    const rest = prompt.slice(caret);
    nextCaret.current = start + insert.length;
    edit(
      prompt.slice(0, start) +
        insert +
        (insert.endsWith(' ') ? rest.replace(/^ /, '') : rest),
      nextCaret.current,
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(prompt);
      }}
      data-expanded={expanded || undefined}
      className="group relative flex shrink-0 flex-col gap-2 border-t border-line bg-panel p-3 data-expanded:h-3/4"
    >
      {options > 0 && (
        <ul
          ref={menu}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 bottom-full max-h-64 overflow-y-auto border-t border-line bg-panel py-1"
        >
          {matches.length
            ? matches.map((c, i) => (
                <li
                  key={c.name}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => pick(c, true)}
                  className="flex cursor-pointer gap-3 px-3 py-1 text-sm aria-selected:bg-paper aria-selected:text-void"
                >
                  <span className="shrink-0">
                    /{c.name}
                    {c.argumentHint && (
                      <span className="text-mute"> {c.argumentHint}</span>
                    )}
                  </span>
                  <span className="min-w-0 truncate text-mute">
                    {c.description}
                  </span>
                </li>
              ))
            : entries.map((entry, i) => (
                <li
                  key={entry}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => complete(entry)}
                  className={`cursor-pointer truncate px-3 py-1 text-sm aria-selected:bg-paper aria-selected:text-void ${
                    entry.endsWith('/') ? 'text-folder' : 'text-file'
                  }`}
                >
                  @{entry}
                </li>
              ))}
        </ul>
      )}
      {tooBig && (
        <p className="text-2xs tracking-widest text-alert">
          IMAGE OVER 5 MB · NOT ATTACHED
        </p>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative border border-line">
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt=""
                className="h-16 max-w-32 object-cover"
              />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() =>
                  onImages((prev) => prev.filter((_, j) => j !== i))
                }
                className="absolute top-0 right-0 bg-paper px-1 text-2xs text-void transition-colors duration-150 ease-mech hover:bg-ink"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col border border-line bg-void focus-within:border-line-strong">
        <div className="relative min-h-0 flex-1">
          <div
            ref={mirror}
            aria-hidden
            className="absolute inset-0 overflow-hidden px-3 py-2.25 text-sm break-words whitespace-pre-wrap [scrollbar-gutter:stable]"
          >
            {segments.map((s, i) =>
              s.kind ? (
                <span key={i} className={tint[s.kind]}>
                  {s.text}
                </span>
              ) : (
                s.text
              ),
            )}
            {'\n'}
          </div>
          <textarea
            ref={composer}
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={options > 0}
            aria-controls={options > 0 ? listId : undefined}
            aria-activedescendant={
              options > 0 ? `${listId}-${highlighted}` : undefined
            }
            value={prompt}
            onChange={(e) => edit(e.target.value, e.target.selectionStart)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onScroll={(e) => {
              if (mirror.current)
                mirror.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) =>
                imageTypes.includes(f.type),
              );
              if (!files.length) return;
              e.preventDefault();
              const fits = files.filter(
                (f) => Math.ceil(f.size / 3) * 4 <= maxImageBytes,
              );
              setTooBig(fits.length < files.length);
              for (const file of fits) {
                const reader = new FileReader();
                reader.onload = () =>
                  onImages((prev) => [
                    ...prev,
                    {
                      mediaType: file.type as Image['mediaType'],
                      data: (reader.result as string).split(',')[1],
                    },
                  ]);
                reader.readAsDataURL(file);
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (options > 0) {
                const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
                if (step) {
                  e.preventDefault();
                  return setSelected((highlighted + step + options) % options);
                }
                if (e.key === 'Escape') return setDismissed(true);
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  return matches.length
                    ? pick(matches[highlighted], e.key === 'Enter')
                    : complete(entries[highlighted]);
                }
              }
              const box = e.currentTarget;
              const step =
                e.key === 'ArrowUp' &&
                !prompt.slice(0, box.selectionStart).includes('\n')
                  ? 1
                  : e.key === 'ArrowDown' &&
                      recall !== undefined &&
                      !prompt.slice(box.selectionEnd).includes('\n')
                    ? -1
                    : 0;
              if (step) {
                const next = (recall ?? -1) + step;
                if (next >= history.length) return;
                e.preventDefault();
                if (recall === undefined) draft.current = prompt;
                const text =
                  next < 0 ? draft.current : history[history.length - 1 - next];
                nextCaret.current = text.length;
                edit(text);
                setRecall(next < 0 ? undefined : next);
                setDismissed(true);
                return;
              }
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              send(prompt);
            }}
            placeholder="Ask the agent…"
            className="relative block max-h-[45vh] min-h-24 w-full resize-none bg-transparent px-3 py-2.25 text-sm text-transparent caret-ink [scrollbar-gutter:stable] outline-none field-sizing-content placeholder:text-mute group-data-expanded:h-full group-data-expanded:max-h-none group-data-expanded:field-sizing-fixed"
          />
        </div>
        <div className="flex items-center gap-1 p-1 whitespace-nowrap">
          <Button
            size="sm"
            aria-label="Expand composer"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(!expanded);
              composer.current?.focus();
            }}
            className="px-2"
          >
            {expanded ? (
              <Minimize2
                size={14}
                strokeWidth={1.5}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            ) : (
              <Maximize2
                size={14}
                strokeWidth={1.5}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            )}
          </Button>
          <div className="ml-auto flex min-w-0 items-center">
            <BranchPicker
              cwd={cwd}
              isolated={isolated}
              locked={locked}
              onIsolate={onIsolate}
              onMerge={onMerge}
            />
            <ModelPicker models={models} choice={choice} onChoose={choose} />
          </div>
          {running && (
            <Button variant="outline-destructive" size="md" onClick={onCancel}>
              [ STOP ]
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!prompt.trim() && !images.length}
            className="chamfer shrink-0 font-medium"
          >
            [ SEND ]
          </Button>
        </div>
      </div>
    </form>
  );
}
