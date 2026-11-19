'use client';

import { useState } from 'react';

/** Thumbnail lampiran. Bila gambar tidak bisa dimuat (mis. file Drive belum dibagikan), tampilkan "Buka link". */
export function ThumbImg({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="subtle" style={{ fontSize: 12, padding: 4, textAlign: 'center' }} title={src ? 'Preview could not be loaded: check the file sharing access' : undefined}>
        Open link
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
