export type InputKind = 'touch' | 'keyboard' | 'gamepad';

export interface Player {
  id: string;
  name: string;
  input_kind: InputKind;
  browser_ok: boolean;
  input_ok: boolean;
  network_ok: boolean;
  practice_ok: boolean;
  screen_awake: boolean;
  note: string;
  updated_at: string;
}

export interface Room {
  code: string;
  created_at: string;
  expires_at: string;
  game_label: string;
  accepted_inputs: string;
  display_ready: boolean;
}

export function authenticPracticeInput(kind: InputKind, event: Pick<PointerEvent, 'pointerType'> | KeyboardEvent | 'gamepad'): boolean {
  if (kind === 'touch') return typeof event !== 'string' && 'pointerType' in event && event.pointerType === 'touch';
  if (kind === 'keyboard') return event instanceof KeyboardEvent && !event.repeat && (event.key.length === 1 || event.key.startsWith('Arrow'));
  return event === 'gamepad';
}

export interface Snapshot { room: Room; players: Player[] }

export function acceptedInputs(room: Room): InputKind[] {
  return room.accepted_inputs.split(',').filter(Boolean) as InputKind[];
}

export function playerReady(player: Player, room: Room): boolean {
  return player.browser_ok && player.input_ok && player.network_ok && player.practice_ok && acceptedInputs(room).includes(player.input_kind);
}

export function readiness(snapshot: Snapshot) {
  const ready = snapshot.players.filter((p) => playerReady(p, snapshot.room)).length;
  const needsHelp = snapshot.players.length - ready;
  return {
    ready,
    needsHelp,
    total: snapshot.players.length,
    roomReady: snapshot.players.length > 0 && needsHelp === 0 && snapshot.room.display_ready,
  };
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function inputLabel(input: InputKind): string {
  return { touch: 'Phone / touch', keyboard: 'Keyboard', gamepad: 'Gamepad' }[input];
}
