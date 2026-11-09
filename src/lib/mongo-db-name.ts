const LEGACY_DEFAULT_DB_NAME = "prod";

export function databaseNameFromMongoUri(uri: string): string | undefined {
  const match = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^/?#]+)/);
  const segment = match?.[1];
  if (!segment) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Resolves which MongoDB database name to use. Prefer an explicit env var so
 * local dev and production cannot silently share one name when the URI omits a path.
 */
export function resolveMongoDbName(
  mongoUri: string | undefined,
  explicitDbName: string | undefined = process.env.MONGODB_DB_NAME,
): string {
  const explicit = explicitDbName?.trim();
  if (explicit) {
    return explicit;
  }

  if (mongoUri) {
    const fromUri = databaseNameFromMongoUri(mongoUri);
    if (fromUri) {
      return fromUri;
    }
  }

  return LEGACY_DEFAULT_DB_NAME;
}
