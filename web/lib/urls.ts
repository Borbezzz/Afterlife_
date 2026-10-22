/** Only allow public web links from imported project/profile data. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function githubProfileUrl(login: string | null | undefined): string | null {
  return login && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)
    ? `https://github.com/${login}`
    : null;
}

export function githubRepositoryUrl(repository: string | null | undefined): string | null {
  if (!repository) return null;
  const parts = repository.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  return githubProfileUrl(owner) && name && /^[\w.-]{1,100}$/.test(name) && name !== "." && name !== ".."
    ? `https://github.com/${owner}/${name}`
    : null;
}
