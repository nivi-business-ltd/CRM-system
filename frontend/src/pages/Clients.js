import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, STAGE_COLORS, initials } from "@/lib/crm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Plus, Search, MoreVertical, Pencil, Trash2, Users, Upload, Download, FileSpreadsheet } from "lucide-react";

const STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const EMPTY = { name: "", email: "", phone: "", company: "", notes: "", stage: "Lead", deal_value: "", assigned_to: null };

export default function Clients() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (stageFilter !== "all") params.stage = stageFilter;
    const r = await api.get("/clients", { params });
    setClients(r.data);
    setLoading(false);
  }, [q, stageFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (isAdmin) api.get("/employees").then((r) => setEmployees(r.data));
  }, [isAdmin]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...c, deal_value: String(c.deal_value ?? ""), assigned_to: c.assigned_to || null });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Client name is required");
    setSaving(true);
    const payload = { ...form, deal_value: parseFloat(form.deal_value) || 0 };
    try {
      if (editing) {
        await api.put(`/clients/${editing.id}`, payload);
        toast.success("Client updated");
      } else {
        await api.post("/clients", payload);
        toast.success("Client added");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
    setSaving(false);
  };

  const remove = async () => {
    try {
      await api.delete(`/clients/${deleteTarget.id}`);
      toast.success("Client deleted");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const empName = (id) => employees.find((e) => e.id === id)?.name;

  const runImport = async () => {
    if (!importFile) return toast.error("Choose a CSV or Excel file first");
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    try {
      const { data } = await api.post("/clients/import", fd);
      toast.success(`Imported ${data.created} client${data.created === 1 ? "" : "s"}`);
      if (data.errors?.length) toast.warning(`${data.errors.length} row(s) skipped (missing name)`);
      setImportOpen(false);
      setImportFile(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const csv =
      "name,email,phone,company,stage,deal_value,notes\n" +
      "Rahul Mehta,rahul@brightcorp.in,+91 98765 43210,Bright Corp,Lead,50000,First meeting done\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nivi_clients_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-testid="clients-page">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, company, email…"
            className="pl-10 h-11 bg-white"
            data-testid="client-search-input"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[160px] h-11 bg-white" data-testid="stage-filter">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => { setImportFile(null); setImportOpen(true); }}
            className="h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
            data-testid="import-clients-button"
          >
            <Upload className="h-4 w-4 mr-1.5" /> Import
          </Button>
          <Button
            onClick={openCreate}
            className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            data-testid="add-client-button"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add Client
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                <th className="px-5 py-3 font-semibold text-slate-500">Client</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Contact</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Stage</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-right">Deal Value</th>
                {isAdmin && <th className="px-5 py-3 font-semibold text-slate-500">Assigned To</th>}
                <th className="px-5 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No clients found</p>
                    <p className="text-sm text-slate-400">Add your first client to get started.</p>
                  </td>
                </tr>
              )}
              {!loading &&
                clients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-50 hover:bg-emerald-50/40 transition-colors"
                    data-testid={`client-row-${c.id}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400 truncate">{c.company || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <p className="truncate">{c.email || "—"}</p>
                      <p className="text-xs text-slate-400">{c.phone || ""}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant="outline" className={STAGE_COLORS[c.stage]}>
                        {c.stage}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-800">
                      {formatCurrency(c.deal_value)}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-slate-600">
                        {c.assignee_name || empName(c.assigned_to) || (
                          <span className="text-slate-300">Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger data-testid={`client-actions-${c.id}`} className="outline-none">
                          <MoreVertical className="h-4 w-4 text-slate-400 hover:text-slate-700" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white">
                          <DropdownMenuItem onClick={() => openEdit(c)} className="cursor-pointer">
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(c)}
                            className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="client-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Edit Client" : "Add New Client"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="client-name-input"
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="client-email-input" />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="client-phone-input" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="client-company-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger data-testid="client-stage-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white">
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Deal Value (₹)</Label>
                <Input
                  type="number"
                  value={form.deal_value}
                  onChange={(e) => setForm({ ...form, deal_value: e.target.value })}
                  data-testid="client-value-input"
                  placeholder="0"
                />
              </div>
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Assign To</Label>
                <Select
                  value={form.assigned_to || "unassigned"}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v === "unassigned" ? null : v })}
                >
                  <SelectTrigger data-testid="client-assign-select"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="client-notes-input" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="client-save-button">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-white sm:max-w-md" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Import Clients</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-slate-500">
              Upload a CSV or Excel file. Recognised columns: <span className="font-medium text-slate-700">name</span> (required),
              email, phone, company, stage, deal_value, notes.
            </p>
            <button
              onClick={downloadTemplate}
              data-testid="download-template-button"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 w-fit"
            >
              <Download className="h-4 w-4" /> Download CSV template
            </button>
            <label
              htmlFor="import-file"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-8 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
            >
              <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
              <span className="text-sm text-slate-600">
                {importFile ? importFile.name : "Click to choose a .csv or .xlsx file"}
              </span>
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                data-testid="import-file-input"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={importing} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="import-submit-button">
              {importing ? "Importing…" : "Import Clients"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this client?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-semibold">{deleteTarget?.name}</span> and their tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-client">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
