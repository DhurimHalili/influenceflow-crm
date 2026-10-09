import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { AlertCircle, ArrowRight, Bell, CalendarClock, Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, Download, ExternalLink, Flag, Link2, ListTodo, Plus, Video } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Modal, PageHeader, Select, Tabs, Textarea } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { dateLabel, dayKey, download, dueLabel, MEETING_KIND_LABELS, money, parseDay, timeLabel } from "../lib/utils";
import type { Meeting, MeetingKind } from "../types";

type RelatedType = "creator" | "brand" | "campaign" | "";
type MeetingDraft = { title: string; kind: MeetingKind; starts_at: string; ends_at: string; related_type: RelatedType; related_id: string; notes: string; remind: string; remind_at: string };

// Everything that can appear on the calendar, normalised to one shape.
type CalItem = {
  key: string;
  source: "meeting" | "action" | "campaign";
  kind: MeetingKind | "action" | "campaign";
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  allDay: boolean;
  done: boolean;
  overdue: boolean;
  meeting?: Meeting;
  entity?: { type: "creator" | "brand"; id: string; name: string };
  to?: string;
};

type FilterKey = "meeting" | "task" | "reminder" | "action" | "campaign";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "meeting", label: "Meetings" },
  { key: "task", label: "Tasks" },
  { key: "reminder", label: "Reminders" },
  { key: "action", label: "Action dues" },
  { key: "campaign", label: "Campaign dates" },
];
const FILTER_STORE = "if.calendar-filters";
const VIEW_STORE = "if.calendar-view";
// Monday-first weeks, matching the dashboard's "This week" momentum range.
const WEEK = { weekStartsOn: 1 as const };

const REMIND_OPTIONS = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "At start time" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
  { value: "custom", label: "Custom time…" },
];

const localInput = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const draftAt = (start: Date, minutes = 30, kind: MeetingKind = "meeting"): MeetingDraft => ({
  title: "",
  kind,
  starts_at: localInput(start),
  ends_at: localInput(new Date(start.getTime() + minutes * 60000)),
  related_type: "",
  related_id: "",
  notes: "",
  remind: kind === "meeting" ? "30" : "0",
  remind_at: "",
});

const nextHour = () => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return start;
};

const remindValue = (draft: MeetingDraft) => {
  if (draft.remind === "none") return null;
  if (draft.remind === "custom") return draft.remind_at ? new Date(draft.remind_at).toISOString() : null;
  return new Date(new Date(draft.starts_at).getTime() - Number(draft.remind) * 60000).toISOString();
};

const remindPreset = (meeting: Meeting) => {
  if (!meeting.remind_at) return { remind: "none", remind_at: "" };
  const diff = Math.round((new Date(meeting.starts_at).getTime() - new Date(meeting.remind_at).getTime()) / 60000);
  const preset = REMIND_OPTIONS.find((o) => o.value === String(diff));
  return preset ? { remind: preset.value, remind_at: "" } : { remind: "custom", remind_at: localInput(new Date(meeting.remind_at)) };
};

const kindIcon = (kind: CalItem["kind"], size = 14) =>
  kind === "task" ? <ListTodo size={size} /> : kind === "reminder" ? <Bell size={size} /> : kind === "action" ? <Flag size={size} /> : kind === "campaign" ? <CalendarClock size={size} /> : <Video size={size} />;

const readFilters = (): Record<FilterKey, boolean> => {
  const all = { meeting: true, task: true, reminder: true, action: true, campaign: true };
  try {
    const raw = localStorage.getItem(FILTER_STORE);
    return raw ? { ...all, ...(JSON.parse(raw) as Record<FilterKey, boolean>) } : all;
  } catch {
    return all;
  }
};

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDay = (d: Date) => dayKey(d).replace(/-/g, "");
const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export default function CalendarPage() {
  const data = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_STORE) || "month";
    } catch {
      return "month";
    }
  });
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MeetingDraft>(() => draftAt(nextHour()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState(readFilters);
  const [actionItem, setActionItem] = useState<CalItem | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const changeView = (next: string) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORE, next);
    } catch {
      // private mode: view resets next visit
    }
  };
  const toggleFilter = (key: FilterKey) => {
    const next = { ...filters, [key]: !filters[key] };
    setFilters(next);
    try {
      localStorage.setItem(FILTER_STORE, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const entityName = (type: string | null, id: string | null) =>
    type === "creator" ? data.creators.find((item) => item.id === id)?.name : type === "brand" ? data.brands.find((item) => item.id === id)?.name : type === "campaign" ? data.campaigns.find((item) => item.id === id)?.name : null;
  const entityLink = (type: string | null, id: string | null) =>
    type === "creator" ? `/app/influencers/${id}` : type === "brand" ? `/app/brands/${id}` : type === "campaign" ? `/app/campaigns?id=${id}` : undefined;

  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];
    for (const m of data.meetings) {
      const start = new Date(m.starts_at);
      const end = new Date(m.ends_at);
      if (Number.isNaN(start.getTime())) continue;
      const linked = entityName(m.related_type, m.related_id);
      out.push({
        key: `m-${m.id}`,
        source: "meeting",
        kind: m.kind || "meeting",
        title: m.title || MEETING_KIND_LABELS[m.kind] || "Untitled",
        subtitle: linked ? `${MEETING_KIND_LABELS[m.kind] || "Meeting"} · ${linked}` : MEETING_KIND_LABELS[m.kind] || "Meeting",
        start,
        end: Number.isNaN(end.getTime()) ? start : end,
        allDay: false,
        done: m.done === true,
        overdue: m.kind !== "meeting" && !m.done && end.getTime() < Date.now(),
        meeting: m,
        to: entityLink(m.related_type, m.related_id),
      });
    }
    // Next actions with a due date are calendar items automatically — set the
    // date on a profile and it shows up here, no extra step.
    const actionables = [
      ...data.creators.filter((c) => !c.archived_at && c.next_action_date).map((c) => ({ type: "creator" as const, id: c.id, name: c.name, action: c.next_action, due: c.next_action_date! })),
      ...data.brands.filter((b) => !b.archived_at && b.next_action_date).map((b) => ({ type: "brand" as const, id: b.id, name: b.name, action: b.next_action, due: b.next_action_date! })),
    ];
    for (const a of actionables) {
      const day = parseDay(a.due);
      if (!day) continue;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      out.push({
        key: `a-${a.type}-${a.id}`,
        source: "action",
        kind: "action",
        title: a.action?.trim() || "Follow up",
        subtitle: `${a.type === "creator" ? "Influencer" : "Brand"} · ${a.name}`,
        start: day,
        end: day,
        allDay: true,
        done: false,
        overdue: day.getTime() < startOfToday.getTime(),
        entity: { type: a.type, id: a.id, name: a.name },
        to: a.type === "creator" ? `/app/influencers/${a.id}` : `/app/brands/${a.id}`,
      });
    }
    for (const c of data.campaigns) {
      if (c.archived_at || c.status === "cancelled") continue;
      const brand = data.brands.find((b) => b.id === c.brand_id)?.name;
      const startDay = parseDay(c.start_date);
      const dueDay = parseDay(c.due_date);
      if (startDay && c.status !== "completed")
        out.push({ key: `cs-${c.id}`, source: "campaign", kind: "campaign", title: `${c.name} starts`, subtitle: brand ? `Campaign · ${brand}` : "Campaign", start: startDay, end: startDay, allDay: true, done: false, overdue: false, to: `/app/campaigns?id=${c.id}` });
      const invoiceDay = c.payment_status !== "paid" ? parseDay(c.invoice_due) : null;
      if (invoiceDay)
        out.push({ key: `ci-${c.id}`, source: "campaign", kind: "campaign", title: `Invoice due: ${c.name}`, subtitle: `${brand || "Brand"} owes ${money(c.agreed_payment)}`, start: invoiceDay, end: invoiceDay, allDay: true, done: false, overdue: invoiceDay.getTime() < new Date().setHours(0, 0, 0, 0), to: `/app/campaigns?id=${c.id}` });
      if (dueDay && (!startDay || dueDay.getTime() !== startDay.getTime() || c.status === "completed"))
        out.push({ key: `cd-${c.id}`, source: "campaign", kind: "campaign", title: `${c.name} due`, subtitle: brand ? `Campaign · ${brand}` : "Campaign", start: dueDay, end: dueDay, allDay: true, done: c.status === "completed", overdue: c.status === "active" && dueDay.getTime() < new Date().setHours(0, 0, 0, 0), to: `/app/campaigns?id=${c.id}` });
    }
    // Chronological by day; within a day, all-day items first, then by time.
    return out.sort((a, b) => {
      const day = dayKey(a.start).localeCompare(dayKey(b.start));
      if (day !== 0) return day;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.getTime() - b.start.getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.meetings, data.creators, data.brands, data.campaigns]);

  const visible = items.filter((item) => filters[item.kind === "action" ? "action" : item.kind === "campaign" ? "campaign" : (item.kind as FilterKey)]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const item of visible) {
      const key = dayKey(item.start);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [visible]);
  const itemsOn = (day: Date) => byDay.get(dayKey(day)) || [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = items.filter((item) => item.overdue && !item.done).sort((a, b) => a.start.getTime() - b.start.getTime());
  const horizon = startOfToday.getTime() + 14 * 86400000;
  const upcoming = visible.filter((item) => !item.done && (item.allDay ? item.start.getTime() >= startOfToday.getTime() : item.end.getTime() >= Date.now()) && item.start.getTime() < horizon).slice(0, 10);

  // Deep links: ?new=1&type=creator&id=…&kind=task&date=YYYY-MM-DD&title=…, ?open=<meetingId>
  useEffect(() => {
    if (params.get("new")) {
      const type = params.get("type");
      const kindParam = params.get("kind");
      const kind: MeetingKind = kindParam === "task" || kindParam === "reminder" ? kindParam : "meeting";
      const day = parseDay(params.get("date"));
      let start = nextHour();
      if (day && !isSameDay(day, new Date())) {
        start = new Date(day);
        start.setHours(10, 0, 0, 0);
      }
      setDraft({ ...draftAt(start, 30, kind), title: params.get("title") || "", related_type: type === "creator" || type === "brand" || type === "campaign" ? type : "", related_id: params.get("id") || "" });
      setEditingId(null);
      setOpen(true);
    }
    const openId = params.get("open");
    if (openId) {
      const meeting = data.meetings.find((m) => m.id === openId);
      if (meeting) {
        const day = new Date(meeting.starts_at);
        setCursor(day);
        setSelectedDay(day);
        openEdit(meeting);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, data.meetings.length]);

  const close = () => {
    setOpen(false);
    setEditingId(null);
    setDraft(draftAt(nextHour()));
    setParams((current) => {
      ["new", "type", "id", "kind", "date", "title", "open"].forEach((key) => current.delete(key));
      return current;
    }, { replace: true });
  };

  const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), WEEK), end: endOfWeek(endOfMonth(cursor), WEEK) });
  const weekDays = eachDayOfInterval({ start: startOfWeek(cursor, WEEK), end: endOfWeek(cursor, WEEK) });
  const weekdayNames = weekDays.map((d) => format(d, "EEE"));

  const linkedOptions =
    draft.related_type === "creator"
      ? data.creators.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name} / ${item.platform}` }))
      : draft.related_type === "brand"
        ? data.brands.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name}${item.domain ? ` / ${item.domain}` : ""}` }))
        : draft.related_type === "campaign"
          ? data.campaigns.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name} / ${item.status}` }))
          : [];

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return toast("Give it a title", "error");
    if (new Date(draft.ends_at) <= new Date(draft.starts_at)) return toast("The end must be after the start", "error");
    const value = {
      title: draft.title.trim(),
      kind: draft.kind,
      starts_at: new Date(draft.starts_at).toISOString(),
      ends_at: new Date(draft.ends_at).toISOString(),
      related_type: draft.related_type && draft.related_id ? draft.related_type : null,
      related_id: draft.related_type && draft.related_id ? draft.related_id : null,
      notes: draft.notes,
      remind_at: remindValue(draft),
    };
    const label = MEETING_KIND_LABELS[draft.kind];
    if (editingId) {
      data.updateMeeting(editingId, value);
      toast(`${label} updated`);
    } else {
      data.addMeeting(value);
      toast(`${label} added · ${format(new Date(draft.starts_at), "EEE, MMM d 'at' p")}`);
    }
    const day = new Date(draft.starts_at);
    setSelectedDay(day);
    setCursor(day);
    close();
  };

  const setDuration = (minutes: number) => setDraft((current) => ({ ...current, ends_at: localInput(new Date(new Date(current.starts_at).getTime() + minutes * 60000)) }));
  const moveStart = (value: string) =>
    setDraft((current) => {
      // Keep the duration when the start moves.
      const duration = new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime();
      const start = new Date(value);
      if (Number.isNaN(start.getTime())) return { ...current, starts_at: value };
      return { ...current, starts_at: value, ends_at: localInput(new Date(start.getTime() + (duration > 0 ? duration : 30 * 60000))) };
    });

  const navigateDate = (direction: number) => {
    if (view === "month") setCursor(direction > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1));
    else {
      const next = addDays(view === "day" ? selectedDay : cursor, direction * (view === "week" ? 7 : 1));
      setCursor(next);
      setSelectedDay(next);
    }
  };
  const goToday = () => {
    setCursor(new Date());
    setSelectedDay(new Date());
  };

  const createOn = (day: Date, kind: MeetingKind = "meeting") => {
    const start = new Date(day);
    if (isSameDay(day, new Date())) start.setTime(nextHour().getTime());
    else start.setHours(10, 0, 0, 0);
    setDraft(draftAt(start, 30, kind));
    setEditingId(null);
    setOpen(true);
  };

  function openEdit(meeting: Meeting) {
    setDraft({
      title: meeting.title,
      kind: meeting.kind || "meeting",
      starts_at: localInput(new Date(meeting.starts_at)),
      ends_at: localInput(new Date(meeting.ends_at)),
      related_type: meeting.related_type || "",
      related_id: meeting.related_id || "",
      notes: meeting.notes,
      ...remindPreset(meeting),
    });
    setEditingId(meeting.id);
    setOpen(true);
  }

  const openItem = (item: CalItem) => {
    if (item.meeting) openEdit(item.meeting);
    else if (item.source === "action") setActionItem(item);
    else if (item.to) navigate(item.to);
  };

  const removeMeeting = () => {
    if (!editingId) return;
    const target = data.meetings.find((m) => m.id === editingId);
    if (confirm(`Delete "${target?.title || "this entry"}"? This cannot be undone.`)) {
      data.deleteMeeting(editingId);
      toast(`${MEETING_KIND_LABELS[target?.kind || "meeting"]} deleted`);
      close();
    }
  };

  const toggleDone = (item: CalItem) => {
    if (item.meeting) {
      data.updateMeeting(item.meeting.id, { done: !item.meeting.done }, { activity: `${item.meeting.done ? "Reopened" : "Completed"}: ${item.meeting.title}` });
      toast(item.meeting.done ? "Marked as not done" : "Done — nice work");
    } else if (item.entity) {
      data.completeAction(item.entity.type, item.entity.id);
      toast(`Action completed for ${item.entity.name}`);
      setActionItem(null);
    }
  };

  // Drag a meeting (keeps its time) or an action due (moves its date) to
  // another day.
  const moveItem = (key: string, day: Date) => {
    const item = items.find((i) => i.key === key);
    if (!item || isSameDay(item.start, day)) return;
    if (item.meeting) {
      const start = new Date(item.meeting.starts_at);
      const shift = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes()).getTime() - start.getTime();
      data.updateMeeting(item.meeting.id, {
        starts_at: new Date(start.getTime() + shift).toISOString(),
        ends_at: new Date(new Date(item.meeting.ends_at).getTime() + shift).toISOString(),
        remind_at: item.meeting.remind_at ? new Date(new Date(item.meeting.remind_at).getTime() + shift).toISOString() : null,
      }, { activity: `${item.meeting.title} moved to ${format(day, "MMM d")}` });
      toast(`Moved to ${format(day, "EEE, MMM d")}`);
    } else if (item.entity) {
      const due = dayKey(day);
      const update = { next_action_date: due };
      const activity = `Action for ${item.entity.name} rescheduled to ${dateLabel(due)}`;
      if (item.entity.type === "creator") data.updateCreator(item.entity.id, update, { activity });
      else data.updateBrand(item.entity.id, update, { activity });
      toast(`Rescheduled · ${dueLabel(due)}`);
    }
  };
  const dragProps = (item: CalItem) =>
    item.source === "campaign"
      ? {}
      : {
          draggable: true,
          onDragStart: (event: DragEvent) => {
            event.dataTransfer.setData("text/plain", item.key);
            event.dataTransfer.effectAllowed = "move";
          },
        };
  const dropProps = (day: Date) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setDragOver(dayKey(day));
    },
    onDragLeave: () => setDragOver((current) => (current === dayKey(day) ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragOver(null);
      const key = event.dataTransfer.getData("text/plain");
      if (key) moveItem(key, day);
    },
  });

  const exportIcs = () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InfluenceFlow//CRM//EN", "CALSCALE:GREGORIAN"];
    const stamp = icsDate(new Date());
    for (const item of items) {
      if (item.done) continue;
      lines.push("BEGIN:VEVENT", `UID:${item.key}@influenceflow`, `DTSTAMP:${stamp}`);
      if (item.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDay(item.start)}`, `DTEND;VALUE=DATE:${icsDay(addDays(item.start, 1))}`);
      else lines.push(`DTSTART:${icsDate(item.start)}`, `DTEND:${icsDate(item.end)}`);
      lines.push(`SUMMARY:${icsText(item.source === "action" ? `${item.title} — ${item.entity?.name}` : item.title)}`, `DESCRIPTION:${icsText([item.subtitle, item.meeting?.notes].filter(Boolean).join("\n"))}`);
      if (item.meeting?.remind_at) {
        const before = Math.max(0, Math.round((item.start.getTime() - new Date(item.meeting.remind_at).getTime()) / 60000));
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(item.title)}`, `TRIGGER:-PT${before}M`, "END:VALARM");
      }
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    download("influenceflow-calendar.ics", lines.join("\r\n"), "text/calendar");
    toast("Calendar exported — import it into Google Calendar, Outlook or Apple Calendar");
  };

  const title = view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], weekDays[0].getFullYear() === weekDays[6].getFullYear() ? "MMM d, yyyy" : "MMM d, yyyy")}` : format(selectedDay, "EEEE, MMMM d, yyyy");
  const selectedItems = itemsOn(selectedDay);

  const chip = (item: CalItem, compact = false) => (
    <div
      key={item.key}
      role="button"
      tabIndex={0}
      className={`cal-chip kind-${item.kind}${item.done ? " done" : ""}${item.overdue ? " overdue" : ""}`}
      title={`${item.allDay ? "All day" : `${timeLabel(item.start.toISOString())} – ${timeLabel(item.end.toISOString())}`} · ${item.title} · ${item.subtitle}`}
      onClick={(event) => {
        event.stopPropagation();
        openItem(item);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") openItem(item);
      }}
      {...dragProps(item)}
    >
      {kindIcon(item.kind, 11)}
      {!item.allDay && <b>{format(item.start, "h:mmaaaaa")}</b>}
      <span>{item.source === "action" && compact ? `${item.entity?.name}: ${item.title}` : item.title}</span>
    </div>
  );

  const row = (item: CalItem, showDate = false): ReactNode => (
    <article key={item.key} className={`cal-row kind-${item.kind}${item.done ? " done" : ""}${item.overdue ? " overdue" : ""}`} onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === "Enter") openItem(item); }} tabIndex={0} {...dragProps(item)}>
      {item.source !== "campaign" && item.kind !== "meeting" ? (
        <button className={`cal-check${item.done ? " checked" : ""}`} onClick={(event) => { event.stopPropagation(); toggleDone(item); }} aria-label={item.done ? "Mark as not done" : "Mark as done"} title={item.done ? "Mark as not done" : "Mark as done"}>{item.done && <Check size={12} />}</button>
      ) : (
        <span className="cal-row-icon">{kindIcon(item.kind)}</span>
      )}
      <div className="cal-row-time">{item.allDay ? <strong>{showDate ? format(item.start, "MMM d") : "All day"}</strong> : <><strong>{showDate ? format(item.start, "MMM d") : timeLabel(item.start.toISOString())}</strong><small>{showDate ? timeLabel(item.start.toISOString()) : `${Math.max(0, Math.round((item.end.getTime() - item.start.getTime()) / 60000))} min`}</small></>}</div>
      <div className="cal-row-body"><strong>{item.title}</strong><small>{item.overdue && !item.done ? <em className="overdue-text">{item.source === "action" ? dueLabel(dayKey(item.start)) : "Overdue"} · </em> : null}{item.subtitle}</small>{item.meeting?.notes && <p>{item.meeting.notes}</p>}</div>
      {item.to && <Link to={item.to} className="cal-row-link" onClick={(event) => event.stopPropagation()} aria-label="Open linked record" title="Open linked record"><ArrowRight size={14} /></Link>}
    </article>
  );

  const counts = { overdue: overdue.length, today: itemsOn(new Date()).filter((i) => !i.done).length };

  return <div className="calendar-page"><PageHeader eyebrow="Follow-up workspace" title="Calendar" description="Meetings, tasks, reminders, action due dates and campaign deadlines — one timeline, linked to the right relationship." actions={<><Button variant="secondary" onClick={exportIcs}><Download size={15} /> Export .ics</Button><Button onClick={() => createOn(view === "month" ? selectedDay : view === "day" ? selectedDay : cursor)}><Plus size={16} /> New entry</Button></>} />
    <div className="calendar-toolbar"><div className="calendar-nav"><button onClick={() => navigateDate(-1)} aria-label="Previous"><ChevronLeft /></button><button className="today-button" onClick={goToday}>Today</button><button onClick={() => navigateDate(1)} aria-label="Next"><ChevronRight /></button><h2>{title}</h2></div><Tabs active={view} onChange={changeView} tabs={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }, { value: "agenda", label: "Agenda" }]} /></div>
    <div className="cal-filters">{FILTERS.map((f) => <button key={f.key} className={`cal-filter kind-${f.key}${filters[f.key] ? " on" : ""}`} onClick={() => toggleFilter(f.key)} aria-pressed={filters[f.key]}><i />{f.label}</button>)}<span className="cal-summary">{counts.today} today{counts.overdue ? <> · <b>{counts.overdue} overdue</b></> : null}</span></div>
    <div className="calendar-layout"><main>
      {view === "month" && <div className="month-calendar"><div className="weekday-row">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid cal-month">{monthDays.map((day) => {
        const dayItems = itemsOn(day);
        const key = dayKey(day);
        return <div role="button" tabIndex={0} className={`cal-day${!isSameMonth(day, cursor) ? " outside" : ""}${isSameDay(day, new Date()) ? " today" : ""}${isSameDay(day, selectedDay) ? " selected" : ""}${dragOver === key ? " drop" : ""}${day.getTime() < startOfToday.getTime() ? " past" : ""}`} key={key} onClick={() => setSelectedDay(day)} onDoubleClick={() => createOn(day)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedDay(day); }} {...dropProps(day)}>
          <div className="cal-day-head"><span>{format(day, "d")}</span><button className="cal-day-add" onClick={(event) => { event.stopPropagation(); createOn(day); }} aria-label={`Add on ${format(day, "MMMM d")}`} title="Add entry"><Plus size={12} /></button></div>
          <div className="cal-day-items">{dayItems.slice(0, 3).map((item) => chip(item, true))}{dayItems.length > 3 && <button className="cal-more" onClick={(event) => { event.stopPropagation(); setSelectedDay(day); }}>+{dayItems.length - 3} more</button>}</div>
        </div>;
      })}</div><p className="cal-tip">Click a day to see its agenda · double-click or + to add · drag meetings and action dues to reschedule</p></div>}
      {view === "week" && <div className="cal-week">{weekDays.map((day) => {
        const dayItems = itemsOn(day);
        return <section key={dayKey(day)} className={`cal-week-col${isSameDay(day, new Date()) ? " today" : ""}${dragOver === dayKey(day) ? " drop" : ""}`} {...dropProps(day)}><header onClick={() => { setSelectedDay(day); changeView("day"); }} title="Open day"><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong></header><div className="cal-week-items">{dayItems.map((item) => chip(item))}{!dayItems.length && <p className="cal-empty">Free</p>}</div><button className="cal-week-add" onClick={() => createOn(day)} aria-label={`Add on ${format(day, "MMMM d")}`}><Plus size={13} /></button></section>;
      })}</div>}
      {view === "day" && <div className={`cal-dayview${dragOver === dayKey(selectedDay) ? " drop" : ""}`} {...dropProps(selectedDay)}><header><div><span>{format(selectedDay, "EEEE")}</span><strong>{format(selectedDay, "d")}</strong></div><p>{isSameDay(selectedDay, new Date()) ? "Today" : format(selectedDay, "MMMM yyyy")}</p><div className="cal-day-actions"><Button size="sm" variant="secondary" onClick={() => createOn(selectedDay, "task")}><ListTodo size={14} /> Task</Button><Button size="sm" onClick={() => createOn(selectedDay)}><Plus size={14} /> Meeting</Button></div></header>{selectedItems.length ? <div className="cal-rows">{selectedItems.map((item) => row(item))}</div> : <div className="cal-empty-day"><CircleCheck size={22} /><strong>Nothing scheduled</strong><span>A clear day — book a call or set an action due date on a profile.</span></div>}</div>}
      {view === "agenda" && <div className="cal-agenda">{(() => {
        const future = visible.filter((item) => !item.done && (item.allDay ? item.start.getTime() >= startOfToday.getTime() : item.end.getTime() >= Date.now()));
        if (!future.length) return <div className="cal-empty-day"><CircleCheck size={22} /><strong>Nothing coming up</strong><span>Everything ahead of you will be listed here, day by day.</span></div>;
        const groups = new Map<string, CalItem[]>();
        for (const item of future.slice(0, 120)) groups.set(dayKey(item.start), [...(groups.get(dayKey(item.start)) || []), item]);
        return Array.from(groups.entries()).map(([key, group]) => { const day = parseDay(key)!; return <section key={key}><h3>{isSameDay(day, new Date()) ? "Today" : isSameDay(day, addDays(new Date(), 1)) ? "Tomorrow" : format(day, "EEEE, MMMM d")}</h3><div className="cal-rows">{group.map((item) => row(item))}</div></section>; });
      })()}</div>}
    </main>
      <aside className="upcoming-panel">
        {view === "month" && <div className="cal-side-block"><div className="cal-side-head"><div><span>{isSameDay(selectedDay, new Date()) ? "Today" : format(selectedDay, "EEEE")}</span><h2>{format(selectedDay, "MMMM d")}</h2></div><button className="cal-side-add" onClick={() => createOn(selectedDay)} aria-label="Add entry on this day"><Plus size={15} /></button></div>{selectedItems.length ? <div className="cal-rows compact">{selectedItems.map((item) => row(item))}</div> : <p className="muted-copy">Nothing on this day.</p>}</div>}
        {overdue.length > 0 && <div className="cal-side-block overdue-block"><div className="cal-side-head"><div><span><AlertCircle size={11} /> Needs attention</span><h2>Overdue</h2></div><b className="count-pill">{overdue.length}</b></div><div className="cal-rows compact">{overdue.slice(0, 6).map((item) => row(item, true))}</div></div>}
        <div className="cal-side-block"><div className="cal-side-head"><div><span>Next 14 days</span><h2>Upcoming</h2></div></div>{upcoming.length ? <div className="cal-rows compact">{upcoming.map((item) => row(item, true))}</div> : <p className="muted-copy">Nothing in the next two weeks.</p>}</div>
        <button className="notification-permission" onClick={async () => { if (!("Notification" in window)) return toast("Browser notifications are unavailable", "error"); const result = await Notification.requestPermission(); toast(result === "granted" ? "Browser reminders enabled" : "Notification permission was not granted", result === "granted" ? "success" : "info"); }}><Bell /><span><strong>Browser reminders</strong><small>{"Notification" in window ? (Notification.permission === "granted" ? "On — alerts while InfluenceFlow is open" : Notification.permission === "denied" ? "Blocked in browser settings" : "Off — click to enable") : "Unavailable"}</small></span><ArrowRight /></button>
      </aside>
    </div>

    <Modal open={!!actionItem} onClose={() => setActionItem(null)} title={actionItem?.title || "Action"} description={actionItem ? `${actionItem.subtitle} · ${dueLabel(dayKey(actionItem.start))}` : undefined}>
      {actionItem && <div className="action-sheet">
        <p>Action due dates come straight from the {actionItem.entity?.type === "creator" ? "influencer" : "brand"} profile. Reschedule it here, drag it on the month view, or mark it done.</p>
        <Input label="Due date" type="date" value={dayKey(actionItem.start)} onChange={(event) => { const day = parseDay(event.target.value); if (day) { moveItem(actionItem.key, day); setActionItem({ ...actionItem, start: day, end: day }); } }} />
        <div className="modal-actions"><Link className="btn btn-ghost btn-md" to={actionItem.to || "#"}><ExternalLink size={14} /> Open profile</Link><Button variant="secondary" onClick={() => { const e = actionItem.entity; setActionItem(null); if (e) navigate(`/app/calendar?new=1&kind=task&type=${e.type}&id=${e.id}&date=${dayKey(actionItem.start)}&title=${encodeURIComponent(actionItem.title)}`); }}><Clock3 size={14} /> Add a time</Button><Button onClick={() => toggleDone(actionItem)}><Check size={14} /> Mark done</Button></div>
      </div>}
    </Modal>

    <Modal open={open} onClose={close} title={editingId ? `Edit ${MEETING_KIND_LABELS[draft.kind].toLowerCase()}` : `New ${MEETING_KIND_LABELS[draft.kind].toLowerCase()}`} description={editingId ? "Update the details, or remove it entirely." : "Link it to an influencer, brand or campaign so the context is never lost."} wide><form className="meeting-form" onSubmit={save}>
      <label className="field-wrap"><span className="field-label">Entry type</span><Tabs active={draft.kind} onChange={(value) => setDraft({ ...draft, kind: value as MeetingKind })} tabs={[{ value: "meeting", label: "Meeting" }, { value: "task", label: "Task" }, { value: "reminder", label: "Reminder" }]} /></label>
      <Input label="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required autoFocus placeholder={draft.kind === "task" ? "Send contract, chase invoice, review draft…" : draft.kind === "reminder" ? "Nudge brand about proposal…" : "Creative review, intro call…"} />
      <div className="form-grid"><Input label="Starts" type="datetime-local" value={draft.starts_at} onChange={(event) => moveStart(event.target.value)} required /><Input label="Ends" type="datetime-local" value={draft.ends_at} min={draft.starts_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} required /></div>
      <div className="duration-row"><span>Duration</span>{[15, 30, 45, 60, 90].map((value) => { const active = new Date(draft.ends_at).getTime() - new Date(draft.starts_at).getTime() === value * 60000; return <button type="button" key={value} className={active ? "active" : ""} onClick={() => setDuration(value)}>{value < 60 ? `${value} min` : `${value / 60} h`}</button>; })}</div>
      <div className="form-grid"><Select label="Link to" value={draft.related_type} onChange={(event) => setDraft({ ...draft, related_type: event.target.value as RelatedType, related_id: "" })}><option value="">No linked record</option><option value="creator">Influencer</option><option value="brand">Brand</option><option value="campaign">Campaign</option></Select><Select label="Choose record" value={draft.related_id} onChange={(event) => setDraft({ ...draft, related_id: event.target.value })} disabled={!draft.related_type}><option value="">{draft.related_type ? "Choose…" : "Pick a type first"}</option>{linkedOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div>
      <div className="form-grid"><Select label="Reminder" value={draft.remind} onChange={(event) => setDraft({ ...draft, remind: event.target.value, remind_at: event.target.value === "custom" ? draft.remind_at || localInput(new Date(new Date(draft.starts_at).getTime() - 30 * 60000)) : "" })}>{REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>{draft.remind === "custom" ? <Input label="Remind at" type="datetime-local" value={draft.remind_at} onChange={(event) => setDraft({ ...draft, remind_at: event.target.value })} /> : <div className="field-wrap reminder-note"><span className="field-label">&nbsp;</span><p>{draft.remind === "none" ? "No alert" : `Alert ${remindValue(draft) ? format(new Date(remindValue(draft)!), "EEE MMM d, p") : ""}`} · browser alerts work while InfluenceFlow is open</p></div>}</div>
      {draft.related_type && draft.related_id && <p className="linked-preview"><Link2 size={13} /> Linked to <strong>{entityName(draft.related_type, draft.related_id)}</strong> — it will show on their profile.</p>}
      <Textarea label="Notes" rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Agenda, links, or talking points..." />
      <div className="modal-actions">{editingId ? <Button type="button" variant="danger" onClick={removeMeeting}>Delete</Button> : null}{editingId && draft.kind !== "meeting" ? <Button type="button" variant="secondary" onClick={() => { const m = data.meetings.find((x) => x.id === editingId); if (m) { data.updateMeeting(m.id, { done: !m.done }, { activity: `${m.done ? "Reopened" : "Completed"}: ${m.title}` }); toast(m.done ? "Reopened" : "Marked done"); close(); } }}><Check size={14} /> {data.meetings.find((x) => x.id === editingId)?.done ? "Reopen" : "Mark done"}</Button> : null}<Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit">{editingId ? "Save changes" : "Add to calendar"}</Button></div>
    </form></Modal>
  </div>;
}
