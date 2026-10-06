import { FREE_TOOL_LIMITS } from '@/lib/config/free-tools';

export function boundedText(text: string, limit: number = FREE_TOOL_LIMITS.text) {
  if (text.length > limit)
    throw new Error(
      `Input exceeds ${limit.toLocaleString()} characters. Split it into smaller files.`,
    );
  return text.trim();
}

export function webUrl(value: string) {
  const text = boundedText(value, FREE_TOOL_LIMITS.field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Enter a complete http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  return url.href;
}

export async function readToolFile(file: File) {
  if (file.size > FREE_TOOL_LIMITS.fileBytes)
    throw new Error('Choose an uncompressed UTF-8 XML file smaller than 1 MB.');
  const bytes = await file.arrayBuffer();
  try {
    return boundedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('Use valid UTF-8 XML within the 200,000-character limit.');
  }
}
