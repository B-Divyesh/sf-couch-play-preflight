import QRCode from 'qrcode';
import './style.css';
import { api } from './api';
import { acceptedInputs, inputLabel, normalizeCode, playerReady, readiness, type InputKind, type Player, type Snapshot } from './model';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanupView = () => {};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function shell(content: string): string {
  return `<div class="offline-ribbon" role="status" aria-live="polite" hidden>You’re offline. Existing results stay visible; updates will retry when you reconnect.</div>
    <header class="site-header">
      <a class="wordmark" href="/" data-link aria-label="Room Ready home"><span aria-hidden="true">◉</span> Room Ready</a>
      <nav aria-label="Utility"><button class="text-button" id="text-size" type="button" aria-pressed="false">Large text</button></nav>
    </header>
    <main id="main">${content}</main>
    <footer><p>Room Ready is free, local-first preflight—not a game compatibility promise.</p><p><a href="/privacy" data-link>Privacy</a> <a href="/terms" data-link>Terms</a> · Original AI-assisted scene, 2026.</p></footer>`;
}

function bindGlobal() {
  document.querySelectorAll<HTMLAnchorElement>('[data-link]').forEach((link) => link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || link.target) return;
    event.preventDefault();
    navigate(new URL(link.href).pathname + new URL(link.href).search);
  }));
  const large = localStorage.getItem('room-ready-large') === 'true';
  document.documentElement.classList.toggle('large-text', large);
  const sizeButton = document.querySelector<HTMLButtonElement>('#text-size');
  if (sizeButton) {
    sizeButton.setAttribute('aria-pressed', String(large));
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
}

let viewSignal = new AbortController();
function beginView(html: string) {
  cleanupView();
  viewSignal.abort();
  viewSignal = new AbortController();
  root.innerHTML = shell(html);
  bindGlobal();
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function navigate(path: string) {
  history.pushState({}, '', path);
  render();
}

function notice(message: string, kind: 'error' | 'success' = 'error') {
  const target = document.querySelector<HTMLElement>('#notice');
  if (target) { target.className = `notice ${kind}`; target.textContent = message; target.hidden = false; target.focus(); }
}

function homeView() {
  beginView(`<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Party-game preflight</p>
      <h1>Everyone ready<br><em>before</em> game time.</h1>
      <p class="lede">Check phones, controllers, Wi‑Fi and the big screen in one calm rehearsal. No app. No account. No guest left debugging in front of the room.</p>
      <form id="open-form" class="open-form">
        <label for="game">What are you playing? <span>Optional</span></label>
        <input id="game" name="game" maxlength="60" autocomplete="off" placeholder="e.g. browser trivia" />
        <button class="primary" type="submit">Open a test room <span aria-hidden="true">→</span></button>
      </form>
      <p id="notice" class="notice" role="alert" tabindex="-1" hidden></p>
    </div>
    <figure class="hero-art"><picture><source media="(max-width: 960px)" srcset="/assets/room-ready-hero-960.webp"><img src="/assets/room-ready-hero-1536.webp" width="1536" height="1024" alt="An empty, warmly lit living room arranged with chairs, phones and controllers facing a blank television" fetchpriority="high" decoding="async"></picture><figcaption>Set the room while it’s still quiet.</figcaption></figure>
  </section>
  <section class="join-strip" aria-labelledby="join-title">
    <div><p class="eyebrow">Already invited?</p><h2 id="join-title">Join with the four-letter room code.</h2></div>
    <form id="quick-join" class="code-form"><label class="sr-only" for="quick-code">Room code</label><input id="quick-code" class="code-input" maxlength="4" inputmode="text" autocomplete="off" aria-describedby="code-hint" placeholder="ROOM"><button type="submit" class="secondary">Run my check</button><span id="code-hint">Letters only</span></form>
  </section>
  <section class="how" aria-labelledby="how-title"><p class="eyebrow">One room, three signals</p><h2 id="how-title">Know what will work—without pretending we tested your game.</h2><ol><li><span>01</span><strong>Invite</strong><p>Share the QR or manual code from any screen.</p></li><li><span>02</span><strong>Rehearse</strong><p>Each guest checks connection and their chosen input.</p></li><li><span>03</span><strong>Call ready</strong><p>See measured checks and fix only what needs attention.</p></li></ol></section>`);
  document.querySelector<HTMLFormElement>('#open-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector<HTMLButtonElement>('#open-form button')!;
    button.disabled = true; button.textContent = 'Opening the room…';
    try {
      const created = await api.create((document.querySelector<HTMLInputElement>('#game')!).value);
      sessionStorage.setItem(`host:${created.code}`, created.host_token);
      navigate(`/host?room=${created.code}`);
    } catch (error) { notice((error as Error).message); button.disabled = false; button.textContent = 'Open a test room →'; }
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
  beginView(`<section class="loading-state"><p class="eyebrow">Room ${escapeHtml(code)}</p><h1>Bringing up the room lights…</h1><p>Loading the latest guest checks.</p></section>`);
  if (!token) {
    beginView(`<section class="center-state"><p class="eyebrow">Host access</p><h1>This host key isn’t on this device.</h1><p>For guest privacy, host keys stay only in the tab that opened the room. Return to that device, or open a new room.</p><a class="primary button-link" href="/" data-link>Open a new room</a></section>`);
    return;
  }
  let timer = 0;
  const paint = async (first = false) => {
    try {
      const snapshot = await api.get(code);
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
  if (!snapshot.players.length) return `<div class="empty-bench"><span aria-hidden="true">⌁</span><h3>The bench is empty.</h3><p>Put the join card on screen or ask guests to enter <strong>${snapshot.room.code}</strong>.</p></div>`;
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
    <div class="host-title"><p class="eyebrow">Host board · expires in six hours</p><h1>Get the room ready.</h1><p>${snapshot.room.game_label ? `Preflight for <strong>${escapeHtml(snapshot.room.game_label)}</strong>.` : 'Set what this session needs, then invite the room.'}</p></div>
    <aside class="join-card" aria-label="Guest join card"><p>Join the room</p><strong class="room-code">${snapshot.room.code}</strong><img id="qr" width="184" height="184" alt="QR code for the Room Ready guest join page"><p class="join-url">${escapeHtml(joinUrl.replace(/^https?:\/\//, ''))}</p><div class="button-pair"><button id="copy-link" class="secondary" type="button">Copy join link</button><button id="present" class="secondary" type="button">TV view</button></div></aside>
  </section>
  <section class="host-grid">
    <div><div class="section-heading"><div><p class="eyebrow">Guest bench</p><h2>Phones & controllers</h2></div><button id="print-card" class="text-button" type="button">Print join card</button></div><div id="roster">${rosterHtml(snapshot)}</div></div>
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

function joinView(initialCode: string) {
  const code = normalizeCode(initialCode);
  beginView(`<section class="join-page"><div><p class="eyebrow">Guest preflight</p><h1>Check your seat.</h1><p class="lede">This takes about one minute. We’ll test this browser and your chosen controls—nothing is installed or saved after the room expires.</p></div><form id="join-form" class="join-form"><label for="room-code">Room code</label><input id="room-code" class="code-input" required minlength="4" maxlength="4" value="${escapeHtml(code)}" autocomplete="off"><label for="guest-name">Name shown to the host</label><input id="guest-name" required maxlength="28" autocomplete="nickname" placeholder="e.g. Sam"><fieldset><legend>What will you use to play?</legend><label class="choice"><input type="radio" name="input-kind" value="touch" checked><span><strong>Phone / touch</strong><small>Taps and swipes</small></span></label><label class="choice"><input type="radio" name="input-kind" value="keyboard"><span><strong>Keyboard</strong><small>Keys or laptop controls</small></span></label><label class="choice"><input type="radio" name="input-kind" value="gamepad"><span><strong>Gamepad</strong><small>Connected browser controller</small></span></label></fieldset><button class="primary" type="submit">Join and run checks</button><p id="notice" class="notice" role="alert" tabindex="-1" hidden></p></form></section>`);
  const codeInput = document.querySelector<HTMLInputElement>('#room-code')!;
  codeInput.addEventListener('input', () => { codeInput.value = normalizeCode(codeInput.value); });
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
  try { const start = performance.now(); await fetch('/health', { cache: 'no-store' }); networkOk = performance.now() - start < 5000; } catch { networkOk = false; }
  const browserOk = window.isSecureContext || ['localhost', '127.0.0.1'].includes(location.hostname);
  const inputOk = kind === 'touch' ? ('PointerEvent' in window && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches)) : kind === 'keyboard' ? true : !!navigator.getGamepads?.().some(Boolean);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canWake = 'wakeLock' in navigator;
  const state = { browser_ok: browserOk, input_ok: inputOk, network_ok: networkOk, practice_ok: false, screen_awake: false, note: inputOk ? '' : kind === 'gamepad' ? 'Connect the gamepad and press any button, then retry practice.' : 'This device did not report touch input.' };
  const save = () => api.updatePlayer(code, playerId, { player_token: token, ...state }).catch((error) => notice((error as Error).message));
  await save();
  beginView(`<section class="guest-check"><div class="guest-intro"><p class="eyebrow">Room ${escapeHtml(code)} · ${escapeHtml(inputLabel(kind))}</p><h1>Your seat check.</h1><p>Measured on this device. The host sees the results, not browser details or contact information.</p></div><div class="check-grid"><section><h2>Automatic checks</h2><ul class="check-list"><li class="${browserOk ? 'pass' : 'fail'}"><span aria-hidden="true">${browserOk ? '✓' : '!'}</span><div><strong>Secure browser</strong><p>${browserOk ? 'This page can use modern device features.' : 'Open the HTTPS join link instead of an embedded browser.'}</p></div></li><li class="${networkOk ? 'pass' : 'fail'}"><span aria-hidden="true">${networkOk ? '✓' : '!'}</span><div><strong>Room connection</strong><p>${networkOk ? 'Updates reached the host service.' : 'Reconnect to Wi‑Fi, then retry below.'}</p></div></li><li class="${inputOk ? 'pass' : 'fail'}"><span aria-hidden="true">${inputOk ? '✓' : '!'}</span><div><strong>${escapeHtml(inputLabel(kind))}</strong><p>${inputOk ? 'The browser reports this input.' : 'The browser cannot see this input yet.'}</p></div></li><li class="pass"><span aria-hidden="true">✓</span><div><strong>${reduced ? 'Reduced motion on' : 'Standard motion'}</strong><p>${reduced ? 'Practice uses instant, non-moving feedback.' : 'No continuous animation is used.'}</p></div></li></ul><button id="retry" class="secondary" type="button">Retry automatic checks</button></section><section><h2>Keep the screen present</h2><p>${canWake ? 'Allow screen wake during setup so your seat does not disappear.' : 'This browser cannot request screen wake. You can confirm you’ll keep it awake manually.'}</p><button id="wake" class="secondary" type="button">${canWake ? 'Keep screen awake' : 'I’ll keep it awake'}</button><p id="wake-result" class="inline-result" role="status"></p></section></div><section class="practice"><p class="eyebrow">No-install rehearsal</p><h2>Make three inputs.</h2><p id="practice-help">${kind === 'touch' ? 'Tap or swipe anywhere in the rehearsal floor.' : kind === 'keyboard' ? 'Focus the floor and press any three letter or arrow keys.' : 'Connect a controller and press any three buttons.'}</p><div id="practice-pad" class="practice-pad" tabindex="0" role="application" aria-describedby="practice-help practice-count"><div class="floor-lines" aria-hidden="true"></div><strong id="practice-count" aria-live="polite">0 of 3</strong><span>${kind === 'touch' ? 'Tap / swipe here' : kind === 'keyboard' ? 'Press keys here' : 'Press controller buttons'}</span></div><p id="practice-result" class="notice success" role="status" hidden></p></section><div class="guest-finish"><a class="secondary button-link" href="/" data-link>Done on this device</a><p id="notice" class="notice" role="alert" tabindex="-1" hidden></p></div></section>`);
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
    if (count === 3) { state.practice_ok = true; state.input_ok = true; state.note = ''; await save(); const result = document.querySelector<HTMLElement>('#practice-result')!; result.hidden = false; result.textContent = 'Practice passed. Your seat now shows ready when it fits the host’s setup.'; }
  };
  if (kind === 'touch') pad.addEventListener('pointerup', advance);
  if (kind === 'keyboard') pad.addEventListener('keydown', (event) => { if (!event.repeat && (event.key.length === 1 || event.key.startsWith('Arrow'))) advance(); });
  let gamepadFrame = 0;
  if (kind === 'gamepad') {
    const poll = () => { navigator.getGamepads?.().forEach((gamepad) => gamepad?.buttons.forEach((button, index) => { if (button.pressed && !seenGamepad.has(index)) { seenGamepad.add(index); advance(); } if (!button.pressed) seenGamepad.delete(index); })); gamepadFrame = requestAnimationFrame(poll); }; poll();
  }
  cleanupView = () => { if (gamepadFrame) cancelAnimationFrame(gamepadFrame); wakeLock?.release().catch(() => {}); };
}

function legalView(kind: 'privacy' | 'terms') {
  const privacy = `<p class="eyebrow">Plain-language policy · August 27, 2026</p><h1>Privacy, kept short.</h1><p>Room Ready does not ask for an account, email address, or contact details. It does not use advertising cookies, analytics trackers, or third-party scripts.</p><h2>What a room stores</h2><p>The service temporarily stores the room code, optional game label, guest display names, chosen input type, and pass/fail preflight results. A private host token and guest update tokens authorize changes. Rooms and their guest records expire after six hours.</p><h2>On your device</h2><p>Host and guest tokens live in session storage and disappear when the browser session ends. Your large-text preference uses local storage. Device checks report only a result—not model, IP address, controller identity, or contacts.</p><h2>Operations</h2><p>Standard server logs may temporarily contain request time, path, status and network address for reliability and abuse prevention. We do not sell or profile this information.</p>`;
  const terms = `<p class="eyebrow">Plain-language terms · August 27, 2026</p><h1>Terms of use.</h1><p>Room Ready is a free setup aid for checking browser, network and input readiness before a group activity. Use it lawfully and do not attempt to disrupt the service or other rooms.</p><h2>No compatibility guarantee</h2><p>A passed preflight means the checks shown passed in this browser. It does not certify any specific game, casting system, local network, controller, or venue. The host is responsible for choosing accurate session requirements and testing the actual activity.</p><h2>Availability</h2><p>The service is provided “as is,” without warranties. Rooms are temporary and may be removed for security, maintenance, or misuse. Do not store important information in a room.</p><h2>Content and license</h2><p>You retain responsibility for names and labels you enter. The Room Ready software and original project assets are available under the MIT License in the repository.</p>`;
  beginView(`<article class="legal">${kind === 'privacy' ? privacy : terms}<p><a href="/" data-link>← Back to Room Ready</a></p></article>`);
}

function render() {
  const params = new URLSearchParams(location.search);
  if (location.pathname === '/host') hostView(normalizeCode(params.get('room') || ''));
  else if (location.pathname === '/join') joinView(params.get('room') || '');
  else if (location.pathname === '/privacy') legalView('privacy');
  else if (location.pathname === '/terms') legalView('terms');
  else homeView();
}

addEventListener('popstate', render);
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
