function continuationParameter(pathname: string): string | undefined {
  if (pathname === '/mcp/oauth/consent') return 'transaction';
  if (pathname === '/invitations/accept') return 'token';
  return undefined;
}

/** Reconstruct an allowlisted app-relative destination; never forward opaque URLs. */
export function safeAuthReturnPath(value: string | null | undefined): string | undefined {
  if (
    !value ||
    value.length > 1024 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('#') ||
    value.includes('\\')
  )
    return undefined;
  const url = new URL(value, 'https://citeladder.invalid');
  const parameter = continuationParameter(url.pathname);
  if (
    !parameter ||
    url.origin !== 'https://citeladder.invalid' ||
    [...url.searchParams.keys()].length !== 1
  )
    return undefined;
  const token = url.searchParams.get(parameter);
  if (!token || !/^[A-Za-z0-9_-]{1,256}$/.test(token)) return undefined;
  return `${url.pathname}?${parameter}=${encodeURIComponent(token)}`;
}

export function withAuthReturnPath(destination: string, returnTo: string | undefined): string {
  const safe = safeAuthReturnPath(returnTo);
  if (!safe) return destination;
  const separator = destination.includes('?') ? '&' : '?';
  return `${destination}${separator}return_to=${encodeURIComponent(safe)}`;
}
