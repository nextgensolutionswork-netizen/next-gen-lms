'use client';

import * as React from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Loader2,
  Paperclip,
} from 'lucide-react';
import {
  StorageBucket,
  STORAGE_BUCKETS,
  validateFile,
  uploadFile,
  UploadResult,
} from '@/lib/services/storage-service';
import { Button } from './button';

interface FileUploadProps {
  bucket: StorageBucket;
  label?: string;
  description?: string;
  entityId?: string;
  value?: string;
  onChange?: (url: string, result?: UploadResult) => void;
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
}

export function FileUpload({
  bucket,
  label,
  description,
  entityId,
  value,
  onChange,
  onRemove,
  className = '',
  compact = false,
}: FileUploadProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [currentUrl, setCurrentUrl] = React.useState<string | undefined>(value);

  const bucketConfig = STORAGE_BUCKETS[bucket];
  const maxMb = Math.round(bucketConfig.maxSizeBytes / (1024 * 1024));

  React.useEffect(() => {
    setCurrentUrl(value);
  }, [value]);

  const handleFileProcess = async (file: File) => {
    setUploadError(null);

    // Client-side validation
    const validation = validateFile({ name: file.name, size: file.size, type: file.type }, bucket);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Try uploading via /api/upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      if (entityId) formData.append('entityId', entityId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          setCurrentUrl(data.url);
          onChange?.(data.url, data);
          return;
        }
      }

      // 2. Direct client fallback via storage-service
      const directResult = await uploadFile({
        bucket,
        file,
        fileName: file.name,
        contentType: file.type,
        entityId,
      });

      setCurrentUrl(directResult.url);
      onChange?.(directResult.url, directResult);
    } catch (err: any) {
      console.error('File upload error:', err);
      setUploadError(err?.message || 'Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleClear = () => {
    setCurrentUrl(undefined);
    setUploadError(null);
    onRemove?.();
    onChange?.('');
  };

  const isImage =
    currentUrl?.match(/\.(jpeg|jpg|png|webp|gif)($|\?)/i) ||
    currentUrl?.startsWith('data:image/') ||
    bucket === 'screenshots' ||
    bucket === 'avatars';

  // Compact inline mode (for quick chat/doubt replies)
  if (compact) {
    return (
      <div className={`relative inline-block ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept={bucketConfig.allowedExtensions.join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={isUploading}
        />
        {currentUrl ? (
          <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-lg text-xs">
            <Paperclip className="h-3.5 w-3.5 text-blue-600" />
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline truncate max-w-[120px]"
            >
              Attached
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="text-blue-500 hover:text-red-600 p-0.5"
              title="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors"
            title={`Attach ${bucketConfig.name} (Max ${maxMb}MB)`}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span>{isUploading ? 'Uploading...' : 'Attach File'}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
      )}

      {currentUrl ? (
        // Active Uploaded Preview Box
        <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-blue-100 text-[#0A6ED1] flex items-center justify-center">
              {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">
                  Uploaded to {bucketConfig.name}
                </span>
              </div>
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1 mt-0.5 truncate"
              >
                <span className="truncate">{currentUrl}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          </div>

          <div className="flex items-center space-x-2 pl-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs h-7"
            >
              Replace
            </Button>
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        // Dropzone & Picker Box
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-[#0A6ED1] bg-blue-50/50'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={bucketConfig.allowedExtensions.join(',')}
            onChange={handleInputChange}
            className="hidden"
            disabled={isUploading}
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-blue-100 text-[#0A6ED1] flex items-center justify-center">
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">
                {isUploading ? 'Uploading file...' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {bucketConfig.allowedExtensions.join(', ').toUpperCase()} · Max {maxMb}MB
              </p>
            </div>
            {description && (
              <p className="text-[11px] text-slate-500 max-w-sm mt-1">{description}</p>
            )}
          </div>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-red-50 text-red-700 text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
}
