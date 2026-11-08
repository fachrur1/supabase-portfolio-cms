// admin/src/uploads.js - Supabase Storage uploads with client-side validation.
import { supabase } from './api.js';

export const MEDIA_BUCKET = 'portfolio-media';
export const DOCUMENTS_BUCKET = 'documents';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const PDF_MIME_TYPE = 'application/pdf';
export const PDF_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB (project Storage limit)

/** Make a filename safe for storage paths. */
export function safeFilename(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

/** Returns an error message string, or null when the file is a valid image. */
export function validateImageFile(file) {
  if (!file) return 'No file selected.';
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    return 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.';
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 10 MB.`;
  }
  return null;
}

/** Returns an error message string, or null when the file is a valid video. */
export function validateVideoFile(file) {
  if (!file) return 'No file selected.';
  const looksLikeVideo = VIDEO_MIME_TYPES.includes(file.type)
    || (!file.type && /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(file.name || ''));
  if (!looksLikeVideo) {
    return 'Unsupported video type. Use MP4, WebM or MOV.';
  }
  if (file.size > VIDEO_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `Video is too large (${mb} MB). The limit is 50 MB - for longer clips upload to YouTube/Vimeo and paste the link instead.`;
  }
  return null;
}

/** Returns an error message string, or null when the file is a valid PDF. */
export function validatePdfFile(file) {
  if (!file) return 'No file selected.';
  if (!/\.pdf$/i.test(file.name || '') || (file.type && file.type !== PDF_MIME_TYPE)) {
    return 'Only PDF documents are allowed.';
  }
  if (file.size > PDF_MAX_BYTES) {
    return `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 20 MB.`;
  }
  return null;
}

/**
 * Upload an image to the portfolio-media bucket.
 * Returns { url, path } on success, throws Error with a friendly message otherwise.
 */
export async function uploadImage(file) {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const path = `media/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed.');
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a video to the portfolio-media bucket.
 * Returns { url, path } on success, throws Error with a friendly message otherwise.
 */
export async function uploadVideo(file) {
  const invalid = validateVideoFile(file);
  if (invalid) throw new Error(invalid);
  const path = `media/videos/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || 'video/mp4',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed.');
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a PDF to the documents bucket.
 * Returns { url, path, size, mimeType } on success, throws Error otherwise.
 */
export async function uploadPdf(file) {
  const invalid = validatePdfFile(file);
  if (invalid) throw new Error(invalid);
  const path = `documents/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    contentType: PDF_MIME_TYPE,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed.');
  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, size: file.size, mimeType: PDF_MIME_TYPE, name: file.name };
}

/**
 * Wire up a drop zone + file picker on a container.
 * - zoneEl: element that accepts drag & drop and opens the picker on click.
 * - accepts: 'image' | 'pdf'
 * - onFile(file): called with the first accepted file (already validated).
 * Returns { openPicker(), destroy() }.
 */
export function attachDropZone(zoneEl, { accepts = 'image', onFile, onInvalid } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accepts === 'pdf'
    ? 'application/pdf'
    : accepts === 'video'
      ? VIDEO_MIME_TYPES.join(',')
      : IMAGE_MIME_TYPES.join(',');
  input.style.display = 'none';
  zoneEl.appendChild(input);

  const validate = accepts === 'pdf'
    ? validatePdfFile
    : accepts === 'video'
      ? validateVideoFile
      : validateImageFile;

  const handle = (file) => {
    const invalid = validate(file);
    if (invalid) {
      if (typeof onInvalid === 'function') onInvalid(invalid);
      return;
    }
    onFile(file);
  };

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) handle(file);
    input.value = '';
  });

  const onClick = (e) => {
    // Let inner buttons/inputs handle their own clicks.
    if (e.target.closest('button, input, a, textarea, select')) return;
    input.click();
  };
  const onDragOver = (e) => {
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  };
  const onDragLeave = () => zoneEl.classList.remove('drag-over');
  const onDrop = (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handle(file);
  };

  zoneEl.addEventListener('click', onClick);
  zoneEl.addEventListener('dragover', onDragOver);
  zoneEl.addEventListener('dragleave', onDragLeave);
  zoneEl.addEventListener('drop', onDrop);

  return {
    openPicker: () => input.click(),
    destroy: () => {
      zoneEl.removeEventListener('click', onClick);
      zoneEl.removeEventListener('dragover', onDragOver);
      zoneEl.removeEventListener('dragleave', onDragLeave);
      zoneEl.removeEventListener('drop', onDrop);
      input.remove();
    },
  };
}
