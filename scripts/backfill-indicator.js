import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { getStorageMetadata, persistIndicatorEvent } from '../lib/storage.js';

dotenv.config();

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
  const entries = await loadLogEntries();
  if (entries.length === 0) {
    console.log('[backfill-indicator] No entries to backfill.');
    return;
  }

  const latestEntry = entries[0] ?? entries[entries.length - 1];
  if (!latestEntry) {
    console.warn('[backfill-indicator] Unable to determine the latest entry.');
    return;
  }

  const result = await persistIndicatorEvent(latestEntry);
  if (!result) {
    console.warn('[backfill-indicator] The latest entry does not contain indicator data.');
    return;
  }

  const metadata = await getStorageMetadata();
  console.log(
    `[backfill-indicator] Stored latest indicator event using ${metadata.backend} (limit: ${metadata.indicatorHistoryLimit}).`,
  );
};

main().catch((error) => {
  console.error('[backfill-indicator] Unexpected error while backfilling:', error);
  process.exitCode = 1;
});
