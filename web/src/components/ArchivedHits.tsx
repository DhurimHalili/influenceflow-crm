import { Archive, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { dateLabel } from "../lib/utils";
import { Avatar } from "./ui";

type Item = { id: string; name: string; archived_at: string | null; avatar_path?: string };

/** "Dan is in your archive" — archived records that match a search, which the list itself hides. */
export function ArchivedHits({ items, query, noun, to, onRestore }: { items: Item[]; query: string; noun: string; to: (id: string) => string; onRestore: (item: Item) => void }) {
  if (!items.length) return null;
  const shown = items.slice(0, 4);
  return <div className="archived-hits" role="note">
    <span><Archive size={14} />{items.length === 1 ? `1 archived ${noun} matches` : `${items.length} archived ${noun}s match`} “{query}” — hidden from this list</span>
    <ul>
      {shown.map((item) => <li key={item.id}>
        <Link to={to(item.id)} title={`Open ${item.name} (archived)`}><Avatar name={item.name} path={item.avatar_path} size="sm" />{item.name}<small>archived {item.archived_at ? dateLabel(item.archived_at) : ""}</small></Link>
        <button type="button" onClick={() => onRestore(item)} aria-label={`Restore ${item.name}`}><RotateCcw size={12} /> Restore</button>
      </li>)}
      {items.length > shown.length && <li><Link to="/app/deleted">+{items.length - shown.length} more in Archive</Link></li>}
    </ul>
  </div>;
}
