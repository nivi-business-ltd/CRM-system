import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { initials } from "@/lib/crm";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CheckSquare,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, adminOnly: true },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/employees", label: "Employees", icon: ShieldCheck, adminOnly: true },
];

const TITLES = {
  "/": "Dashboard",
  "/clients": "Clients",
  "/pipeline": "Pipeline",
  "/tasks": "Tasks & Reminders",
  "/employees": "Employee Management",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");
  const title = TITLES[location.pathname] || "Dashboard";

  const SidebarInner = () => (
    <div className="flex h-full flex-col">
      <div className="px-6 py-6 border-b border-slate-100">
        <img src="/nivi-logo.png" alt="NIVI FINSERV" className="h-12 w-auto" />
      </div>
      <nav className="flex-1 px-3 py-5 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            data-testid={`nav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
            {initials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
            <p className="truncate text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-slate-100 bg-white">
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <SidebarInner />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/90 backdrop-blur px-4 sm:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-slate-600"
              onClick={() => setOpen((v) => !v)}
              data-testid="mobile-menu-toggle"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                {user?.role === "admin" ? "Administrator" : "Team Member"}
              </p>
              <h1 className="text-xl font-bold text-slate-900 font-display">{title}</h1>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger data-testid="user-menu-trigger" className="outline-none">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50 transition-colors">
                <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                  {initials(user?.name)}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[140px] truncate">
                  {user?.name}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-white">
              <DropdownMenuLabel>
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                <p className="text-xs font-normal text-slate-400 truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                data-testid="logout-button"
                className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="p-4 sm:p-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
