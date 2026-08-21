export async function closeQuietly(resource: { close(): Promise<void> } | undefined): Promise<void> {
  if (!resource) return;
  try {
    await resource.close();
  } catch {
    // Cleanup must not mask the original request error.
  }
}

export async function withClosableResources<T extends { close(): Promise<void> }>(
  resources: T[],
  work: () => Promise<void>
): Promise<void> {
  try {
    await work();
  } finally {
    for (const resource of [...resources].reverse()) {
      await closeQuietly(resource);
    }
  }
}

export function safeHttpErrorMessage(): string {
  return "request failed";
}
