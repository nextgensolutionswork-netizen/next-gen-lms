import crypto from 'crypto';
import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export type StorageBucket =
  | 'resumes'
  | 'assignments'
  | 'doubt-attachments'
  | 'receipts'
  | 'screenshots'
  | 'avatars';

export interface BucketConfig {
  name: StorageBucket;
  public: boolean;
  maxSizeBytes: number;
  allowedMimes: string[];
  allowedExtensions: string[];
  description: string;
}

export const STORAGE_BUCKETS: Record<StorageBucket, BucketConfig> = {
  resumes: {
    name: 'resumes',
    public: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    allowedExtensions: ['.pdf', '.doc', '.docx'],
    description: 'Student resumes and curriculum vitae for placement and profile review',
  },
  assignments: {
    name: 'assignments',
    public: true,
    maxSizeBytes: 25 * 1024 * 1024, // 25MB
    allowedMimes: [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/x-rar-compressed',
    ],
    allowedExtensions: ['.pdf', '.zip', '.docx', '.xlsx', '.rar'],
    description: 'Student homework submissions, assignment PDFs, SAP configuration workbooks, and blueprints',
  },
  'doubt-attachments': {
    name: 'doubt-attachments',
    public: true,
    maxSizeBytes: 15 * 1024 * 1024, // 15MB
    allowedMimes: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'],
    description: 'Academic doubts screenshots, SAP GUI error captures, and faculty feedback notes',
  },
  receipts: {
    name: 'receipts',
    public: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
    description: 'Tuition fee receipts, payment proof screenshots, and tax invoices',
  },
  screenshots: {
    name: 'screenshots',
    public: true,
    maxSizeBytes: 15 * 1024 * 1024, // 15MB
    allowedMimes: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'],
    description: 'Academic doubts screenshots and GUI error captures (legacy alias for doubt-attachments)',
  },
  avatars: {
    name: 'avatars',
    public: true,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
    description: 'User and student profile display pictures',
  },
};

/**
 * Validates a file against the target bucket policy (size limit and MIME/extension type).
 */
export function validateFile(
  file: { name: string; size: number; type?: string },
  bucket: StorageBucket
): { valid: boolean; error?: string } {
  const config = STORAGE_BUCKETS[bucket];
  if (!config) {
    return { valid: false, error: `Invalid storage bucket: ${bucket}` };
  }

  // 1. Validate file size
  if (file.size > config.maxSizeBytes) {
    const maxMb = Math.round(config.maxSizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the ${maxMb}MB limit for ${bucket}.`,
    };
  }

  // 2. Validate file extension
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const hasValidExt = config.allowedExtensions.includes(ext);

  // 3. Validate MIME type if provided
  const hasValidMime = !file.type || config.allowedMimes.includes(file.type.toLowerCase());

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: `Invalid file format "${ext}". Allowed types: ${config.allowedExtensions.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Generates a clean, timestamped, collision-free path within the bucket.
 */
export function generateStoragePath(
  bucket: StorageBucket,
  originalName: string,
  entityId?: string
): string {
  const sanitizedName = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  const scope = entityId ? entityId.replace(/[^a-z0-9_-]/gi, '_') : 'general';
  const timestamp = Date.now();
  return `${scope}/${timestamp}-${sanitizedName}`;
}

export interface UploadOptions {
  bucket: StorageBucket;
  file: File | Blob | Buffer;
  fileName: string;
  contentType?: string;
  entityId?: string;
  path?: string;
}

export interface UploadResult {
  url: string;
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
  isMock: boolean;
  signedUrl?: string;
}

/**
 * Uploads a file to Supabase Storage or handles fallback for local/offline mode.
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { bucket, file, fileName, contentType, entityId } = options;

  // Validate file
  const size = Buffer.isBuffer(file) ? file.length : (file as Blob | File).size;
  const mimeType = contentType || (file && 'type' in file && typeof file.type === 'string' ? file.type : 'application/octet-stream');

  const validation = validateFile({ name: fileName, size, type: mimeType }, bucket);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storagePath = options.path || generateStoragePath(bucket, fileName, entityId);

  // Live Supabase Storage Integration
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      const { data, error } = await db.storage
        .from(bucket)
        .upload(storagePath, file, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = db.storage.from(bucket).getPublicUrl(data.path);
      const signedRes = await createSignedUrl(bucket, data.path, 86400);

      return {
        url: publicUrlData.publicUrl,
        signedUrl: signedRes.signedUrl,
        path: data.path,
        fileName,
        size,
        mimeType,
        isMock: false,
      };
    } catch (err: any) {
      console.warn(`Supabase Storage upload to [${bucket}] failed, falling back to local simulation:`, err?.message || err);
    }
  }

  // Local / Offline Simulation
  // For images, generate a data URL if in browser or mock public asset URL
  let mockUrl = `/api/storage/${bucket}/${storagePath}`;

  if (typeof window !== 'undefined' && (file instanceof File || file instanceof Blob)) {
    try {
      // In browser, create a persistent object URL for immediate rendering
      mockUrl = URL.createObjectURL(file);
    } catch {}
  }

  const mockSignedRes = await createSignedUrl(bucket, storagePath, 86400);

  return {
    url: mockUrl,
    signedUrl: mockSignedRes.signedUrl,
    path: storagePath,
    fileName,
    size,
    mimeType,
    isMock: true,
  };
}

/**
 * Deletes a file from Supabase Storage.
 */
export async function deleteFile(bucket: StorageBucket, path: string): Promise<boolean> {
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      const { error } = await db.storage.from(bucket).remove([path]);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn(`Error deleting file from [${bucket}/${path}]:`, err);
      return false;
    }
  }
  return true;
}

/**
 * Gets the public URL for a stored object.
 */
export function getStoragePublicUrl(bucket: StorageBucket, path: string): string {
  if (isLiveSupabaseEnabled()) {
    const db = getDb();
    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  return `/api/storage/${bucket}/${path}`;
}

/**
 * Generates a time-limited cryptographically signed URL for secure download access.
 * Supported for buckets: resumes, assignments, doubt-attachments, receipts.
 */
export async function createSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds: number = 3600
): Promise<{ signedUrl: string; token?: string; expiresAt?: number; error?: string }> {
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      const { data, error } = await db.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);

      if (error) throw error;
      if (data?.signedUrl) {
        return {
          signedUrl: data.signedUrl,
          token: data.signedUrl.split('token=').pop() || '',
          expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
        };
      }
    } catch (err: any) {
      console.warn(`Supabase createSignedUrl error for [${bucket}/${path}]:`, err?.message || err);
    }
  }

  // Cryptographically signed URL with HMAC-SHA256 signature and timestamp expiry
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const secret = process.env.STORAGE_SIGNING_SECRET || 'erp_lms_secure_storage_token_2026';
  const cleanPath = path.replace(/^\/+/, '');
  const payload = `${bucket}:${cleanPath}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const signedUrl = `/api/storage/signed?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(cleanPath)}&expires=${expiresAt}&signature=${signature}`;
  return { signedUrl, token: signature, expiresAt };
}

/**
 * Validates a signed storage URL token signature and expiration timestamp.
 */
export function verifySignedUrlToken(
  bucket: string,
  path: string,
  expires: number,
  signature: string
): boolean {
  if (!bucket || !path || !expires || !signature) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now > expires) return false; // Token expired

  const secret = process.env.STORAGE_SIGNING_SECRET || 'erp_lms_secure_storage_token_2026';
  const cleanPath = path.replace(/^\/+/, '');
  const payload = `${bucket}:${cleanPath}:${expires}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Auto-creates the required public storage buckets in Supabase if they do not yet exist.
 */
export async function ensureStorageBuckets(): Promise<void> {
  if (!isLiveSupabaseEnabled()) return;

  try {
    const db = getDb();
    const { data: existingBuckets, error: listError } = await db.storage.listBuckets();
    if (listError) throw listError;

    const existingNames = (existingBuckets || []).map((b: any) => b.name);

    for (const bucketKey of Object.keys(STORAGE_BUCKETS) as StorageBucket[]) {
      if (!existingNames.includes(bucketKey)) {
        const config = STORAGE_BUCKETS[bucketKey];
        await db.storage.createBucket(bucketKey, {
          public: config.public,
          fileSizeLimit: config.maxSizeBytes,
          allowedMimeTypes: config.allowedMimes,
        });
      }
    }
  } catch (err) {
    console.warn('Auto-provisioning storage buckets failed:', err);
  }
}
