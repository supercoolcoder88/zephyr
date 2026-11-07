import { useEffect, useState, type FormEvent } from 'react';
import type { AgentEvent } from './agent-types';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [running, setRunning] = useState(false);

  useEffect(
    () =>
      window.agent.onEvent((event) => {
        if (event.type === 'session') setSessionId(event.sessionId);
        else setEvents((prev) => [...prev, event]);
      }),
    [],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running) return;
    setEvents((prev) => [...prev, { type: 'text', text: `> ${prompt}` }]);
    setPrompt('');
    setRunning(true);
    try {
      // Passing the last session id continues the same conversation.
      await window.agent.run(prompt, sessionId);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <div className="flex-1 space-y-2 overflow-y-auto p-4 font-mono text-sm">
        {events.map((event, i) => (
          <EventLine key={i} event={event} />
        ))}
        {running && <p className="text-slate-500">…</p>}
      </div>
      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-slate-800 p-3"
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask the agent…"
          className="flex-1 rounded-lg bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
        />
        {running ? (
          <button
            type="button"
            onClick={() => window.agent.cancel()}
            className="rounded-lg bg-rose-600 px-4 py-2 font-medium hover:bg-rose-500"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 font-medium hover:bg-sky-400"
          >
            Send
          </button>
        )}
      </form>
    </main>
  );
}

function EventLine({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'text':
      return <p className="whitespace-pre-wrap">{event.text}</p>;
    case 'tool':
      return (
        <p className="text-amber-400">
          ⚙ {event.name} {JSON.stringify(event.input)}
        </p>
      );
    case 'done':
      return (
        <p className={event.ok ? 'text-emerald-400' : 'text-rose-400'}>
          {event.ok ? '✓ done' : `✗ ${event.result}`} · $
          {event.costUsd.toFixed(4)}
        </p>
      );
    case 'error':
      return <p className="text-rose-400">error: {event.message}</p>;
    default:
      return null;
  }
}
