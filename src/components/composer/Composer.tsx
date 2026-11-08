import { useEffect, useRef, useState, type Ref } from 'react';
import type {
  AgentApi,
  Image,
  Model,
  ModelChoice,
  SlashCommand,
} from '../../agent-types';
import ModelPicker from './ModelPicker';

// Listing commands and models spawns a CLI, so do it once per workspace.
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

// Splits the prompt into plain text, a leading slash command and words that look like paths.
function parse(prompt: string, commands: SlashCommand[]) {
  return prompt.split(/(\s+)/).flatMap((word, i): Segment[] => {
    if (!word || /\s/.test(word)) return [{ text: word }];
    if (i === 0 && commands.some((c) => `/${c.name}` === word))
      return [{ text: word, kind: 'command' }];
    const [, before, core, after] = /^([`'"(]*)(.*?)([`'",.;:!?)]*)$/.exec(
      word,
    )!;
    const path = core.replace(/^@/, '');
    const looksLikePath =
      core.startsWith('@') || /[/\\]/.test(core) || /\.\w+$/.test(core);
    if (!path || !looksLikePath || core.includes('://'))
      return [{ text: word }];
    return [{ text: before }, { text: core, path }, { text: after }];
  });
}

interface Props {
  cwd: string;
  running: boolean;
  waiting: boolean;
  prompt: string;
  onPrompt(text: string): void;
  images: Image[];
  onImages(update: (images: Image[]) => Image[]): void;
  onSend(prompt: string, images: Image[], choice: ModelChoice): void;
  onCancel(): void;
  composer: Ref<HTMLTextAreaElement>;
}

export default function Composer({
  cwd,
  running,
  waiting,
  prompt,
  onPrompt,
  images,
  onImages,
  onSend,
  onCancel,
  composer,
}: Props) {
  const [tooBig, setTooBig] = useState(false);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  // Cached so the composer shows the model and effort before the catalog loads.
  const [models, setModels] = useState<Model[]>(() =>
    JSON.parse(localStorage.getItem('models') ?? '[]'),
  );
  const [choice, setChoice] = useState<ModelChoice>(() =>
    JSON.parse(localStorage.getItem('model') ?? '{"model":"opus"}'),
  );
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [paths, setPaths] = useState<Record<string, 'file' | 'folder'>>({});
  const menu = useRef<HTMLUListElement>(null);
  const mirror = useRef<HTMLDivElement>(null);

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
  const highlighted = Math.min(selected, matches.length - 1);

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
  }, [cwd]);

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
    menu.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function edit(text: string) {
    onPrompt(text);
    setSelected(0);
    setDismissed(false);
  }

  function send(text: string) {
    if (!text.trim() && !images.length) return;
    onSend(text, images, choice);
    edit('');
    setTooBig(false);
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(prompt);
      }}
      className={`relative flex shrink-0 items-end gap-2 border-t border-line bg-panel p-3 ${running && !waiting ? 'scanline' : ''}`}
    >
      {matches.length > 0 && (
        <ul
          ref={menu}
          role="listbox"
          className="absolute right-0 bottom-full left-0 max-h-64 overflow-y-auto border-t border-line bg-panel py-1"
        >
          {matches.map((c, i) => (
            <li
              key={c.name}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelected(i)}
              onClick={() => pick(c, true)}
              className={`flex cursor-pointer gap-3 px-3 py-1 text-sm ${
                i === highlighted ? 'bg-paper text-void' : ''
              }`}
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
          ))}
        </ul>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
        <div className="relative min-w-0 bg-void">
          <div
            ref={mirror}
            aria-hidden
            className="absolute inset-0 overflow-hidden border border-transparent px-3 py-2 text-sm break-words whitespace-pre-wrap [scrollbar-gutter:stable]"
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
            rows={1}
            value={prompt}
            onChange={(e) => edit(e.target.value)}
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
              if (matches.length > 0) {
                const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
                if (step) {
                  e.preventDefault();
                  const n = matches.length;
                  return setSelected((highlighted + step + n) % n);
                }
                if (e.key === 'Escape') return setDismissed(true);
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  return pick(matches[highlighted], e.key === 'Enter');
                }
              }
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              send(prompt);
            }}
            placeholder="Ask the agent…"
            className="relative block max-h-48 w-full resize-none border border-line bg-transparent px-3 py-2 text-sm text-transparent caret-ink [field-sizing:content] [scrollbar-gutter:stable] outline-none placeholder:text-mute focus:border-line-strong"
          />
        </div>
      </div>
      <ModelPicker models={models} choice={choice} onChoose={choose} />
      {running && (
        <button
          type="button"
          onClick={onCancel}
          className="h-[38px] border border-alert px-4 text-2xs tracking-widest text-alert transition-colors duration-150 ease-mech hover:bg-alert hover:text-void"
        >
          [ STOP ]
        </button>
      )}
      <button
        type="submit"
        disabled={!prompt.trim() && !images.length}
        className="chamfer h-[38px] bg-paper px-4 text-2xs font-medium tracking-widest text-void transition-colors duration-150 ease-mech hover:bg-ink disabled:bg-line-strong disabled:text-mute"
      >
        [ SEND ]
      </button>
    </form>
  );
}
