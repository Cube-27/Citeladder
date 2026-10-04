import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { terminalPassword } from '../src/cli/terminal-password.ts';

function terminal() {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode: vi.fn(),
  });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  let displayed = '';
  output.on('data', (chunk: Buffer) => {
    displayed += chunk.toString();
  });
  return { input, output, displayed: () => displayed };
}

it('preserves multibyte passwords split at every byte, handles backspace as a character and never echoes', async () => {
  const { input, output, displayed } = terminal();
  const password = terminalPassword('Password', input, output);
  for (const byte of Buffer.from('päss🔒\b字word\r')) input.write(Buffer.from([byte]));
  await expect(password).resolves.toBe('päss字word');
  expect(displayed()).toBe('Password: \n');
  expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
  expect(input.listenerCount('data')).toBe(0);
});

it.each(['\u0003', '\u0004', 'end', 'error', 'invalid-utf8'])(
  'restores a pre-existing raw terminal and removes listeners on %s',
  async (exit) => {
    const { input, output, displayed } = terminal();
    input.isRaw = true;
    const password = terminalPassword('Password', input, output);
    input.write('secret');
    if (exit === 'end') input.end();
    else if (exit === 'error') input.emit('error', new Error('input disconnected'));
    else if (exit === 'invalid-utf8') input.write(Buffer.from([0xff]));
    else input.write(exit);
    await expect(password).rejects.toThrow();
    expect(input.setRawMode.mock.calls).toEqual([[true], [true]]);
    expect(displayed()).toBe('Password: \n');
    expect(input.listenerCount('data')).toBe(0);
    expect(input.listenerCount('end')).toBe(0);
    expect(input.listenerCount('error')).toBe(0);
  },
);

it('refuses redirected password input before reading or writing', async () => {
  const { input, output, displayed } = terminal();
  input.isTTY = false;
  await expect(terminalPassword('Password', input, output)).rejects.toThrow('interactive terminal');
  expect(input.setRawMode).not.toHaveBeenCalled();
  expect(displayed()).toBe('');
});
