import React from 'react';
import { 
  LayoutDashboard, 
  Server, 
  Users, 
  MessageSquare, 
  LogOut, 
  Database, 
  Radio,
  Layers
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, onLogout, stats = {} }) {
  const navItems = [
    {
      id: 'overview',
      label: 'Tổng quan',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'workers',
      label: 'Quản lý Worker',
      icon: Server,
      badge: stats.onlineWorkers !== undefined ? `${stats.onlineWorkers}/${stats.totalWorkers || 0}` : null,
      badgeColor: stats.onlineWorkers > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
    },
    {
      id: 'trackers',
      label: 'Player Tracker',
      icon: Users,
      badge: stats.totalTrackers !== undefined ? String(stats.totalTrackers) : null,
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'guilds',
      label: 'Server Discord',
      icon: MessageSquare,
      badge: stats.totalGuilds !== undefined ? String(stats.totalGuilds) : null,
      badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    }
  ];

  return (
    <aside className="w-64 bg-slate-900/90 border-r border-slate-800/80 flex flex-col justify-between h-screen fixed left-0 top-0 z-30 select-none">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-950/50">
            <Layers className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-tight text-base">KingMC</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Master
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Control Center</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Phân hệ Quản trị
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Logout */}
      <div className="p-4 border-t border-slate-800/80 space-y-3">
        {/* System Status Badges */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
              <span>MongoDB</span>
            </span>
            <span className={`flex items-center gap-1 text-[11px] font-medium ${stats.mongoConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stats.mongoConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {stats.mongoConnected ? 'Atlas Connected' : 'Local Fallback'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
              <span>Hàng đợi (Queue)</span>
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              {stats.queueLength || 0} tác vụ
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800/40 hover:bg-rose-500/10 hover:text-rose-400 border border-slate-800 text-slate-400 text-xs font-medium transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Đăng xuất Dashboard</span>
        </button>
      </div>
    </aside>
  );
}
