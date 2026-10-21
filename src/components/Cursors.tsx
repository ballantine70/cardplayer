import { useEffect, useState } from 'react';
import { useSession } from '../sync/session';

/** Other players' pointers, drawn in world space. */
export function Cursors() {
  const cursors = useSession((s) => s.cursors);
  const players = useSession((s) => s.players);
  const me = useSession((s) => s.me.id);
  // Re-render periodically so idle cursors fade out.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  return (
    <>
      {Object.entries(cursors).map(([id, c]) => {
        const p = players.find((pl) => pl.id === id);
        if (!p || id === me || now - c.at > 10_000) return null;
        return (
          <div key={id} className="cursor" style={{ transform: `translate(${c.x}px, ${c.y}px)`, ['--colour' as string]: p.colour }}>
            <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
              <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="var(--colour)" stroke="#fff" strokeWidth="1.5" />
            </svg>
            <span>{p.name}</span>
          </div>
        );
      })}
    </>
  );
}
