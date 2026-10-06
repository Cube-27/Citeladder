/** Browser form bounds; the API remains authoritative at submission. */
export const authFormPolicy = { passwordMinLength: 8, passwordMaxLength: 128 } as const;
export const passwordHint = `At least ${authFormPolicy.passwordMinLength} characters`;
