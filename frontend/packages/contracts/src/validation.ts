import { z } from 'zod';

export function strictValidate<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`API validation failure in ${context}: ${result.error.message}`);
  }
  return result.data;
}
