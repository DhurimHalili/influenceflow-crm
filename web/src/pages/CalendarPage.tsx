import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ArrowRight, Bell, ChevronLeft, ChevronRight, Clock3, Link2, ListTodo, Plus, Video } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, EmptyState, Input, Modal, PageHeader, Select, Tabs, Textarea } from "../components/ui";
import { useData } from "../contexts/DataContext";
import { useToast } from "../contexts/ToastContext";
import { MEETING_KIND_LABELS, timeLabel } from "../lib/utils";
import type { MeetingKind } from "../types";

type MeetingDraft = { title: string; kind: MeetingKind; starts_at: string; ends_at: string; related_type: "creator" | "brand" | "campaign" | ""; related_id: string; notes: string; remind_at: string };
const localInput = (date: Date) => { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); };
const initialDraft = (): MeetingDraft => { const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1); const end = new Date(start.getTime() + 30 * 60000); return { title: "", kind: "meeting", starts_at: localInput(start), ends_at: localInput(end), related_type: "", related_id: "", notes: "", remind_at: localInput(new Date(start.getTime() - 30 * 60000)) }; };

const kindIcon = (kind: string | null) => kind === "task" ? <ListTodo size={15} /> : kind === "reminder" ? <Bell size={15} /> : <Video size={15} />;

export default function CalendarPage() {
  const data = useData(); const { toast } = useToast(); const [params, setParams] = useSearchParams(); const [view, setView] = useState("month"); const [cursor, setCursor] = useState(new Date()); const [open, setOpen] = useState(false); const [draft, setDraft] = useState<MeetingDraft>(initialDraft());   const [selectedDay, setSelectedDay] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { if (params.get("new")) { const next = initialDraft(); const type = params.get("type"); const kindParam = params.get("kind"); setDraft({ ...next, kind: kindParam === "task" || kindParam === "reminder" ? kindParam : "meeting", related_type: type === "creator" || type === "brand" || type === "campaign" ? type : "", related_id: params.get("id") || "" }); setEditingId(null); setOpen(true); } }, [params]);
  const close = () => { setOpen(false); setEditingId(null); setDraft(initialDraft()); setParams((current) => { ["new", "type", "id", "kind"].forEach((key) => current.delete(key)); return current; }, { replace: true }); };
  const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) });
  const weekDays = eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
  const visibleDays = view === "month" ? monthDays : view === "week" ? weekDays : [selectedDay];
  const meetings = data.meetings.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = meetings.filter((item) => new Date(item.ends_at).getTime() >= Date.now()).slice(0, 8);
  const linkedOptions = draft.related_type === "creator" ? data.creators.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name} / ${item.platform}` })) : draft.related_type === "brand" ? data.brands.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name} / ${item.domain}` })) : draft.related_type === "campaign" ? data.campaigns.filter((item) => !item.archived_at).map((item) => ({ id: item.id, label: `${item.name} / ${item.status}` })) : [];
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (new Date(draft.ends_at) <= new Date(draft.starts_at)) { toast("Meeting end must be after the start", "error"); return; }
    const value = { title: draft.title, kind: draft.kind, starts_at: new Date(draft.starts_at).toISOString(), ends_at: new Date(draft.ends_at).toISOString(), related_type: draft.related_type || null, related_id: draft.related_id || null, notes: draft.notes, remind_at: draft.remind_at ? new Date(draft.remind_at).toISOString() : null };
    if (editingId) { data.updateMeeting(editingId, value); toast("Meeting updated"); }
    else { data.addMeeting(value); toast("Meeting added to your calendar"); }
    close();
  };
  const setDuration = (minutes: number) => setDraft((current) => ({ ...current, ends_at: localInput(new Date(new Date(current.starts_at).getTime() + minutes * 60000)) }));
  const entityName = (type: string | null, id: string | null) => type === "creator" ? data.creators.find((item) => item.id === id)?.name : type === "brand" ? data.brands.find((item) => item.id === id)?.name : type === "campaign" ? data.campaigns.find((item) => item.id === id)?.name : null;
  const navigateDate = (direction: number) => { if (view === "month") setCursor(direction > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1)); else { const next = addDays(cursor, direction * (view === "week" ? 7 : 1)); setCursor(next); setSelectedDay(next); } };
  const dayCreate = (day: Date) => { const start = new Date(day); start.setHours(10, 0, 0, 0); const end = new Date(start.getTime() + 30 * 60000); setDraft({ ...initialDraft(), starts_at: localInput(start), ends_at: localInput(end), remind_at: localInput(new Date(start.getTime() - 30 * 60000)) }); setEditingId(null); setOpen(true); };
  const openEdit = (meeting: (typeof meetings)[number]) => {
    setDraft({
      title: meeting.title,
      kind: meeting.kind || "meeting",
      starts_at: localInput(new Date(meeting.starts_at)),
      ends_at: localInput(new Date(meeting.ends_at)),
      related_type: meeting.related_type || "",
      related_id: meeting.related_id || "",
      notes: meeting.notes,
      remind_at: meeting.remind_at ? localInput(new Date(meeting.remind_at)) : "",
    });
    setEditingId(meeting.id);
    setOpen(true);
  };
  const removeMeeting = () => {
    if (!editingId) return;
    const target = data.meetings.find((m) => m.id === editingId);
    if (confirm(`Delete "${target?.title || "this meeting"}"? This cannot be undone.`)) {
      data.deleteMeeting(editingId);
      toast("Meeting deleted");
      close();
    }
  };

  return <div className="calendar-page"><PageHeader eyebrow="Follow-up workspace" title="Calendar" description="Meetings, tasks and reminders — everything time-bound lives here, linked to the right relationship." actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> New entry</Button>} />
    <div className="calendar-toolbar"><div className="calendar-nav"><button onClick={() => navigateDate(-1)}><ChevronLeft /></button><button className="today-button" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()); }}>Today</button><button onClick={() => navigateDate(1)}><ChevronRight /></button><h2>{view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `${format(weekDays[0], "MMM d")} - ${format(weekDays[6], "MMM d, yyyy")}` : format(selectedDay, "EEEE, MMMM d")}</h2></div><Tabs active={view} onChange={setView} tabs={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }]} /></div>
    <div className="calendar-layout"><main>{view === "month" ? <div className="month-calendar"><div className="weekday-row">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{visibleDays.map((day) => { const dayMeetings = meetings.filter((item) => isSameDay(new Date(item.starts_at), day)); return <button className={`${!isSameMonth(day, cursor) ? "outside" : ""} ${isSameDay(day, new Date()) ? "today" : ""}`} key={day.toISOString()} onClick={() => { setSelectedDay(day); if (dayMeetings.length === 0) dayCreate(day); }}><span>{format(day, "d")}</span><div>{dayMeetings.slice(0, 3).map((meeting) => <i key={meeting.id} title="Edit meeting" className={`kind-${meeting.kind}`} onClick={(event) => { event.stopPropagation(); openEdit(meeting); }}><b>{timeLabel(meeting.starts_at)}</b>{meeting.title}</i>)}{dayMeetings.length > 3 && <em>+{dayMeetings.length - 3} more</em>}</div></button>; })}</div></div> : <AgendaView days={visibleDays} meetings={meetings} onCreate={dayCreate} onEdit={openEdit} />}</main>
      <aside className="upcoming-panel"><div><span>Next up</span><h2>Upcoming</h2></div>{upcoming.length ? <div className="upcoming-list">{upcoming.map((meeting) => <article key={meeting.id} className="clickable" title="Edit meeting" onClick={() => openEdit(meeting)} onKeyDown={(event) => { if (event.key === "Enter") openEdit(meeting); }} tabIndex={0}><div className="upcoming-date"><strong>{format(new Date(meeting.starts_at), "d")}</strong><span>{format(new Date(meeting.starts_at), "MMM")}</span></div><div><strong>{meeting.title}</strong><span className={`kind-chip kind-${meeting.kind}`}>{MEETING_KIND_LABELS[meeting.kind]}</span><span><Clock3 /> {timeLabel(meeting.starts_at)} - {timeLabel(meeting.ends_at)}</span>{meeting.related_type && <span><Link2 /> {entityName(meeting.related_type, meeting.related_id)}</span>}</div></article>)}</div> : <EmptyState title="Nothing scheduled" text="Add a meeting or follow-up to start your agenda." />}<button className="notification-permission" onClick={async () => { if (!("Notification" in window)) return toast("Browser notifications are unavailable", "error"); const result = await Notification.requestPermission(); toast(result === "granted" ? "Browser reminders enabled" : "Notification permission was not granted", result === "granted" ? "success" : "info"); }}><Bell /><span><strong>Browser reminders</strong><small>{"Notification" in window ? Notification.permission : "Unavailable"}</small></span><ArrowRight /></button></aside>
    </div>
    <Modal open={open} onClose={close} title={editingId ? `Edit ${MEETING_KIND_LABELS[draft.kind].toLowerCase()}` : `New ${MEETING_KIND_LABELS[draft.kind].toLowerCase()}`} description={editingId ? "Update the details, or remove it entirely." : "Meetings, tasks and reminders all live here — link it so the context is never lost."} wide><form className="meeting-form" onSubmit={create}><label className="field-wrap"><span className="field-label">Entry type</span><Tabs active={draft.kind} onChange={(value) => setDraft({ ...draft, kind: value as MeetingKind })} tabs={[{ value: "meeting", label: "Meeting" }, { value: "task", label: "Task" }, { value: "reminder", label: "Reminder" }]} /></label><Input label="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required autoFocus placeholder="Creative review, email an influencer, nudge a brand..." /><div className="form-grid"><Input label="Starts" type="datetime-local" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} required /><Input label="Ends" type="datetime-local" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} required /></div><div className="duration-row"><span>Quick duration</span>{[15, 30, 45, 60].map((value) => <button type="button" key={value} onClick={() => setDuration(value)}>{value} min</button>)}</div><div className="form-grid"><Select label="Link to" value={draft.related_type} onChange={(event) => setDraft({ ...draft, related_type: event.target.value as MeetingDraft["related_type"], related_id: "" })}><option value="">No linked record</option><option value="creator">Influencer</option><option value="brand">Brand</option><option value="campaign">Campaign</option></Select><Select label="Choose record" value={draft.related_id} onChange={(event) => setDraft({ ...draft, related_id: event.target.value })} disabled={!draft.related_type}><option value="">Search or choose...</option>{linkedOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div><Input label="Remind at" type="datetime-local" value={draft.remind_at} onChange={(event) => setDraft({ ...draft, remind_at: event.target.value })} hint="Browser alerts work while InfluenceFlow is open." /><Textarea label="Notes" rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Agenda, links, or talking points..." /><div className="modal-actions">{editingId ? <Button type="button" variant="danger" onClick={removeMeeting}>Delete</Button> : null}<Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit">{editingId ? "Save changes" : "Add to calendar"}</Button></div></form></Modal>
  </div>;
}

function AgendaView({ days, meetings, onCreate, onEdit }: { days: Date[]; meetings: ReturnType<typeof useData>["meetings"]; onCreate: (date: Date) => void; onEdit: (meeting: ReturnType<typeof useData>["meetings"][number]) => void }) {
  return <div className="agenda-view">{days.map((day) => { const items = meetings.filter((item) => isSameDay(new Date(item.starts_at), day)); return <section key={day.toISOString()}><header><div><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong></div><p>{isSameDay(day, new Date()) ? "Today" : format(day, "MMMM d")}</p><button onClick={() => onCreate(day)}><Plus size={14} /> Add</button></header><div>{items.map((meeting) => <article key={meeting.id} className="clickable" title="Edit meeting" onClick={() => onEdit(meeting)} onKeyDown={(event) => { if (event.key === "Enter") onEdit(meeting); }} tabIndex={0}><i /><span><strong>{timeLabel(meeting.starts_at)}</strong><small>{Math.round((new Date(meeting.ends_at).getTime() - new Date(meeting.starts_at).getTime()) / 60000)} min</small></span><div><strong>{meeting.title}</strong><p>{meeting.notes || MEETING_KIND_LABELS[meeting.kind] || "No notes"}</p></div>{kindIcon(meeting.kind)}</article>)}{!items.length && <p className="agenda-no-events">No meetings scheduled.</p>}</div></section>; })}</div>;
}