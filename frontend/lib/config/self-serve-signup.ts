export function selfServeSignupOpen(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP === 'true';
}
