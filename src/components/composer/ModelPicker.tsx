import { useRef, useState } from 'react';
import type { Model, ModelChoice } from '../../agent-types';
import Button from '../ui/Button';
import MenuItem from '../ui/MenuItem';
import useDismiss from '../ui/useDismiss';

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
  const root = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.value === choice.model);
  const effort = choice.effort ?? current?.defaultEffort;

  function choose(next: ModelChoice) {
    onChoose(next);
    setPicking(false);
    trigger.current?.focus();
  }

  useDismiss(root, picking, () => setPicking(false));

  return (
    <div
      ref={root}
      className="min-w-0"
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
      <Button
        ref={trigger}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={picking}
        onClick={() => {
          setHovered(choice.model);
          setPicking(!picking);
        }}
        className="max-w-full"
      >
        <span className="truncate">
          {current?.displayName ?? choice.model}
          {effort && ` · ${effort}`}
        </span>
      </Button>
      {picking && (
        <ul
          ref={picker}
          role="menu"
          className="absolute right-0 bottom-full border border-b-0 border-line bg-panel py-1"
        >
          {models.map((m) => {
            const active = m.value === choice.model;
            return (
              <li key={m.value} onFocus={() => setHovered(m.value)}>
                <MenuItem
                  checked={active}
                  aria-haspopup={m.efforts.length > 0 ? 'menu' : undefined}
                  aria-expanded={
                    m.efforts.length > 0 ? hovered === m.value : undefined
                  }
                  data-highlighted={hovered === m.value || undefined}
                  onClick={() => choose({ model: m.value })}
                  className="data-highlighted:bg-paper data-highlighted:text-void"
                >
                  {m.displayName}
                  <span
                    aria-hidden
                    className="ml-auto pl-8 text-2xs tracking-widest text-mute uppercase group-data-highlighted:text-void"
                  >
                    {active ? effort : m.defaultEffort}
                  </span>
                </MenuItem>
                {hovered === m.value && m.efforts.length > 0 && (
                  <ul
                    role="menu"
                    aria-label={`${m.displayName} effort`}
                    className="absolute right-full bottom-0 border border-b-0 border-line bg-panel py-1 @max-md:-right-px @max-md:bottom-full"
                  >
                    {m.efforts.map((level) => {
                      const on = level === (active ? effort : m.defaultEffort);
                      return (
                        <li key={level}>
                          <MenuItem
                            checked={on}
                            onClick={() =>
                              choose({ model: m.value, effort: level })
                            }
                          >
                            {level}
                            <span
                              aria-hidden
                              className="ml-auto pl-6 text-2xs tracking-widest text-mute uppercase group-focus:text-void"
                            >
                              {level === m.defaultEffort && 'default'}
                            </span>
                          </MenuItem>
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
