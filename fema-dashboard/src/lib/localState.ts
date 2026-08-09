/**
 * Per-user annotations: notes and dismissals, held in localStorage.
 *
 * This is deliberately light-touch. Two caveats it is honest about in the UI:
 * these marks are per-browser (a teammate will not see them), and clearing site
 * data loses them. The export/import pair below is the workaround — one person
 * can own the dismissal list and share the file.
 */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'pa-command-center:annotations:v1';

export interface Annotation {
  note?: string;
  dismissed?: boolean;
  dismissReason?: string;
  updatedAt: string;
}

export type AnnotationMap = Record<string, Annotation>;

function read(): AnnotationMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AnnotationMap) : {};
  } catch {
    return {};
  }
}

function write(map: AnnotationMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — annotations simply don't persist */
  }
}

export function useAnnotations() {
  const [map, setMap] = useState<AnnotationMap>({});

  useEffect(() => setMap(read()), []);

  const update = useCallback((id: string, patch: Partial<Annotation>) => {
    setMap((prev) => {
      const next: AnnotationMap = {
        ...prev,
        [id]: { ...prev[id], ...patch, updatedAt: new Date().toISOString() },
      };
      if (!next[id].note && !next[id].dismissed) delete next[id];
      write(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setMap({});
    write({});
  }, []);

  const importMap = useCallback((incoming: AnnotationMap) => {
    setMap((prev) => {
      const next = { ...prev, ...incoming };
      write(next);
      return next;
    });
  }, []);

  return { annotations: map, update, clearAll, importMap };
}

export function downloadAnnotations(map: AnnotationMap) {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pa-annotations-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
