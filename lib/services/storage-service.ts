import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export type StorageBucket = 'resumes' | 'screenshots' | 'assignments' | 'avatars';

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
  screenshots: {
    name: 'screenshots',
    public: true,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'],
    description: 'Academic doubts screenshots, SAP GUI error captures, and mentor replies',
  },
  assignments: {
    name: 'assignments',
    public: true,
    maxSizeBytes: 20 * 1024 * 1024, // 20MB
    allowedMimes: [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    allowedExtensions: ['.pdf', '.zip', '.docx', '.xlsx'],
    description: 'Student assignment submissions, SAP configuration workbooks, and handouts',
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

      return {
        url: publicUrlData.publicUrl,
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

  return {
    url: mockUrl,
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
 * Auto-creates the required public storage buckets in Supabase if they do not yet exist.
 */
export async function ensureStorageBuckets(): Promise<void> {
  if (!isLiveSupabaseEnabled()) return;

  try {
    const db = getDb();
    const { data: existingBuckets, error: listError } = await db.storage.listBuckets();
    if (listError) throw listError;

    const existingNames = (existingBuckets || []).map((b) => b.name);

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
