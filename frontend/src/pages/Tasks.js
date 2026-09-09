import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PRIORITY_COLORS, STATUS_COLORS } from "@/lib/crm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, CheckSquare } from "lucide-react";

const PRIORITIES = ["High", "Medium", "Low"];
const STATUSES = ["Pending", "In Progress", "Completed"];
const EMPTY = { title: "", description: "", due_date: "", priority: "Medium", status: "Pending", client_id: null, assigned_to: null };

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = filter !== "all" ? { status: filter } : {};
    const r = await api.get("/tasks", { params });
    setTasks(r.data);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data));
    if (isAdmin) api.get("/employees").then((r) => setEmployees(r.data));
  }, [isAdmin]);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Task title is required");
    setSaving(true);
    try {
      await api.post("/tasks", { ...form, client_id: form.client_id || null, due_date: form.due_date || null });
      toast.success("Task created");
      setDialogOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const toggle = async (t) => {
    const status = t.status === "Completed" ? "Pending" : "Completed";
    try {
      await api.put(`/tasks/${t.id}`, { ...t, status });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const remove = async (t) => {
    try {
      await api.delete(`/tasks/${t.id}`);
      toast.success("Task deleted");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex items-center justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[170px] h-11 bg-white" data-testid="task-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">All tasks</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => { setForm(EMPTY); setDialogOpen(true); }}
          className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          data-testid="add-task-button"
        >
          <Plus className="h-4 w-4 mr-1.5" /> New Task
        </Button>
      </div>

      <div className="space-y-3">
        {tasks.length === 0 && (
          <Card className="p-16 text-center border-slate-200">
            <CheckSquare className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No tasks yet</p>
            <p className="text-sm text-slate-400">Create a reminder or follow-up to stay on track.</p>
          </Card>
        )}
        {tasks.map((t) => (
          <Card
            key={t.id}
            className="p-4 border-slate-200 flex items-start gap-4 hover:shadow-sm transition-all duration-200"
            data-testid={`task-row-${t.id}`}
          >
            <Checkbox
              checked={t.status === "Completed"}
              onCheckedChange={() => toggle(t)}
              className="mt-1 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
              data-testid={`task-checkbox-${t.id}`}
            />
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${t.status === "Completed" ? "line-through text-slate-400" : "text-slate-800"}`}>
                {t.title}
              </p>
              {t.description && <p className="text-sm text-slate-500 mt-0.5">{t.description}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className={PRIORITY_COLORS[t.priority]}>{t.priority}</Badge>
                <Badge variant="outline" className={STATUS_COLORS[t.status]}>{t.status}</Badge>
                {t.client_name && <span className="text-xs text-slate-400">· {t.client_name}</span>}
                {t.due_date && (
                  <span className="text-xs text-slate-400">· Due {new Date(t.due_date).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            <button onClick={() => remove(t)} data-testid={`task-delete-${t.id}`} className="text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white sm:max-w-lg" data-testid="task-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">New Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="task-title-input" placeholder="Call client to follow up" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} data-testid="task-desc-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white">
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} data-testid="task-due-input" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Related Client</Label>
              <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? null : v })}>
                <SelectTrigger data-testid="task-client-select"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Assign To</Label>
                <Select value={form.assigned_to || "me"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "me" ? null : v })}>
                  <SelectTrigger data-testid="task-assign-select"><SelectValue placeholder="Myself" /></SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="me">Myself</SelectItem>
                    {employees.filter((e) => e.role === "employee").map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="task-save-button">
              {saving ? "Saving…" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
