import React, { useRef, useState } from 'react';
import { api } from '../lib/api';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Image upload control: file picker + preview. The file is sent (base64) to the
 * app backend, which serves it at a public URL that SHOPLINE later fetches as
 * the product's media original_source. Optional "paste URL" fallback included.
 */
export function ImageUpload({
  value,
  onChange,
  disabled = false,
}: {
  /** Current image URL (uploaded or pasted), or empty. */
  value: string;
  onChange(url: string): void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, GIF, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image is too large — keep it under 4MB.');
      return;
    }

    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? '');
          resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
        };
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });

      const { url } = await api.uploadImage({ contentType: file.type, dataBase64 });
      onChange(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        {value ? (
          <img
            src={value}
            alt="Preview"
            style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--color-border)' }}
          />
        ) : (
          <div
            style={{
              width: 64, height: 64, borderRadius: 8, border: '1px dashed var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
              background: 'var(--color-surface-alt, #f7f7f9)',
            }}
          >
            🖼
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <><span className="spinner spinner-sm" /> Uploading…</> : value ? 'Replace image' : '⬆ Upload image'}
            </button>
            {value && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || uploading} onClick={() => onChange('')}>
                Remove
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-link"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '.75rem', color: 'var(--color-text-muted)', textAlign: 'left', textDecoration: 'underline' }}
            onClick={() => setShowUrlInput((v) => !v)}
          >
            {showUrlInput ? 'hide URL input' : 'or paste an image URL'}
          </button>
        </div>
      </div>
      {showUrlInput && (
        <input
          className="input"
          style={{ marginTop: '.5rem' }}
          placeholder="https://…/image.png"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || uploading}
        />
      )}
      {error && <div className="form-error" style={{ marginTop: '.4rem' }}>{error}</div>}
    </div>
  );
}
