import { memo, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ThreadItem } from '../../agent-types';
import Button from '../ui/Button';

interface Question {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect?: boolean;
}

const index = (n: number) => (
  <span className="text-2xs leading-5 text-mute group-data-answer:text-warn">
    {String(n + 1).padStart(2, '0')}
  </span>
);

// Selectable while onAnswer is given; answering with nothing skips the questions.
export function Questions({
  input,
  live = false,
  onAnswer,
}: {
  input: unknown;
  live?: boolean;
  onAnswer?(answers?: Record<string, string>): void;
}) {
  const { questions, answers } = input as {
    questions: Question[];
    answers?: Record<string, string>;
  };
  const [picked, setPicked] = useState<string[][]>(() =>
    questions.map(() => []),
  );
  const [other, setOther] = useState(() => questions.map(() => ''));
  const reply = (i: number) =>
    [...picked[i], other[i].trim()].filter(Boolean).join(', ');
  const Row = onAnswer ? 'label' : 'div';
  const row =
    'group relative flex gap-3 px-2 py-1 has-checked:bg-paper has-checked:text-void has-focus-visible:outline has-focus-visible:outline-cyan has-[input]:cursor-pointer has-[input]:hover:bg-line has-checked:hover:bg-ink';
  return (
    <div
      role="group"
      aria-label="Questions"
      className={`divide-y divide-line border bg-panel text-sm transition-colors duration-200 ease-mech ${
        live ? 'border-cyan' : onAnswer ? 'border-line-strong' : 'border-line'
      }`}
    >
      {questions.map((q, i) => {
        // Answered options are matched back to labels; anything left was typed in.
        const given = answers?.[q.question]?.split(', ') ?? [];
        const typed = given
          .filter((g) => !q.options.some((o) => o.label === g))
          .join(', ');
        return (
          <fieldset key={i} className="space-y-2 px-3 py-2">
            <legend className="contents text-2xs tracking-widest text-mute uppercase">
              {q.header}
            </legend>
            <p className="break-words">{q.question}</p>
            <ol className="-mx-2 space-y-1">
              {q.options.map((o, j) => (
                <li key={j}>
                  <Row
                    data-answer={given.includes(o.label) || undefined}
                    className={row}
                  >
                    {onAnswer && (
                      <input
                        type={q.multiSelect ? 'checkbox' : 'radio'}
                        name={`q${i}`}
                        className="sr-only"
                        checked={picked[i].includes(o.label)}
                        onChange={(e) => {
                          setPicked(
                            picked.with(
                              i,
                              !q.multiSelect
                                ? [o.label]
                                : e.target.checked
                                  ? [...picked[i], o.label]
                                  : picked[i].filter((l) => l !== o.label),
                            ),
                          );
                          if (!q.multiSelect) setOther(other.with(i, ''));
                        }}
                      />
                    )}
                    {index(j)}
                    <span className="min-w-0 break-words group-data-answer:text-warn">
                      {o.label}
                      <span className="block text-2xs text-mute">
                        {o.description}
                      </span>
                    </span>
                  </Row>
                </li>
              ))}
              {onAnswer ? (
                <li>
                  <label
                    className={`${row} has-[input:not(:placeholder-shown)]:bg-paper has-[input:not(:placeholder-shown)]:text-void`}
                  >
                    {index(q.options.length)}
                    <input
                      type="text"
                      aria-label="Other"
                      placeholder="Other…"
                      value={other[i]}
                      onChange={(e) => {
                        setOther(other.with(i, e.target.value));
                        if (!q.multiSelect && e.target.value)
                          setPicked(picked.with(i, []));
                      }}
                      className="min-w-0 flex-1 bg-transparent placeholder:text-mute focus-visible:outline-none"
                    />
                  </label>
                </li>
              ) : (
                typed && (
                  <li data-answer className="group flex gap-3 px-2 py-1">
                    {index(q.options.length)}
                    <span className="min-w-0 break-words text-warn">
                      {typed}
                    </span>
                  </li>
                )
              )}
            </ol>
          </fieldset>
        );
      })}
      {onAnswer && (
        <div className="flex justify-end gap-2 px-3 py-2">
          <Button variant="destructive" size="md" onClick={() => onAnswer()}>
            [ SKIP ]
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={questions.some((_, i) => !reply(i))}
            onClick={() =>
              onAnswer(
                Object.fromEntries(
                  questions.map((q, i) => [q.question, reply(i)]),
                ),
              )
            }
          >
            [ SUBMIT ]
          </Button>
        </div>
      )}
    </div>
  );
}

export function summarize(input: unknown) {
  const fields = input as Record<string, unknown> | null;
  const summary = [
    'command',
    'file_path',
    'pattern',
    'description',
    'url',
    'query',
  ]
    .map((k) => fields?.[k])
    .find((v): v is string => typeof v === 'string');
  return summary?.split('\n')[0] ?? JSON.stringify(input);
}

export default memo(function Item({
  item,
  live,
}: {
  item: ThreadItem;
  live: boolean;
}) {
  switch (item.type) {
    case 'user':
      return (
        <div className="flex gap-3 border border-line bg-panel px-3 py-2 text-sm">
          <span className="text-mute">&gt;</span>
          <div className="min-w-0 space-y-2">
            {item.images && (
              <div className="flex flex-wrap gap-2">
                {item.images.map((img, i) => (
                  <img
                    key={i}
                    src={`data:${img.mediaType};base64,${img.data}`}
                    alt=""
                    className="max-h-48 border border-line"
                  />
                ))}
              </div>
            )}
            {item.text && (
              <p className="break-words whitespace-pre-wrap">{item.text}</p>
            )}
          </div>
        </div>
      );
    case 'text':
      return (
        <div
          className={`markdown border-l pl-3 text-sm break-words transition-colors duration-200 ease-mech ${
            live ? 'border-cyan' : 'border-line'
          }`}
        >
          <Markdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              a: (props) => <a {...props} target="_blank" />,
              table: (props) => (
                <div className="overflow-x-auto">
                  <table {...props} />
                </div>
              ),
            }}
          >
            {item.text}
          </Markdown>
        </div>
      );
    case 'tool':
      if (item.name === 'AskUserQuestion')
        return <Questions input={item.input} live={live} />;
      return (
        <p className="flex gap-2 border-l border-transparent pl-3 text-2xs text-mute">
          <span className={`shrink-0 ${live ? 'text-cyan' : ''}`}>
            {item.name.toLowerCase()}
          </span>
          <span className="min-w-0 truncate">{summarize(item.input)}</span>
        </p>
      );
    case 'done':
      return (
        !item.ok && (
          <p className="border-l border-transparent pl-3 text-2xs tracking-widest text-alert">
            FAILED · {item.result}
          </p>
        )
      );
    case 'error':
      return (
        <p className="border-l border-transparent pl-3 text-2xs tracking-widest break-words text-alert">
          {item.message}
        </p>
      );
  }
});
