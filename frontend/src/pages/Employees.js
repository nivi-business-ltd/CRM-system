import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { initials, formatCurrency, STAGE_COLORS } from "@/lib/crm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Trash2, ShieldCheck, Briefcase, Users, ChevronRight } from "lucide-react";

const EMPTY = { name: "", email: "", password: "" };

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewEmp, setViewEmp] = useState(null);
  const [viewClients, setViewClients] = useState([]);
  const [loadingView, setLoadingView] = useState(false);

  const openView = async (e) => {
    setViewEmp(e);
    setViewClients([]);
    setLoadingView(true);
    try {
      const r = await api.get("/clients", { params: { assigned_to: e.id } });
      setViewClients(r.data);
    } catch (_) {}
    setLoadingView(false);
  };

  const load = () => api.get("/employees").then((r) => setEmployees(r.data));

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6)
      return toast.error("Name, email and a 6+ char password are required");
    setSaving(true);
    try {
      await api.post("/employees", form);
      toast.success("Employee added");
      setDialogOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const remove = async () => {
    try {
      await api.delete(`/employees/${deleteTarget.id}`);
      toast.success("Employee removed");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6" data-testid="employees-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Add team members and see how many clients each manages.</p>
        <Button
          onClick={() => { setForm(EMPTY); setDialogOpen(true); }}
          className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          data-testid="add-employee-button"
        >
          <UserPlus className="h-4 w-4 mr-1.5" /> Add Employee
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((e) => (
          <Card key={e.id} onClick={() => openView(e)} className="p-5 border-slate-200 hover:shadow-md hover:border-emerald-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer" data-testid={`employee-card-${e.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  {initials(e.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{e.name}</p>
                  <p className="text-xs text-slate-400 truncate">{e.email}</p>
                </div>
              </div>
              {e.role !== "admin" && (
                <button onClick={(ev) => { ev.stopPropagation(); setDeleteTarget(e); }} data-testid={`delete-employee-${e.id}`} className="text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge
                variant="outline"
                className={e.role === "admin" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}
              >
                {e.role === "admin" ? <ShieldCheck className="h-3 w-3 mr-1" /> : null}
                {e.role === "admin" ? "Administrator" : "Employee"}
              </Badge>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <Briefcase className="h-4 w-4 text-emerald-500" /> {e.client_count} clients
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md" data-testid="employee-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Add Employee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="employee-name-input" />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="employee-email-input" />
            </div>
            <div className="grid gap-2">
              <Label>Temporary Password</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="employee-password-input" placeholder="min 6 characters" />
              <p className="text-xs text-slate-400">Share this with the employee so they can sign in.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="employee-save-button">
              {saving ? "Saving…" : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewEmp} onOpenChange={(o) => !o && setViewEmp(null)}>
        <DialogContent className="bg-white sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="employee-clients-dialog">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
                {initials(viewEmp?.name)}
              </span>
              <span>
                {viewEmp?.name}
                <span className="block text-xs font-normal text-slate-400">Assigned clients</span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {loadingView && <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>}
            {!loadingView && viewClients.length === 0 && (
              <div className="py-12 text-center">
                <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No clients assigned yet</p>
                <p className="text-sm text-slate-400">Assign clients to this team member from the Clients page.</p>
              </div>
            )}
            {!loadingView &&
              viewClients.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3" data-testid={`assigned-client-${c.id}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">{c.company || c.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-slate-700">{formatCurrency(c.deal_value)}</span>
                    <Badge variant="outline" className={STAGE_COLORS[c.stage]}>{c.stage}</Badge>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this employee?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleteTarget?.name}</span> will lose access. Their clients become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-employee">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
