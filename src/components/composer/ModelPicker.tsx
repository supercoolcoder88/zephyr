import { useRef, useState } from 'react';
import type { Model, ModelChoice } from '../../agent-types';

interface Props {
  models: Model[];
  choice: ModelChoice;
  onChoose(choice: ModelChoice): void;
}

export default function ModelPicker({ models, choice, onChoose }: Props) {
  const [picking, setPicking] = useState(false);
  const [hovered, setHovered] = useState<string>();
  const picker = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = models.find((m) => m.value === choice.model);
  const effort = choice.effort ?? current?.defaultEffort;

  function choose(next: ModelChoice) {
    onChoose(next);
    setPicking(false);
    trigger.current?.focus();
  }

  return (
    <div
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPicking(false);
      }}
      onKeyDown={(e) => {
        const el = e.target as HTMLElement;
        const list = el.closest('[role=menu]');
        const items = [
          ...((list ?? picker.current)?.querySelectorAll<HTMLElement>(
            ':scope > li > button',
          ) ?? []),
        ];
        const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
        let next: Element | null | undefined;
        if (e.key === 'Escape' && picking) {
          setPicking(false);
          next = trigger.current;
        } else if (step && items.length > 0) {
          const at = Math.max(items.indexOf(el), step > 0 ? -1 : 0);
          next = items[(at + step + items.length) % items.length];
        } else if (e.key === 'ArrowLeft' && list === picker.current) {
          next = el.parentElement?.querySelector(':scope > [role=menu] button');
        } else if (e.key === 'ArrowRight' && list !== picker.current) {
          next = list?.parentElement?.firstElementChild;
        }
        if (!(next instanceof HTMLElement)) return;
        e.preventDefault();
        next.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={picking}
        onClick={() => {
          setHovered(choice.model);
          setPicking(!picking);
        }}
        className={`flex h-[38px] items-center gap-2 px-2 text-2xs tracking-widest uppercase transition-colors duration-150 ease-mech hover:text-ink ${
          picking ? 'text-ink' : 'text-mute'
        }`}
      >
        <span>
          {current?.displayName ?? choice.model}
          {effort && ` · ${effort}`}
        </span>
        <span aria-hidden>{picking ? '▲' : '▼'}</span>
      </button>
      {picking && (
        <ul
          ref={picker}
          role="menu"
          className="absolute right-3 bottom-full border border-b-0 border-line bg-panel py-1"
        >
          {models.map((m) => {
            const active = m.value === choice.model;
            return (
              <li
                key={m.value}
                onMouseEnter={() => setHovered(m.value)}
                onFocus={() => setHovered(m.value)}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose({ model: m.value })}
                  className={`flex w-full items-center gap-2 py-1 pr-3 pl-2 text-left text-sm whitespace-nowrap transition-colors duration-150 ease-mech ${
                    hovered === m.value
                      ? 'bg-paper text-void'
                      : active
                        ? 'text-ink'
                        : 'text-mute'
                  }`}
                >
                  <span aria-hidden className="w-2">
                    {active && '>'}
                  </span>
                  {m.displayName}
                  <span
                    aria-hidden
                    className={`ml-auto pl-8 text-2xs tracking-widest uppercase ${
                      hovered === m.value ? '' : 'text-mute'
                    }`}
                  >
                    {active ? effort : m.defaultEffort}
                  </span>
                </button>
                {hovered === m.value && m.efforts.length > 0 && (
                  <ul
                    role="menu"
                    aria-label={`${m.displayName} effort`}
                    className="absolute right-full bottom-0 border border-b-0 border-line bg-panel py-1"
                  >
                    {m.efforts.map((level) => {
                      const on = level === (active ? effort : m.defaultEffort);
                      return (
                        <li key={level}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              choose({ model: m.value, effort: level })
                            }
                            className={`group flex w-full items-center gap-2 py-1 pr-3 pl-2 text-left text-sm whitespace-nowrap transition-colors duration-150 ease-mech hover:bg-paper hover:text-void focus:bg-paper focus:text-void ${
                              on ? 'text-ink' : 'text-mute'
                            }`}
                          >
                            <span aria-hidden className="w-2">
                              {on && '>'}
                            </span>
                            {level}
                            <span
                              aria-hidden
                              className="ml-auto pl-6 text-2xs tracking-widest text-mute uppercase group-hover:text-void group-focus:text-void"
                            >
                              {level === m.defaultEffort && 'default'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
