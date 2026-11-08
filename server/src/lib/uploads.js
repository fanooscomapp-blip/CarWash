import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';
import { badRequest } from './errors.js';

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Files are stored outside the public web root and streamed through authenticated endpoints only.
export function makeUploader(subdir, { maxMb = 8, allowPdf = false } = {}) {
  const dir = path.join(config.uploadsDir, '.tmp', subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ALLOWED[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
      const ok = ALLOWED[file.mimetype] && (allowPdf || file.mimetype !== 'application/pdf');
      cb(ok ? null : badRequest(`Unsupported file type ${file.mimetype}`), !!ok);
    },
  });
}

// Final storage key for a multer temp file, e.g. receipts/1699999999-ab12cd34.pdf
export const storageKey = (subdir, file) => `${subdir}/${path.basename(file.path)}`;
