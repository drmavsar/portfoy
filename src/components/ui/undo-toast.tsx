"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * "Geri al" bildirimi — ters renkli yüzey, ekranın altında ortada.
 * Kalan süre sayıyla da yazılır; üzerine gelince ya da odaklanınca süre durur.
 * Esc kapatır, Ctrl/Cmd+Z geri alır.
 */
export function UndoToast({
  message,
  detail,
  seconds = 30,
  onUndo,
  onClose,
}: {
  message: ReactNode;
  detail?: ReactNode;
  seconds?: number;
  onUndo: () => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    if (left <= 0) onClose();
  }, [left, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo, onClose]);

  return (
    <div
      className="toast-undo"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="toast-undo-row">
        <span className="toast-undo-text">
          <strong>{message}</strong>
          {detail && <> {detail}</>}
        </span>
        <button type="button" onClick={onUndo}>
          Geri al · {Math.max(0, left)}
        </button>
      </div>
      <span className="toast-undo-bar" aria-hidden>
        <span style={{ width: `${(Math.max(0, left) / seconds) * 100}%` }} />
      </span>
    </div>
  );
}
