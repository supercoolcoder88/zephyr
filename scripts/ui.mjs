#!/usr/bin/env node
// Headless, throwaway zephyr instance driven over the Chrome DevTools Protocol.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(os.tmpdir(), 'zephyr-ui');
const stateFile = path.join(dir, 'state.json');
const [cmd, ...args] = process.argv.slice(2);
const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const { port, width, height } = state();
  const targets = await (
    await fetch(`http://localhost:${port}/json/list`)
  ).json();
  const ws = new WebSocket(
    targets.find((t) => t.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    pending.get(m.id)?.(m);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, (m) =>
        m.error ? reject(new Error(m.error.message)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  };
  // Headless ozone windows are 1x1 and the override is dropped on disconnect.
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { send, evaluate, close: () => ws.close() };
}

const find = (target) => `(() => {
  const t = ${JSON.stringify(target)};
  const all = t.startsWith('text=')
    ? [...document.querySelectorAll('body *')].filter((e) => e.innerText?.includes(t.slice(5)))
    : [...document.querySelectorAll(t)];
  const el = all.filter((e) => e.getClientRects().length).at(-1);
  if (!el) throw new Error('No visible element for ' + t);
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`;

const commands = {
  async start() {
    if (fs.existsSync(stateFile))
      throw new Error(`Already running, run stop first (${dir})`);
    const [width, height] = (
      args.find((a) => /^\d+x\d+$/.test(a)) ?? '1280x800'
    )
      .split('x')
      .map(Number);
    const workspace = path.join(dir, 'workspace');
    const config = path.join(dir, 'claude');
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'README.md'), '# scratch\n');
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    const creds = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(creds))
      fs.copyFileSync(creds, path.join(config, '.credentials.json'));

    const port = await new Promise((r) => {
      const s = net
        .createServer()
        .listen(0, () => (r(s.address().port), s.close()));
    });
    const log = fs.openSync(path.join(dir, 'app.log'), 'w');
    const child = spawn(
      'npx',
      [
        'electron-forge',
        'start',
        '--',
        '--ozone-platform=headless',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${path.join(dir, 'userdata')}`,
      ],
      {
        cwd: root,
        detached: true,
        stdio: ['ignore', log, log],
        env: {
          ...process.env,
          ZEPHYR_WORKSPACE: workspace,
          CLAUDE_CONFIG_DIR: config,
        },
      },
    );
    child.unref();
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ pid: child.pid, port, width, height, workspace }),
    );

    for (let i = 0; i < 120; i++, await sleep(500)) {
      try {
        const app = await connect();
        const ready = await app.evaluate(
          `document.readyState === 'complete' && document.body.innerText.trim().length > 0`,
        );
        app.close();
        if (ready)
          return console.log(`ready on port ${port}, workspace ${workspace}`);
      } catch {}
    }
    throw new Error(`App did not come up, see ${path.join(dir, 'app.log')}`);
  },

  async stop() {
    if (fs.existsSync(stateFile)) {
      try {
        process.kill(-state().pid, 'SIGTERM');
      } catch {}
      await sleep(1000);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('stopped');
  },

  async shot(file = path.join(dir, 'shots', `${Date.now()}.png`)) {
    const app = await connect();
    await sleep(200);
    const { data } = await app.send('Page.captureScreenshot', {
      format: 'png',
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  },

  async eval(expression) {
    console.log(
      JSON.stringify(await (await connect()).evaluate(expression), null, 2),
    );
  },

  async click(target) {
    const app = await connect();
    const { x, y } = await app.evaluate(find(target));
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await app.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
  },

  async hover(target) {
    const app = await connect();
    const { x, y } = await app.evaluate(find(target));
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  },

  async type(text) {
    await (await connect()).send('Input.insertText', { text });
  },

  async key(key) {
    const app = await connect();
    const code = {
      Enter: 13,
      Escape: 27,
      Tab: 9,
      Backspace: 8,
      ArrowUp: 38,
      ArrowDown: 40,
    }[key];
    for (const type of ['keyDown', 'keyUp'])
      await app.send('Input.dispatchKeyEvent', {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: code,
        ...(key === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}),
      });
  },
};

if (!commands[cmd]) {
  console.error(
    'usage: node scripts/ui.mjs start [WxH] | shot [file] | click <css|text=...> | hover <css|text=...> | type <text> | key <Key> | eval <js> | stop',
  );
  process.exit(1);
}
await commands[cmd](...args);
process.exit(0);
