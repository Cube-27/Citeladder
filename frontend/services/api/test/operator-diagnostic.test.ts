import { describe, expect, it } from 'vitest';

import { PlatformAdminRequired } from '../src/auth/operators.ts';
import { OperatorRefusal, operatorDiagnostic } from '../src/cli/operator.ts';
import { ApiError } from '../src/errors.ts';

describe('operator CLI diagnostics', () => {
  it('names the admin refusal by its type, whatever its wording', () => {
    expect(operatorDiagnostic(new PlatformAdminRequired())).toBe('active_admin_required');
  });

  it('prints an API refusal by its declared code, never its sentence', () => {
    const refusal = new ApiError(409, 'A grant to revoke was not found on this account.', {
      code: 'grant_not_found',
    });
    expect(operatorDiagnostic(refusal)).toBe('grant_not_found');
  });

  it('prints reviewed text and slugs, and only the type of anything else', () => {
    expect(operatorDiagnostic(new OperatorRefusal('DATABASE_URL is required.'))).toBe(
      'DATABASE_URL is required.',
    );
    expect(operatorDiagnostic(new Error('reason_required'))).toBe('reason_required');
    expect(operatorDiagnostic(new TypeError('secret input echoed here'))).toBe('TypeError');
  });
});
