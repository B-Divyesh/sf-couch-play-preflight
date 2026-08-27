import { describe, expect, it } from 'vitest';
import { normalizeCode, playerReady, readiness, type Player, type Room } from './model';

const room: Room = { code: 'ABCD', created_at: '', expires_at: '', game_label: '', accepted_inputs: 'touch,gamepad', display_ready: true };
const player: Player = { id: '1', name: 'Ari', input_kind: 'touch', browser_ok: true, input_ok: true, network_ok: true, practice_ok: true, screen_awake: false, note: '', updated_at: '' };

describe('preflight model', () => {
  it('normalizes manual codes', () => expect(normalizeCode('a 1b-cde')).toBe('ABCDE'.slice(0, 4)));
  it('requires measured checks and an accepted input', () => {
    expect(playerReady(player, room)).toBe(true);
    expect(playerReady({ ...player, input_kind: 'keyboard' }, room)).toBe(false);
    expect(playerReady({ ...player, practice_ok: false }, room)).toBe(false);
  });
  it('requires a display and at least one ready guest', () => {
    expect(readiness({ room, players: [] }).roomReady).toBe(false);
    expect(readiness({ room, players: [player] }).roomReady).toBe(true);
  });
});
