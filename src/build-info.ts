export function buildCommit(): string {
  const value = process.env.RPM_BUILD_COMMIT?.trim();
  return value ? value : "unknown";
}
