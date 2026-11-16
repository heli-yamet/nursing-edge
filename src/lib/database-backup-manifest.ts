import manifest from "../../scripts/mongo-backup-manifest.json";

type ManifestCategory = {
  description: string;
  collections: string[];
};

type BackupManifestFile = {
  version: number;
  categories: Record<string, ManifestCategory>;
};

const file = manifest as BackupManifestFile;

export function backupCollectionNames(): string[] {
  const names: string[] = [];
  for (const block of Object.values(file.categories)) {
    for (const name of block.collections) {
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names.sort();
}

export function backupManifestVersion(): number {
  return file.version;
}