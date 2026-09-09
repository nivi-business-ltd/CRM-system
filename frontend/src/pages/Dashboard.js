import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, STAGE_COLORS } from "@/lib/crm";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Briefcase, TrendingUp, Trophy, CalendarClock, CircleDollarSign } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const STAGE_HEX = {
  Lead: "#3b82f6",
  Contacted: "#8b5cf6",
  Proposal: "#f59e0b",
  Negotiation: "#ea580c",
  "Closed Won": "#059669",
  "Closed Lost": "#ef4444",
};

function StatCard({ icon: Icon, label, value, sub, tint }) {
  return (
    <Card className="p-5 border-slate-200 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 font-display">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);

  if (!stats)
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );

  const chartData = stats.stage_distribution.map((s) => ({ name: s.stage, count: s.count, value: s.value }));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 font-display">
          Welcome back, {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {user?.role === "admin" ? "Here's how your whole team is performing." : "Here's your client overview."}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Clients" value={stats.total_clients} tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Briefcase} label="Active Deals" value={stats.active_deals} tint="bg-blue-50 text-blue-600" />
        <StatCard
          icon={TrendingUp}
          label="Pipeline Value"
          value={formatCurrency(stats.pipeline_value)}
          sub="Open deals"
          tint="bg-amber-50 text-amber-600"
        />
        <StatCard
          icon={Trophy}
          label="Win Rate"
          value={`${stats.win_rate}%`}
          sub={`${formatCurrency(stats.won_value)} won`}
          tint="bg-violet-50 text-violet-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900 font-display">Pipeline by Stage</h3>
            <CircleDollarSign className="h-5 w-5 text-slate-300" />
          </div>
          <div className="h-72" data-testid="stage-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} angle={-12} dy={8} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(v, n, p) => [`${v} clients · ${formatCurrency(p.payload.value)}`, "Stage"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={54}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STAGE_HEX[entry.name] || "#059669"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 border-slate-200">
          <div className="flex items-center gap-2 mb-5">
            <CalendarClock className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900 font-display">Upcoming Tasks</h3>
          </div>
          <div className="space-y-3" data-testid="upcoming-tasks">
            {stats.upcoming_tasks.length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center">No pending tasks. You're all caught up!</p>
            )}
            {stats.upcoming_tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.client_name ? `${t.client_name} · ` : ""}
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : "No due date"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6 border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 font-display mb-5">Recently Updated Clients</h3>
        <div className="space-y-2" data-testid="recent-clients">
          {stats.recent_clients.length === 0 && (
            <p className="text-sm text-slate-400 py-6 text-center">No clients yet. Add your first client to get started.</p>
          )}
          {stats.recent_clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                <p className="text-xs text-slate-400 truncate">{c.company || c.email || "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">{formatCurrency(c.deal_value)}</span>
                <Badge variant="outline" className={STAGE_COLORS[c.stage]}>
                  {c.stage}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
