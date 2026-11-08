// File storage abstraction: local disk (default) or any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3, MinIO).
// Hosts with ephemeral disks (Render/Railway without a volume) must use S3 mode so receipts and photos survive redeploys.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { notFound } from './errors.js';

const mode = process.env.STORAGE_DRIVER || (process.env.S3_BUCKET ? 's3' : 'local');
let s3;
if (mode === 's3') {
  for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) if (!process.env[k]) throw new Error(`STORAGE_DRIVER=s3 requires ${k}`);
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined, // e.g. https://<account>.r2.cloudflarestorage.com
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
}
export const storageMode = mode;

const safeKey = (key) => {
  const k = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (k.includes('..')) throw new Error('Invalid storage key');
  return k;
};

// Moves a multer temp file into permanent storage and returns the key to persist in the database.
export async function storeUpload(tempPath, key, mimeType) {
  key = safeKey(key);
  if (mode === 's3') {
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: fs.createReadStream(tempPath), ContentType: mimeType }));
    fs.unlink(tempPath, () => {});
    return key;
  }
  const dest = path.join(config.uploadsDir, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(tempPath) !== path.resolve(dest)) fs.renameSync(tempPath, dest);
  return key;
}

// Streams a stored file to an Express response (callers have already checked permissions).
export async function sendStored(res, key, mimeType) {
  key = safeKey(key);
  if (mode === 's3') {
    let obj;
    try { obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); }
    catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') throw notFound('File'); throw e; }
    res.setHeader('Content-Type', mimeType || obj.ContentType || 'application/octet-stream');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    await pipeline(obj.Body, res);
    return;
  }
  const abs = path.resolve(config.uploadsDir, key);
  if (!abs.startsWith(path.resolve(config.uploadsDir)) || !fs.existsSync(abs)) throw notFound('File');
  if (mimeType) res.type(mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs);
}

export async function deleteStored(key) {
  key = safeKey(key);
  if (mode === 's3') return s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  fs.unlink(path.resolve(config.uploadsDir, key), () => {});
}

export async function checkStorage() {
  if (mode === 's3') { await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })); return `s3 bucket "${process.env.S3_BUCKET}"`; }
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  return `local disk ${config.uploadsDir}`;
}
