import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SECRETS_DIR = '/run/secrets';

// Loads Docker secrets into process.env.
// Environment variables take precedence over secret files.
export function loadDockerSecrets(): void {
  if (!existsSync(SECRETS_DIR)) {
    return;
  }

  try {
    const secretFiles = readdirSync(SECRETS_DIR);

    for (const filename of secretFiles) {
      if (process.env[filename] !== undefined) {
        continue;
      }

      try {
        const secretPath = join(SECRETS_DIR, filename);
        const stats = statSync(secretPath);

        if (stats.isDirectory()) {
          continue;
        }

        const secretValue = readFileSync(secretPath, 'utf-8').trim();
        process.env[filename] = secretValue;
      } catch (error) {
        console.error(`Failed to load secret ${filename}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to load Docker secrets:', error);
  }
}