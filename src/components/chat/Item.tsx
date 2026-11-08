import { memo } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { ThreadItem } from '../../agent-types';

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
            remarkPlugins={[remarkGfm]}
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
