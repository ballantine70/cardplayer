import type { ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop no-board" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
