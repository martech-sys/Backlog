'use client';

import { useRef, useState } from 'react';
import { ThumbImg } from './ThumbImg';

const MAX_SIDE = 2000;
const MAX_BYTES = 4 * 1024 * 1024;

/** Perkecil foto besar di browser (JPEG ±85%) agar upload cepat dan di bawah 4 MB. */
async function compress(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Only JPG or PNG images.');
  if (file.size < 800 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', {
    type: 'image/jpeg',
  });
}

/**
 * Lampiran gambar: pilih file, atau tempel (Ctrl/Cmd+V) screenshot di area ini, atau tempel link Google Drive.
 * URL hasil upload dikirim sebagai input tersembunyi `name` (boleh lebih dari satu).
 */
export function ImagePicker({
  name = 'lampiran',
  folder,
  label = 'Image attachments',
  allowLink = true,
  canUpload = false,
  children,
}: {
  name?: string;
  folder: string;
  label?: string;
  allowLink?: boolean;
  /** Upload langsung aktif (penyimpanan dikonfigurasi). Bila tidak, lampiran lewat link Google Drive saja. */
  canUpload?: boolean;
  children?: React.ReactNode;
}) {
  const [items, setItems] = useState<{ url: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    setError('');
    for (const f of files.slice(0, 6 - items.length)) {
      setBusy((n) => n + 1);
      try {
        const file = await compress(f);
        if (file.size > MAX_BYTES) throw new Error('Maximum image size is 4 MB.');
        const fd = new FormData();
        fd.set('file', file);
        fd.set('folder', folder);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          message?: string;
        };
        if (!j.ok || !j.url) throw new Error(j.message || `Upload failed (${res.status})`);
        const url = j.url;
        setItems((xs) => [...xs, { url, preview: url }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  function addLink() {
    const u = link.trim();
    if (!/^https?:\/\/\S+$/.test(u)) {
      setError('Link must start with https://');
      return;
    }
    const drive = u.match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    const preview = drive ? `https://drive.google.com/thumbnail?id=${drive[1] || drive[2]}&sz=w400` : u;
    setItems((xs) => [...xs, { url: u, preview }]);
    setLink('');
    setError('');
  }

  return (
    <div
      className="image-picker"
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        if (canUpload) void upload(files);
        else setError('Images cannot be pasted directly. Save it to your Google Drive first, then paste the link in the field below.');
      }}
    >
      {children}
      <div className="field" style={{ marginTop: 8 }}>
        <span className="label">{label}</span>
        <div className="thumbs">
          {items.map((it, i) => (
            <span key={it.url + i} className="thumb">
              <ThumbImg src={it.preview} alt={`Attachment ${i + 1}`} />
              <button type="button" aria-label="Remove attachment" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                ×
              </button>
              <input type="hidden" name={name} value={it.url} />
            </span>
          ))}
          {canUpload && items.length < 6 ? (
            <button type="button" className="thumb add" onClick={() => input.current?.click()} disabled={busy > 0}>
              {busy ? 'Uploading…' : '+ Image'}
            </button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        {canUpload ? (
          <span className="help">JPG/PNG max. 4 MB (large photos are resized automatically). You can also paste a screenshot here with Ctrl/Cmd + V.</span>
        ) : null}
        {allowLink ? (
          <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'nowrap' }}>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLink();
                }
              }}
              placeholder={canUpload ? 'or paste an image / Google Drive link' : 'Paste an image link from your Google Drive'}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn small" onClick={addLink} disabled={!link.trim()}>
              Add
            </button>
          </div>
        ) : null}
        {allowLink ? (
          <span className="help">
            Upload the image to your Google Drive → right-click → <b>Share</b> → General access: <b>anyone in the organization</b> or{' '}
            <b>anyone with the link</b> → <b>Copy link</b>. Otherwise the team only sees &quot;Open link&quot;.
          </span>
        ) : null}
        {error ? (
          <span className="help" style={{ color: 'var(--danger)' }}>
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
