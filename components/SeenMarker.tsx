'use client';

import { useEffect, useState } from 'react';

const KEY = 'ct_seen_tasks';

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

/** Tanda "Baru" untuk tugas yang belum pernah dibuka di browser ini. */
export function NewMarker({ seenKey }: { seenKey: string }) {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    setIsNew(!readSeen().includes(seenKey));
  }, [seenKey]);
  return isNew ? <span className="badge violet">Baru</span> : null;
}

/** Dipasang di detail task: catat bahwa tugas ini sudah dibuka. */
export function MarkSeen({ seenKey }: { seenKey: string }) {
  useEffect(() => {
    try {
      const id = seenKey.split('@')[0];
      const list = readSeen().filter((k) => k.split('@')[0] !== id);
      list.push(seenKey);
      localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
    } catch {
      // penyimpanan browser tidak tersedia
    }
  }, [seenKey]);
  return null;
}
