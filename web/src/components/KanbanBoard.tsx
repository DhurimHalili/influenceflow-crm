import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { STATUS_LABELS, type EntityStatus } from "../types";
import { StatusBadge } from "./ui";

// The pipeline board, shared by Influencers and Brands. Every stage always has
// a column (Denied and No reply included, even when empty), and a strip of
// stage pills above the board jumps to any column — so a stage past the edge
// of the screen is never hidden behind a scroll you didn't know was there.

export type Stage = { status: EntityStatus; count: number };

export function KanbanBoard({ stages, renderColumn }: { stages: Stage[]; renderColumn: (status: EntityStatus) => ReactNode }) {
  const board = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState<Set<EntityStatus>>(() => new Set());
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = board.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    measure();
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      setInView((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          const status = (e.target as HTMLElement).dataset.status as EntityStatus;
          if (e.isIntersecting) next.add(status); else next.delete(status);
        }
        return next;
      });
    }, { root: el, threshold: 0.55 });
    el.querySelectorAll<HTMLElement>("[data-status]").forEach((col) => io?.observe(col));
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => { io?.disconnect(); ro?.disconnect(); };
  }, [measure, stages.length]);

  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const jump = (status: EntityStatus) => {
    const el = board.current;
    const col = el?.querySelector<HTMLElement>(`[data-status="${status}"]`);
    if (!el || !col) return;
    el.scrollTo({ left: col.offsetLeft - el.offsetLeft - 4, behavior: reduced() ? "auto" : "smooth" });
    col.focus({ preventScroll: true });
  };
  const page = (dir: 1 | -1) => board.current?.scrollBy({ left: dir * Math.max(240, board.current.clientWidth * 0.8), behavior: reduced() ? "auto" : "smooth" });

  return <div className="kanban-wrap">
    <nav className="kanban-nav" aria-label="Jump to a stage">
      {stages.map((s) => <button type="button" key={s.status} className={`kanban-pill${inView.has(s.status) ? " in-view" : ""}${s.count ? "" : " empty"}`} onClick={() => jump(s.status)} aria-label={`${STATUS_LABELS[s.status]}: ${s.count}`}>
        <i className={`kp-dot status-${s.status}`} />{STATUS_LABELS[s.status]}<b>{s.count}</b>
      </button>)}
    </nav>
    <div className={`kanban-scroller${edges.left ? " more-left" : ""}${edges.right ? " more-right" : ""}`}>
      {edges.left && <button type="button" className="kanban-edge left" onClick={() => page(-1)} aria-label="Scroll to earlier stages"><ChevronLeft size={18} /></button>}
      <div className="kanban-board" ref={board} onScroll={measure}>
        {stages.map((s) => <section key={s.status} className="kanban-column" data-status={s.status} tabIndex={-1} aria-label={`${STATUS_LABELS[s.status]} (${s.count})`}>
          <header><StatusBadge status={s.status} /><span>{s.count}</span></header>
          <div>{s.count ? renderColumn(s.status) : <p className="kanban-empty">No one here</p>}</div>
        </section>)}
      </div>
      {edges.right && <button type="button" className="kanban-edge right" onClick={() => page(1)} aria-label="Scroll to later stages"><ChevronRight size={18} /></button>}
    </div>
  </div>;
}
