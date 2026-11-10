import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import MenuItem from '../ui/MenuItem';
import useDismiss from '../ui/useDismiss';

interface Props {
  cwd: string;
  isolated: boolean;
  locked: boolean;
  onIsolate(isolated: boolean): void;
  onMerge?: () => void;
}

export default function BranchPicker({
  cwd,
  isolated,
  locked,
  onIsolate,
  onMerge,
}: Props) {
  const [branch, setBranch] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.agent.branch(cwd).then(setBranch, () => setBranch(null));
  }, [cwd]);
  useDismiss(root, open, () => setOpen(false));

  if (!branch) return null;
  // The branch label turns into a two-step merge on hover or focus.
  if (locked && onMerge)
    return (
      <Button
        size="sm"
        aria-label={confirming ? 'Confirm merge' : `Merge ${branch}`}
        onMouseLeave={() => setConfirming(false)}
        onBlur={() => setConfirming(false)}
        onClick={() => {
          if (confirming) onMerge();
          setConfirming(!confirming);
        }}
        className="group max-w-32 shrink-0"
      >
        <span className="truncate group-hover:hidden group-focus-visible:hidden">
          {branch}
        </span>
        <span className="hidden group-hover:inline group-focus-visible:inline">
          {confirming ? '[ CONFIRM ]' : '[ MERGE ]'}
        </span>
      </Button>
    );
  if (locked)
    return (
      <span className="max-w-32 shrink-0 truncate px-3 text-2xs tracking-widest text-mute uppercase">
        {branch}
      </span>
    );

  function choose(next: boolean) {
    onIsolate(next);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      ref={root}
      className="shrink-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        const items = [
          ...(root.current?.querySelectorAll<HTMLElement>(
            '[role=menu] button',
          ) ?? []),
        ];
        const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (!step || !items.length) return;
        e.preventDefault();
        const at = Math.max(
          items.indexOf(e.target as HTMLElement),
          step > 0 ? -1 : 0,
        );
        items[(at + step + items.length) % items.length].focus();
      }}
    >
      <Button
        ref={trigger}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={branch}
        className="max-w-32"
      >
        <span className="truncate">{isolated ? 'New worktree' : branch}</span>
      </Button>
      {open && (
        <ul
          role="menu"
          aria-label="Workspace"
          className="absolute right-0 bottom-full border border-b-0 border-line bg-panel py-1"
        >
          <li>
            <MenuItem checked={!isolated} onClick={() => choose(false)}>
              {branch}
            </MenuItem>
          </li>
          <li>
            <MenuItem checked={isolated} onClick={() => choose(true)}>
              New worktree
            </MenuItem>
          </li>
        </ul>
      )}
    </div>
  );
}
