import { useEffect, useState } from "preact/hooks";
import { fileSrc } from "../workspace/tauriBridge";

export function ImageViewer({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    fileSrc(path).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div class="image-viewer">
      {src && <img src={src} alt={path} />}
    </div>
  );
}
