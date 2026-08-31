import { useEffect, useState } from "react";

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function Timer({
  deadlineMs,
  onExpire,
}: {
  deadlineMs: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(deadlineMs - Date.now());
  const expired = remaining <= 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(deadlineMs - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);

  const low = remaining < 15 * 60 * 1000;

  return (
    <div
      className={`rounded-lg px-4 py-2 font-mono text-lg font-semibold tabular-nums ${
        low ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"
      }`}
      role="timer"
      aria-live="polite"
    >
      {formatDuration(remaining)}
    </div>
  );
}
