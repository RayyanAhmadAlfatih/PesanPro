import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";

type B2Transport = {
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer | null>;
  put(key: string, buffer: Buffer, mimeType: string): Promise<void>;
};

type CacheEntry = { buffer: Buffer; size: number };

let b2Client: S3Client | null = null;
let transportOverride: B2Transport | null = null;
const mediaCache = new Map<string, CacheEntry>();
const inflightLoads = new Map<string, Promise<Buffer | null>>();
let cachedBytes = 0;

function normalizeStoragePath(storagePath: string) {
  const normalized = storagePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new MessageJobError("INVALID_MEDIA_PATH", "Media path is invalid", 500, false);
  }
  return normalized;
}

export function getPrivateMediaRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), getEnv().PRIVATE_MEDIA_PATH);
}

export function resolvePrivateMediaPath(storagePath: string) {
  const root = getPrivateMediaRoot();
  const resolved = path.resolve(/* turbopackIgnore: true */ root, normalizeStoragePath(storagePath));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new MessageJobError("INVALID_MEDIA_PATH", "Media path is invalid", 500, false);
  }
  return resolved;
}

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NoSuchKey" || candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

async function bodyToBuffer(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "B2 returned an empty media object", 410, true);
  }
  const stream = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof stream.transformToByteArray !== "function") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "B2 returned an unsupported media stream", 410, true);
  }
  return Buffer.from(await stream.transformToByteArray());
}

function getB2Client() {
  if (b2Client) return b2Client;
  const env = getEnv();
  if (!env.B2_ACCOUNT_ID || !env.B2_ACCOUNT_KEY || !env.B2_ENDPOINT) {
    throw new MessageJobError("B2_NOT_CONFIGURED", "Private object storage is not configured", 503, true);
  }
  b2Client = new S3Client({
    endpoint: env.B2_ENDPOINT,
    region: env.B2_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.B2_ACCOUNT_ID,
      secretAccessKey: env.B2_ACCOUNT_KEY,
    },
  });
  return b2Client;
}

function getB2Transport(): B2Transport {
  if (transportOverride) return transportOverride;
  const env = getEnv();
  if (!env.B2_BUCKET) {
    throw new MessageJobError("B2_NOT_CONFIGURED", "Private object storage is not configured", 503, true);
  }
  const bucket = env.B2_BUCKET;
  const client = getB2Client();
  return {
    async put(key, buffer, mimeType) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: mimeType,
      }));
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return bodyToBuffer(result.Body);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
  };
}

function getCached(cacheKey: string) {
  const entry = mediaCache.get(cacheKey);
  if (!entry) return null;
  mediaCache.delete(cacheKey);
  mediaCache.set(cacheKey, entry);
  return entry.buffer;
}

function cacheBuffer(cacheKey: string, buffer: Buffer) {
  const env = getEnv();
  const maxBytes = env.MEDIA_CACHE_MAX_BYTES_MB * 1024 * 1024;
  if (buffer.length > maxBytes) return;
  const existing = mediaCache.get(cacheKey);
  if (existing) {
    cachedBytes -= existing.size;
    mediaCache.delete(cacheKey);
  }
  mediaCache.set(cacheKey, { buffer, size: buffer.length });
  cachedBytes += buffer.length;
  while (mediaCache.size > env.MEDIA_CACHE_MAX_ENTRIES || cachedBytes > maxBytes) {
    const oldestKey = mediaCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = mediaCache.get(oldestKey);
    mediaCache.delete(oldestKey);
    cachedBytes -= oldest?.size ?? 0;
  }
}

export function evictPrivateMediaCache(cacheKey: string) {
  const entry = mediaCache.get(cacheKey);
  if (entry) cachedBytes -= entry.size;
  mediaCache.delete(cacheKey);
  inflightLoads.delete(cacheKey);
}

async function loadUncached(storagePath: string) {
  const key = normalizeStoragePath(storagePath);
  if (getEnv().MEDIA_STORAGE_DRIVER === "b2") {
    const remote = await getB2Transport().get(key);
    if (remote) return remote;
  }
  return readFile(resolvePrivateMediaPath(key)).catch(() => null);
}

export async function storePrivateMediaObject(input: { storagePath: string; buffer: Buffer; mimeType: string }) {
  const key = normalizeStoragePath(input.storagePath);
  if (getEnv().MEDIA_STORAGE_DRIVER === "b2") {
    await getB2Transport().put(key, input.buffer, input.mimeType);
    return;
  }
  const absolutePath = resolvePrivateMediaPath(key);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer, { flag: "wx", mode: 0o600 });
}

export async function loadPrivateMediaObject(input: { cacheKey: string; storagePath: string }) {
  const cached = getCached(input.cacheKey);
  if (cached) return cached;
  const current = inflightLoads.get(input.cacheKey);
  if (current) return current;
  const loading = loadUncached(input.storagePath).then((buffer) => {
    if (buffer) cacheBuffer(input.cacheKey, buffer);
    return buffer;
  }).finally(() => inflightLoads.delete(input.cacheKey));
  inflightLoads.set(input.cacheKey, loading);
  return loading;
}

export async function deletePrivateMediaObject(input: { cacheKey: string; storagePath: string }) {
  const key = normalizeStoragePath(input.storagePath);
  evictPrivateMediaCache(input.cacheKey);
  if (getEnv().MEDIA_STORAGE_DRIVER === "b2") {
    await getB2Transport().delete(key);
  }
  await unlink(resolvePrivateMediaPath(key)).catch(() => undefined);
}

export async function hasPrivateMediaObject(storagePath: string) {
  const key = normalizeStoragePath(storagePath);
  if (getEnv().MEDIA_STORAGE_DRIVER !== "b2") return false;
  return getB2Transport().exists(key);
}

export async function probePrivateMediaStorage() {
  const env = getEnv();
  if (env.MEDIA_STORAGE_DRIVER !== "b2") return { driver: "local" as const };
  // A HEAD for a deliberately absent key proves the configured B2 endpoint,
  // credentials, bucket, and read permission are reachable without writing data.
  await getB2Transport().exists("__pesanpro_health__/readiness-probe");
  return { driver: "b2" as const };
}

export function _setPrivateMediaStorageTransportForTests(transport: B2Transport | null) {
  transportOverride = transport;
}

export function _resetPrivateMediaStorageForTests() {
  b2Client?.destroy();
  b2Client = null;
  transportOverride = null;
  mediaCache.clear();
  inflightLoads.clear();
  cachedBytes = 0;
}
