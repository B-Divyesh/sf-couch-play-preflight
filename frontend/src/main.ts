import QRCode from 'qrcode';
import './style.css';
import { api, ApiRequestError } from './api';
import { acceptedInputs, authenticPracticeInput, inputLabel, normalizeCode, playerReady, readiness, type InputKind, type Player, type Snapshot } from './model';

declare const __BUILD_SHA__: string;

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanupView = () => {};
let demoMode = false;
let routeFocusPending = false;
const buildLabel = __BUILD_SHA__.slice(0, 12);

const demoSnapshot: Snapshot = {
  room: {
    code: 'DEMO',
    created_at: '2026-08-30T18:00:00Z',
    expires_at: '2026-08-31T00:00:00Z',
    game_label: 'Family picture quiz',
    accepted_inputs: 'touch,keyboard,gamepad',
    display_ready: true,
  },
  players: [
    { id: 'demo-mina', name: 'Mina', input_kind: 'touch', browser_ok: true, input_ok: true, network_ok: true, practice_ok: true, screen_awake: true, note: '', updated_at: '2026-08-30T18:04:00Z' },
    { id: 'demo-tom', name: 'Tom', input_kind: 'keyboard', browser_ok: true, input_ok: true, network_ok: true, practice_ok: true, screen_awake: false, note: '', updated_at: '2026-08-30T18:04:30Z' },
    { id: 'demo-ari', name: 'Ari', input_kind: 'gamepad', browser_ok: true, input_ok: true, network_ok: true, practice_ok: true, screen_awake: true, note: '', updated_at: '2026-08-30T18:05:00Z' },
    { id: 'demo-jo', name: 'Jo', input_kind: 'touch', browser_ok: true, input_ok: true, network_ok: true, practice_ok: true, screen_awake: false, note: '', updated_at: '2026-08-30T18:05:20Z' },
  ],
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function shell(content: string): string {
  const demoBanner = demoMode ? `<aside class="demo-banner" role="status" aria-label="Demo controls"><span><strong>Demo — sample data, nothing is saved</strong><small>Explore a four-guest room without contacting the room service.</small></span><span class="demo-actions"><button id="reset-demo" class="text-button" type="button">Reset demo</button><a class="secondary" href="/" data-link>Start for real</a></span></aside>` : '';
  return `${demoBanner}<div class="offline-ribbon" role="status" aria-live="polite" hidden>You’re offline. Existing results stay visible; updates will retry when you reconnect.</div>
    <header class="site-header">
      <a class="wordmark" href="/" data-link aria-label="Room Ready home"><span aria-hidden="true">◉</span> Room Ready</a>
      <nav aria-label="Utility"><a href="/demo" data-link>Demo</a><a href="/privacy" data-link>Privacy</a><button class="text-button" id="text-size" type="button" aria-pressed="false">Large text</button></nav>
    </header>
    <div id="route-status" class="sr-only" aria-live="polite"></div>
    <main id="main" tabindex="-1">${content}</main>
    <footer><p>Room Ready helps hosts check a group setup before guests arrive. It does not certify a specific game.</p><p class="footer-links"><a href="/privacy" data-link>Privacy</a><a href="/terms" data-link>Terms</a><span>Built by Param Factory</span><span>Build ${escapeHtml(buildLabel)}</span><span>Original AI-assisted scene, 2026</span></p></footer>`;
}

function bindGlobal() {
  document.querySelectorAll<HTMLAnchorElement>('[data-link]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || link.target) return;
    event.preventDefault();
    const destination = new URL(link.href);
    if (demoMode && destination.pathname === '/' && !destination.search) sessionStorage.removeItem('demo:room-ready');
    navigate(destination.pathname + destination.search);
  }));
  const large = localStorage.getItem('room-ready-large') === 'true';
  document.documentElement.classList.toggle('large-text', large);
  const sizeButton = document.querySelector<HTMLButtonElement>('#text-size');
  if (sizeButton) {
    sizeButton.setAttribute('aria-pressed', String(large));
    sizeButton.textContent = large ? 'Standard text' : 'Large text';
    sizeButton.addEventListener('click', () => {
      const active = !document.documentElement.classList.contains('large-text');
      document.documentElement.classList.toggle('large-text', active);
      localStorage.setItem('room-ready-large', String(active));
      sizeButton.setAttribute('aria-pressed', String(active));
      sizeButton.textContent = active ? 'Standard text' : 'Large text';
    });
  }
  const ribbon = document.querySelector<HTMLElement>('.offline-ribbon')!;
  const update = () => { ribbon.hidden = navigator.onLine; };
  update();
  addEventListener('online', update, { signal: viewSignal.signal });
  addEventListener('offline', update, { signal: viewSignal.signal });
  document.querySelector<HTMLButtonElement>('#reset-demo')?.addEventListener('click', () => {
    sessionStorage.removeItem('demo:room-ready');
    demoView();
  });
}

let viewSignal = new AbortController();
function beginView(html: string, isDemo = false, focusReady = true) {
  cleanupView();
  viewSignal.abort();
  viewSignal = new AbortController();
  demoMode = isDemo;
  document.body.classList.toggle('in-demo', isDemo);
  root.innerHTML = shell(html);
  bindGlobal();
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (routeFocusPending && focusReady) {
    routeFocusPending = false;
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLHeadingElement>('main h1');
      const status = document.querySelector<HTMLElement>('#route-status');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        if (status) status.textContent = heading.textContent || document.title;
      }
    });
  }
}

function navigate(path: string) {
  history.pushState({}, '', path);
  routeFocusPending = true;
  render();
}

function updateMetadata(title: string, description: string) {
  document.title = title;
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = `${location.origin}${location.pathname}`;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute('content', `${location.origin}${location.pathname}`);
  document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', title);
  document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', description);
}

function notice(message: string, kind: 'error' | 'success' = 'error') {
  const target = document.querySelector<HTMLElement>('#notice');
  if (target) { target.className = `notice ${kind}`; target.textContent = message; target.hidden = false; target.focus(); }
}

function homeView() {
  beginView(`<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Game setup check</p>
      <h1>Preflight every device before your guests arrive.</h1>
      <p class="lede">For hosts of family, classroom, and team games who need phones, controllers, Wi‑Fi, and the big screen working before guests wait.</p>
      <div class="hero-actions"><a class="primary button-link" href="/demo" data-link>Try it with sample data <span aria-hidden="true">→</span></a><p>See a ready room with four sample guests.</p></div>
      <ul class="plain-facts" aria-label="Room Ready facts"><li>No account</li><li>No install</li><li>Rooms expire after six hours</li></ul>
      <form id="open-form" class="open-form">
        <label for="game">What are you playing? <span>Optional</span></label>
        <input id="game" name="game" maxlength="60" autocomplete="off" placeholder="e.g. browser trivia" />
        <label class="discovery-choice"><input id="discoverable" type="checkbox" checked><span><strong>Let guests find this room on the same network</strong><small>They can always use the QR or four-letter code instead.</small></span></label>
        <button class="secondary" type="submit">Open a real room <span aria-hidden="true">→</span></button>
      </form>
      <p id="notice" class="notice" role="alert" tabindex="-1" hidden></p>
    </div>
    <figure class="hero-art"><picture><source media="(max-width: 960px)" srcset="/assets/room-ready-hero-960.webp"><img src="/assets/room-ready-hero-1536.webp" width="1536" height="1024" alt="An empty, warmly lit living room arranged with chairs, phones and controllers facing a blank television" fetchpriority="high" decoding="async"></picture><figcaption>Prepare the host screen before guests arrive.</figcaption></figure>
  </section>
  <section class="join-strip" aria-labelledby="join-title">
    <div><p class="eyebrow">Already invited?</p><h2 id="join-title">Join with the four-letter room code.</h2></div>
    <form id="quick-join" class="code-form"><label class="sr-only" for="quick-code">Room code</label><input id="quick-code" class="code-input" maxlength="4" inputmode="text" autocomplete="off" aria-describedby="code-hint" placeholder="ROOM"><button type="submit" class="secondary">Run my check</button><span id="code-hint">Letters only</span></form>
  </section>
  <section class="how" aria-labelledby="how-title"><p class="eyebrow">How setup checks work</p><h2 id="how-title">Check devices and inputs before play begins.</h2><ol><li><span>01</span><strong>Invite guests</strong><p>Share the QR code or four-letter code.</p></li><li><span>02</span><strong>Check each device</strong><p>Each guest checks their connection and chosen input.</p></li><li><span>03</span><strong>Review results</strong><p>See measured checks and fix what needs attention.</p></li></ol></section>`);
  document.querySelector<HTMLFormElement>('#open-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector<HTMLButtonElement>('#open-form button')!;
    button.disabled = true; button.textContent = 'Opening the room…';
    try {
      const created = await api.create((document.querySelector<HTMLInputElement>('#game')!).value, document.querySelector<HTMLInputElement>('#discoverable')!.checked);
      sessionStorage.setItem(`host:${created.code}`, created.host_token);
      navigate(`/host?room=${created.code}`);
    } catch (error) { notice((error as Error).message); button.disabled = false; button.textContent = 'Open a real room →'; }
  });
  const quick = document.querySelector<HTMLInputElement>('#quick-code')!;
  quick.addEventListener('input', () => { quick.value = normalizeCode(quick.value); });
  document.querySelector<HTMLFormElement>('#quick-join')!.addEventListener('submit', (event) => {
    event.preventDefault();
    if (quick.value.length !== 4) { quick.setCustomValidity('Enter all four letters'); quick.reportValidity(); return; }
    navigate(`/join?room=${quick.value}`);
  });
}

async function hostView(code: string) {
  const token = sessionStorage.getItem(`host:${code}`);
  beginView(`<section class="loading-state"><p class="eyebrow">Room ${escapeHtml(code)}</p><h1>Loading room details.</h1><p>Confirming the new room and loading guest checks.</p></section>`, false, false);
  if (!token) {
    beginView(`<section class="center-state"><p class="eyebrow">Host access</p><h1>Host access is not available in this browser.</h1><p>For guest privacy, host keys stay only in the browser session that opened the room. Return to that browser, or open a new room.</p><a class="primary button-link" href="/" data-link>Open a new room</a></section>`);
    return;
  }
  let timer = 0;
  const paint = async (first = false) => {
    try {
      let snapshot: Snapshot | undefined;
      let lastError: unknown;
      const attempts = first ? 5 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          snapshot = await api.get(code);
          break;
        } catch (error) {
          lastError = error;
          if (!(error instanceof ApiRequestError) || error.status !== 404 || attempt === attempts - 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      if (!snapshot) throw lastError;
      if (first) renderHost(snapshot, token); else updateHostRoster(snapshot);
    } catch (error) {
      if (first) beginView(`<section class="center-state"><p class="eyebrow">Room ${escapeHtml(code)}</p><h1>We couldn’t find this room.</h1><p>${escapeHtml((error as Error).message)}</p><a class="primary button-link" href="/" data-link>Open another room</a></section>`);
      else notice((error as Error).message);
    }
  };
  await paint(true);
  timer = window.setInterval(() => paint(false), 2500);
  cleanupView = () => clearInterval(timer);
}

function statusMark(ok: boolean, label: string) {
  return `<span class="mini-status ${ok ? 'pass' : 'wait'}"><span aria-hidden="true">${ok ? '✓' : '!'}</span>${label}</span>`;
}

function rosterHtml(snapshot: Snapshot) {
  if (!snapshot.players.length) return `<div class="empty-bench"><span aria-hidden="true">⌁</span><h3>No guests have joined yet.</h3><p>Show the join card or ask guests to enter <strong>${snapshot.room.code}</strong>.</p></div>`;
  return `<ul class="player-list">${snapshot.players.map((player) => {
    const compatible = acceptedInputs(snapshot.room).includes(player.input_kind);
    const ready = playerReady(player, snapshot.room);
    return `<li class="player ${ready ? 'is-ready' : ''}"><div class="player-head"><span class="avatar" aria-hidden="true">${escapeHtml(player.name.charAt(0).toUpperCase())}</span><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(inputLabel(player.input_kind))}</p></div><strong class="player-state">${ready ? 'Ready' : 'Check needed'}</strong></div><div class="status-row">${statusMark(player.browser_ok, 'Browser')}${statusMark(player.network_ok, 'Network')}${statusMark(player.input_ok, 'Input')}${statusMark(player.practice_ok, 'Practice')}${statusMark(compatible, compatible ? 'Fits setup' : 'Not selected')}</div>${player.note ? `<p class="player-note">${escapeHtml(player.note)}</p>` : ''}</li>`;
  }).join('')}</ul>`;
}

function summaryHtml(snapshot: Snapshot) {
  const state = readiness(snapshot);
  const message = state.roomReady ? 'The room is ready.' : !state.total ? 'Waiting for the first guest.' : state.needsHelp ? `${state.needsHelp} ${state.needsHelp === 1 ? 'guest needs' : 'guests need'} a check.` : 'Guests are ready. Confirm the display.';
  return `<div class="ready-lamp ${state.roomReady ? 'on' : ''}" aria-hidden="true"></div><p class="eyebrow">Live readiness</p><h2>${message}</h2><div class="count-line"><strong>${state.ready}</strong><span>ready</span><strong>${state.needsHelp}</strong><span>need attention</span></div>`;
}

function renderHost(snapshot: Snapshot, token: string) {
  const joinUrl = `${location.origin}/join?room=${snapshot.room.code}`;
  beginView(`<section class="host-stage">
    <div class="host-title"><p class="eyebrow">Room controls · expires in six hours</p><h1>Set up this room.</h1><p>${snapshot.room.game_label ? `Preflight for <strong>${escapeHtml(snapshot.room.game_label)}</strong>.` : 'Choose the session requirements, then invite guests.'}</p></div>
    <aside class="join-card" aria-label="Guest join card"><p>Join the room</p><strong class="room-code">${snapshot.room.code}</strong><img id="qr" width="184" height="184" alt="QR code for the Room Ready guest join page"><p class="join-url">${escapeHtml(joinUrl.replace(/^https?:\/\//, ''))}</p><div class="button-pair"><button id="copy-link" class="secondary" type="button">Copy join link</button><button id="present" class="secondary" type="button">TV view</button></div></aside>
  </section>
  <section class="host-grid">
    <div><div class="section-heading"><div><p class="eyebrow">Guest list</p><h2>Phones and controllers</h2></div><button id="print-card" class="text-button" type="button">Print join card</button></div><div id="roster">${rosterHtml(snapshot)}</div></div>
    <aside><div id="summary" class="summary-panel" aria-live="polite">${summaryHtml(snapshot)}</div>
      <form id="setup-form" class="setup-form"><h2>Session fit</h2><p>Choose what this setup accepts. This compares inputs only; it does not certify a specific game.</p><label for="host-game">Game or activity <span>Optional</span></label><input id="host-game" maxlength="60" value="${escapeHtml(snapshot.room.game_label)}" placeholder="e.g. team quiz"><fieldset><legend>Inputs that will work</legend>${(['touch','keyboard','gamepad'] as InputKind[]).map((kind) => `<label class="check"><input type="checkbox" name="inputs" value="${kind}" ${acceptedInputs(snapshot.room).includes(kind) ? 'checked' : ''}><span>${inputLabel(kind)}</span></label>`).join('')}</fieldset><label class="check display-check"><input id="display-ready" type="checkbox" ${snapshot.room.display_ready ? 'checked' : ''}><span>Big screen is connected and visible</span></label><button class="primary" type="submit">Save session fit</button></form>
      <button id="close-room" class="danger-button" type="button">Close this room</button><p id="notice" class="notice" role="alert" tabindex="-1" hidden></p>
    </aside>
  </section>`);
  QRCode.toDataURL(joinUrl, { width: 368, margin: 2, color: { dark: '#0B1113', light: '#F4F0E6' }, errorCorrectionLevel: 'M' }).then((src) => { const image = document.querySelector<HTMLImageElement>('#qr'); if (image) image.src = src; });
  document.querySelector('#copy-link')!.addEventListener('click', async () => {
    await navigator.clipboard.writeText(joinUrl);
    const button = document.querySelector<HTMLButtonElement>('#copy-link')!; button.textContent = 'Link copied'; setTimeout(() => { button.textContent = 'Copy join link'; }, 1800);
  });
  document.querySelector('#print-card')!.addEventListener('click', () => print());
  document.querySelector('#present')!.addEventListener('click', async () => {
    document.body.classList.toggle('presenting');
    if (document.body.classList.contains('presenting') && document.fullscreenEnabled) await document.documentElement.requestFullscreen().catch(() => {});
    else if (document.fullscreenElement) await document.exitFullscreen();
  });
  document.querySelector<HTMLFormElement>('#setup-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selected = [...document.querySelectorAll<HTMLInputElement>('input[name="inputs"]:checked')].map((input) => input.value);
    if (!selected.length) { notice('Select at least one input that will work for this session.'); return; }
    try {
      await api.updateRoom(snapshot.room.code, { host_token: token, game_label: document.querySelector<HTMLInputElement>('#host-game')!.value, accepted_inputs: selected, display_ready: document.querySelector<HTMLInputElement>('#display-ready')!.checked });
      notice('Session fit saved. Guest readiness has been recalculated.', 'success');
      updateHostRoster(await api.get(snapshot.room.code));
    } catch (error) { notice((error as Error).message); }
  });
  document.querySelector('#close-room')!.addEventListener('click', async () => {
    if (!confirm(`Close room ${snapshot.room.code}? Guests will no longer be able to update it.`)) return;
    try { await api.close(snapshot.room.code, token); sessionStorage.removeItem(`host:${snapshot.room.code}`); navigate('/'); } catch (error) { notice((error as Error).message); }
  });
}

function updateHostRoster(snapshot: Snapshot) {
  const roster = document.querySelector('#roster');
  const summary = document.querySelector('#summary');
  if (!roster || !summary) return;
  roster.innerHTML = rosterHtml(snapshot);
  summary.innerHTML = summaryHtml(snapshot);
}

function demoView() {
  // Demo state never shares a key with a host or guest room. It is a small,
  // session-only fixture so a visitor can inspect the product with no API call.
  sessionStorage.setItem('demo:room-ready', JSON.stringify({ room: demoSnapshot.room.code, started: Date.now() }));
  beginView(`<section class="host-stage demo-stage">
    <div class="host-title"><p class="eyebrow">Sample room · four guests</p><h1>See a ready room before you host.</h1><p>This sample shows a family picture quiz with touch, keyboard, and gamepad guests already checked.</p></div>
    <aside class="join-card" aria-label="Sample room summary"><p>Sample room</p><strong class="room-code">DEMO</strong><p class="join-url">Sample data is read-only. No room link, guest name, or check leaves this browser.</p></aside>
  </section>
  <section class="host-grid demo-board">
    <div><div class="section-heading"><div><p class="eyebrow">Guest list</p><h2>Phones and controllers</h2></div></div><div id="roster">${rosterHtml(demoSnapshot)}</div></div>
    <aside><div id="summary" class="summary-panel" aria-live="polite">${summaryHtml(demoSnapshot)}</div><section class="demo-explainer"><h2>What you can do for real</h2><ol><li>Open a room on the host screen.</li><li>Share its QR code or four-letter code.</li><li>See each guest’s measured checks.</li></ol></section></aside>
  </section>`, true);
}

function joinView(initialCode: string) {
  const code = normalizeCode(initialCode);
  beginView(`<section class="join-page"><div><p class="eyebrow">Guest device check</p><h1>Check this device.</h1><p class="lede">We’ll test this browser, local network, and chosen controls. Nothing is installed.</p><section id="network-discovery" class="network-discovery" aria-labelledby="discovery-title"><h2 id="discovery-title">Rooms on this network</h2><p id="discovery-status" role="status">Looking for rooms opened on the same network…</p><ul id="discovered-rooms" class="discovered-rooms"></ul><p>You can always enter the four-letter code below.</p></section></div><form id="join-form" class="join-form"><label for="room-code">Room code</label><input id="room-code" class="code-input" required minlength="4" maxlength="4" value="${escapeHtml(code)}" autocomplete="off"><label for="guest-name">Name shown to the host</label><input id="guest-name" required maxlength="28" autocomplete="nickname" placeholder="e.g. Sam"><fieldset><legend>What will you use to play?</legend><label class="choice"><input type="radio" name="input-kind" value="touch" checked><span><strong>Phone / touch</strong><small>Taps and swipes</small></span></label><label class="choice"><input type="radio" name="input-kind" value="keyboard"><span><strong>Keyboard</strong><small>Keys or laptop controls</small></span></label><label class="choice"><input type="radio" name="input-kind" value="gamepad"><span><strong>Gamepad</strong><small>Connected browser controller</small></span></label></fieldset><button class="primary" type="submit">Join and run checks</button><p id="notice" class="notice" role="alert" tabindex="-1" hidden></p></form></section>`);
  const codeInput = document.querySelector<HTMLInputElement>('#room-code')!;
  codeInput.addEventListener('input', () => { codeInput.value = normalizeCode(codeInput.value); });
  api.discover().then((rooms) => {
    const status = document.querySelector<HTMLElement>('#discovery-status');
    const list = document.querySelector<HTMLUListElement>('#discovered-rooms');
    if (!status || !list) return;
    status.textContent = rooms.length ? `${rooms.length} ${rooms.length === 1 ? 'room is' : 'rooms are'} available on this network.` : 'No rooms were found on this network.';
    list.innerHTML = rooms.map((room) => `<li><button type="button" data-room-code="${room.code}"><strong>${room.code}</strong><span>${escapeHtml(room.game_label || 'Unnamed activity')}</span></button></li>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-room-code]').forEach((button) => button.addEventListener('click', () => {
      codeInput.value = button.dataset.roomCode || '';
      codeInput.focus();
    }));
  }).catch(() => {
    const status = document.querySelector<HTMLElement>('#discovery-status');
    if (status) status.textContent = 'Network lookup is unavailable. Ask the host for the four-letter code.';
  });
  document.querySelector<HTMLFormElement>('#join-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector<HTMLButtonElement>('#join-form button')!;
    const kind = document.querySelector<HTMLInputElement>('input[name="input-kind"]:checked')!.value as InputKind;
    button.disabled = true; button.textContent = 'Checking the room…';
    try {
      const joined = await api.join(codeInput.value, document.querySelector<HTMLInputElement>('#guest-name')!.value, kind);
      const key = `guest:${codeInput.value}`;
      sessionStorage.setItem(key, JSON.stringify({ ...joined, kind, name: document.querySelector<HTMLInputElement>('#guest-name')!.value }));
      runGuestChecks(codeInput.value, joined.player_id, joined.player_token, kind);
    } catch (error) { notice((error as Error).message); button.disabled = false; button.textContent = 'Join and run checks'; }
  });
}

async function runGuestChecks(code: string, playerId: string, token: string, kind: InputKind) {
  let networkOk = false;
  try { networkOk = (await api.checkNetwork(code)).same_network; } catch { networkOk = false; }
  const browserOk = window.isSecureContext || ['localhost', '127.0.0.1'].includes(location.hostname);
  const inputOk = kind === 'touch' ? ('PointerEvent' in window && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches)) : kind === 'keyboard' ? true : !!navigator.getGamepads?.().some(Boolean);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canWake = 'wakeLock' in navigator;
  const inputNote = inputOk ? '' : kind === 'gamepad' ? 'Connect the gamepad and press any button, then retry practice.' : 'This device did not report touch input.';
  const state = { browser_ok: browserOk, input_ok: inputOk, network_ok: networkOk, practice_ok: false, screen_awake: false, note: !networkOk ? 'Join the host’s Wi-Fi or local network, then retry the checks.' : inputNote };
  const save = () => api.updatePlayer(code, playerId, { player_token: token, ...state }).catch((error) => notice((error as Error).message));
  await save();
  beginView(`<section class="guest-check"><div class="guest-intro"><p class="eyebrow">Room ${escapeHtml(code)} · ${escapeHtml(inputLabel(kind))}</p><h1>Device check.</h1><p>Measured on this device. The host sees results, not browser details or contact information.</p></div><div class="check-grid"><section><h2>Automatic checks</h2><ul class="check-list"><li class="${browserOk ? 'pass' : 'fail'}"><span aria-hidden="true">${browserOk ? '✓' : '!'}</span><div><strong>Secure browser</strong><p>${browserOk ? 'This page can use modern device features.' : 'Open the HTTPS join link instead of an embedded browser.'}</p></div></li><li class="${networkOk ? 'pass' : 'fail'}"><span aria-hidden="true">${networkOk ? '✓' : '!'}</span><div><strong>Same local network</strong><p>${networkOk ? 'This device uses the same network gateway as the host.' : 'Join the host’s Wi-Fi or local network, then retry.'}</p></div></li><li class="${inputOk ? 'pass' : 'fail'}"><span aria-hidden="true">${inputOk ? '✓' : '!'}</span><div><strong>${escapeHtml(inputLabel(kind))}</strong><p>${inputOk ? 'The browser reports this input.' : 'The browser cannot see this input yet.'}</p></div></li><li class="pass"><span aria-hidden="true">✓</span><div><strong>${reduced ? 'Reduced motion on' : 'Standard motion'}</strong><p>${reduced ? 'Practice uses instant, non-moving feedback.' : 'No continuous animation is used.'}</p></div></li></ul><p class="check-caveat">Network matching compares the host and guest gateway. VPNs and some mobile networks can affect the result.</p><button id="retry" class="secondary" type="button">Retry automatic checks</button></section><section><h2>Keep the screen on</h2><p>${canWake ? 'Allow screen wake during setup so this device stays ready.' : 'This browser cannot request screen wake. You can confirm you’ll keep it awake manually.'}</p><button id="wake" class="secondary" type="button">${canWake ? 'Keep screen awake' : 'I’ll keep it awake'}</button><p id="wake-result" class="inline-result" role="status"></p></section></div><section class="practice"><p class="eyebrow">No-install input practice</p><h2>Test three inputs.</h2><p id="practice-help">${kind === 'touch' ? 'Tap or swipe in the test area.' : kind === 'keyboard' ? 'Focus the test area and press any three letter or arrow keys.' : 'Connect a controller and press any three buttons.'}</p><div id="practice-pad" class="practice-pad" tabindex="0" role="application" aria-describedby="practice-help practice-count"><div class="floor-lines" aria-hidden="true"></div><strong id="practice-count" aria-live="polite">0 of 3</strong><span>${kind === 'touch' ? 'Tap / swipe here' : kind === 'keyboard' ? 'Press keys here' : 'Press controller buttons'}</span></div><p id="practice-result" class="notice success" role="status" hidden></p></section><div class="guest-finish"><a class="secondary button-link" href="/" data-link>Done on this device</a><p id="notice" class="notice" role="alert" tabindex="-1" hidden></p></div></section>`);
  let wakeLock: WakeLockSentinel | undefined;
  document.querySelector('#wake')!.addEventListener('click', async () => {
    try {
      if (canWake) wakeLock = await navigator.wakeLock.request('screen');
      state.screen_awake = true; await save();
      document.querySelector('#wake-result')!.textContent = canWake ? 'Screen wake is active while this page stays open.' : 'Reminder set: keep this screen awake until the game begins.';
    } catch { document.querySelector('#wake-result')!.textContent = 'Screen wake was blocked. Keep this page visible or change your device timeout.'; }
  });
  document.querySelector('#retry')!.addEventListener('click', () => runGuestChecks(code, playerId, token, kind));
  let count = 0;
  const seenGamepad = new Set<number>();
  const pad = document.querySelector<HTMLElement>('#practice-pad')!;
  const advance = async () => {
    if (count >= 3) return;
    count += 1; document.querySelector('#practice-count')!.textContent = `${count} of 3`;
    if (count === 3) { state.practice_ok = true; if (kind !== 'touch' || inputOk) state.input_ok = true; state.note = state.network_ok && state.input_ok ? '' : state.note; await save(); const result = document.querySelector<HTMLElement>('#practice-result')!; result.hidden = false; result.textContent = 'Practice passed. This device is ready when it matches the host’s setup.'; }
  };
  if (kind === 'touch') pad.addEventListener('pointerup', (event) => { if (authenticPracticeInput(kind, event)) advance(); });
  if (kind === 'keyboard') pad.addEventListener('keydown', (event) => { if (authenticPracticeInput(kind, event)) advance(); });
  let gamepadFrame = 0;
  if (kind === 'gamepad') {
    const poll = () => { navigator.getGamepads?.().forEach((gamepad) => gamepad?.buttons.forEach((button, index) => { if (button.pressed && !seenGamepad.has(index) && authenticPracticeInput(kind, 'gamepad')) { seenGamepad.add(index); advance(); } if (!button.pressed) seenGamepad.delete(index); })); gamepadFrame = requestAnimationFrame(poll); }; poll();
  }
  cleanupView = () => { if (gamepadFrame) cancelAnimationFrame(gamepadFrame); wakeLock?.release().catch(() => {}); };
}

function legalView(kind: 'privacy' | 'terms') {
  const privacy = `<p class="eyebrow">Privacy policy · August 30, 2026</p><h1>Privacy policy.</h1><p>Room Ready does not ask for an account, email address, or contact details. It does not use advertising cookies, analytics trackers, or third-party scripts.</p><h2>What a room stores</h2><p>The service temporarily stores the room code, optional game label, guest display names, chosen input type, and pass/fail preflight results. A private host token and guest update tokens authorize changes. Rooms and guest records expire after six hours.</p><h2>Local network matching</h2><p>The service converts the host’s network address into a keyed, one-way match value. It uses that value to find rooms and compare a guest’s network. The room record does not store the raw address. VPNs and some mobile networks can affect the result.</p><h2>On your device</h2><p>Host and guest tokens live in session storage and disappear when the browser session ends. Your large-text preference uses local storage. Device checks report results, not browser models, controller identities, or contacts.</p><h2>Operations</h2><p>Standard server logs may temporarily contain request time, path, status and network address for reliability and abuse prevention. We do not sell or profile this information.</p>`;
  const terms = `<p class="eyebrow">Plain-language terms · August 27, 2026</p><h1>Terms of use.</h1><p>Room Ready is a free setup aid for checking browser, network and input readiness before a group activity. Use it lawfully and do not attempt to disrupt the service or other rooms.</p><h2>No compatibility guarantee</h2><p>A passed preflight means the checks shown passed in this browser. It does not certify any specific game, casting system, local network, controller, or venue. The host is responsible for choosing accurate session requirements and testing the actual activity.</p><h2>Availability</h2><p>The service is provided “as is,” without warranties. Rooms are temporary and may be removed for security, maintenance, or misuse. Do not store important information in a room.</p><h2>Content and license</h2><p>You retain responsibility for names and labels you enter. The Room Ready software and original project assets are available under the MIT License in the repository.</p>`;
  beginView(`<article class="legal">${kind === 'privacy' ? privacy : terms}<p><a href="/" data-link>← Back to Room Ready</a></p></article>`);
}

function render() {
  const params = new URLSearchParams(location.search);
  if (location.pathname === '/host') {
    updateMetadata('Host room — Room Ready', 'Watch guest device, network, and input checks from one temporary room.');
    hostView(normalizeCode(params.get('room') || ''));
  } else if (location.pathname === '/join') {
    updateMetadata('Join a room — Room Ready', 'Find a local room or enter its four-letter code, then check this device.');
    joinView(params.get('room') || '');
  } else if (location.pathname === '/demo' || params.get('demo') === '1') {
    updateMetadata('Demo — Room Ready', 'Explore a ready room with four sample guests without saving data.');
    demoView();
  } else if (location.pathname === '/privacy') {
    updateMetadata('Privacy — Room Ready', 'Read what temporary room data Room Ready stores and when it expires.');
    legalView('privacy');
  } else if (location.pathname === '/terms') {
    updateMetadata('Terms — Room Ready', 'Read the terms for using Room Ready as a free group setup aid.');
    legalView('terms');
  } else if (location.pathname === '/') {
    updateMetadata('Room Ready — check game devices before guests arrive', 'Check phones, controllers, local network, and the shared display before a group game starts.');
    homeView();
  } else {
    updateMetadata('Page not found — Room Ready', 'This Room Ready page does not exist. Return home to open or join a room.');
    beginView(`<section class="center-state not-found"><p class="eyebrow">404 · Page not found</p><h1>We couldn’t find this page.</h1><p>The address may be wrong, or the page may have moved.</p><a class="primary button-link" href="/" data-link>Return home</a></section>`);
  }
}

addEventListener('popstate', () => { routeFocusPending = true; render(); });
document.querySelector<HTMLAnchorElement>('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  history.replaceState(history.state, '', `${location.pathname}${location.search}#main`);
  document.querySelector<HTMLElement>('#main')?.focus();
});
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
