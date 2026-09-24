import React from 'react';
import { RefreshCw, Clock, Bot } from 'lucide-react';

export default function Header({ title, subtitle, onRefresh, refreshing }) {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          <Bot className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
          <span>Role: <strong className="text-white uppercase font-mono">Master</strong></span>
        </div>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Làm mới dữ liệu"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} strokeWidth={1.75} />
          <span className="hidden sm:inline">Làm mới</span>
        </button>
      </div>
    </header>
  );
}
