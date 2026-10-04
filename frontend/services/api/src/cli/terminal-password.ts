import type { Readable, Writable } from 'node:stream';

type TerminalInput = Readable & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode: (mode: boolean) => unknown;
};
type TerminalOutput = Writable & { isTTY?: boolean };

/** Decode complete UTF-8 characters without echo and restore terminal state on every exit. */
export async function terminalPassword(
  label: string,
  input: TerminalInput = process.stdin,
  output: TerminalOutput = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new Error('Passwords require an interactive terminal');
  const wasRaw = input.isRaw ?? false;
  output.write(`${label}: `);
  input.setRawMode(true);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const characters: string[] = [];
  let receive: (chunk: Buffer) => void;
  let interrupted: () => void;
  let failed: (error: Error) => void;
  try {
    return await new Promise<string>((resolve, reject) => {
      interrupted = () => reject(new Error('Password input cancelled'));
      failed = reject;
      receive = (chunk) => {
        let decoded: string;
        try {
          decoded = decoder.decode(chunk, { stream: true });
        } catch {
          reject(new Error('Password input is not valid UTF-8'));
          return;
        }
        for (const character of decoded) {
          if (character === '\u0003' || character === '\u0004') {
            interrupted();
            return;
          }
          if (character === '\r' || character === '\n') {
            resolve(characters.join(''));
            return;
          }
          if (character === '\u007f' || character === '\b') characters.pop();
          else if (character >= ' ') characters.push(character);
        }
      };
      input.on('data', receive);
      input.on('end', interrupted);
      input.on('error', failed);
      input.resume();
    });
  } finally {
    input.off('data', receive!);
    input.off('end', interrupted!);
    input.off('error', failed!);
    input.setRawMode(wasRaw);
    input.pause();
    output.write('\n');
  }
}
