import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initIndicatorStorage,
  storeIndicatorEvent,
  getIndicatorDatabasePath,
} from '../server/indicatorStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.resolve(__dirname, '../data');
const logFilePath = path.join(dataDirectory, 'zapier-log.json');

const loadLogEntries = async () => {
  try {
    const content = await fs.readFile(logFilePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[backfill-indicator] Failed to read log file:', error);
    }
    return [];
  }
};

const main = async () => {
  await initIndicatorStorage(dataDirectory);

  const entries = await loadLogEntries();
  if (entries.length === 0) {
    console.log('[backfill-indicator] No entries to backfill.');
    return;
  }

  // Entries are prepended in server/index.js, so index 0 is the most recent.
  const latestEntry = entries[0] ?? entries[entries.length - 1];
  if (!latestEntry) {
    console.warn('[backfill-indicator] Unable to determine the latest entry.');
    return;
  }

  await storeIndicatorEvent(latestEntry);
  console.log(
    `[backfill-indicator] Stored latest indicator event to ${getIndicatorDatabasePath()}.`,
  );
};

main().catch((error) => {
  console.error('[backfill-indicator] Unexpected error while backfilling:', error);
  process.exitCode = 1;
});
