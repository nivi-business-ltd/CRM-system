import { useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { formatCurrency } from "@/lib/crm";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRightLeft } from "lucide-react";

const STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const HEADER = {
  Lead: "border-t-blue-400",
  Contacted: "border-t-violet-400",
  Proposal: "border-t-amber-400",
  Negotiation: "border-t-orange-400",
  "Closed Won": "border-t-emerald-500",
  "Closed Lost": "border-t-red-400",
};

export default function Pipeline() {
  const [clients, setClients] = useState([]);

  const load = useCallback(async () => {
    const r = await api.get("/clients");
    setClients(r.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = async (client, stage) => {
    try {
      await api.put(`/clients/${client.id}`, { ...client, deal_value: client.deal_value, stage });
      toast.success(`Moved ${client.name} → ${stage}`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const byStage = (s) => clients.filter((c) => c.stage === s);

  return (
    <div className="space-y-4" data-testid="pipeline-page">
      <p className="text-sm text-slate-500">
        Track every deal across stages. Use the menu on a card to move it forward.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {STAGES.map((stage) => {
          const items = byStage(stage);
          const total = items.reduce((sum, c) => sum + Number(c.deal_value || 0), 0);
          return (
            <div key={stage} className="flex flex-col" data-testid={`pipeline-stage-${stage.toLowerCase().replace(/\s+/g, "-")}`}>
              <Card className={`p-3 border-slate-200 border-t-4 ${HEADER[stage]} mb-3`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{stage}</p>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{formatCurrency(total)}</p>
              </Card>
              <div className="space-y-2 min-h-[60px]">
                {items.map((c) => (
                  <Card key={c.id} className="p-3 border-slate-200 hover:shadow-md transition-all duration-200 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.company || c.email || "—"}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="outline-none opacity-60 group-hover:opacity-100" data-testid={`move-client-${c.id}`}>
                          <ArrowRightLeft className="h-4 w-4 text-slate-400 hover:text-emerald-600" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white">
                          {STAGES.filter((s) => s !== stage).map((s) => (
                            <DropdownMenuItem key={s} onClick={() => move(c, s)} className="cursor-pointer text-sm">
                              Move to {s}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="mt-2 text-sm font-bold text-emerald-700">{formatCurrency(c.deal_value)}</p>
                    {c.assignee_name && <p className="text-[11px] text-slate-400 mt-1">{c.assignee_name}</p>}
                  </Card>
                ))}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">
                    No deals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
