import React, { useState } from 'react';
import { 
  Server, 
  Users, 
  MessageSquare, 
  Radio, 
  Activity, 
  RefreshCw, 
  RotateCcw, 
  Database, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { api } from '../api';

export default function OverviewPage({ overviewData, onRefresh, onNavigate }) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const stats = overviewData || {};
  const workers = stats.workers || {};
  const trackers = stats.trackers || {};
  const guilds = stats.guilds || {};
  const queue = stats.queue || {};

  const handleCheckTrackersNow = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await api.checkTrackersNow();
      setActionMessage({ type: 'success', text: res.message || 'Đã kích hoạt quét số dư' });
      onRefresh();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestartAll = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn gửi lệnh khởi động lại (restart) tới TOÀN BỘ các Worker bot không?')) {
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      await api.restartAllWorkers();
      setActionMessage({ type: 'success', text: 'Đã gửi yêu cầu restart tới toàn bộ Worker.' });
      onRefresh();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const formatUptime = (seconds = 0) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {actionMessage && (
        <div className={`p-4 rounded-xl text-sm flex items-center justify-between border ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" strokeWidth={1.75} />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button 
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Workers */}
        <div 
          onClick={() => onNavigate('workers')}
          className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Workers Trực Tuyến</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Server className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {workers.online || 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / {workers.total || 0} tổng node
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{workers.busy || 0} đang bận xử lý</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-slate-400 group-hover:text-emerald-400 transition-colors" strokeWidth={1.75} />
          </div>
        </div>

        {/* Metric 2: Trackers */}
        <div 
          onClick={() => onNavigate('trackers')}
          className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Người Dùng Theo Dõi</span>
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {trackers.active || 0}
            </span>
            <span className="text-xs text-slate-400">tài khoản</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span>Tổng số dư:</span>
            <span className="font-semibold text-emerald-400 font-mono">{trackers.totalBalanceFormatted || '$0'}</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-slate-400 group-hover:text-teal-400 transition-colors" strokeWidth={1.75} />
          </div>
        </div>

        {/* Metric 3: Discord Guilds */}
        <div 
          onClick={() => onNavigate('guilds')}
          className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Server Bot Đang Ở</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {guilds.total || 0}
            </span>
            <span className="text-xs text-slate-400">máy chủ</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
            <span>Đã kết nối Discord Bot</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-slate-400 group-hover:text-indigo-400 transition-colors" strokeWidth={1.75} />
          </div>
        </div>

        {/* Metric 4: Queue Status */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hàng Đợi Lệnh (Queue)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Radio className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {queue.length || 0}
            </span>
            <span className="text-xs text-slate-400">lệnh đang chờ</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
            <span>{queue.isProcessing ? 'Đang điều phối song song' : 'Đang ở trạng thái nhàn rỗi'}</span>
          </div>
        </div>
      </div>

      {/* Quick Action Center & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Operations */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
              <span>Tác vụ Điều khiển Nhanh</span>
            </h2>
            <span className="text-xs text-slate-400">Thao tác trực tiếp trên Master</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleCheckTrackersNow}
              disabled={actionLoading}
              className="p-4 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                  Quét Số Dư Tracker Ngay
                </span>
                <RefreshCw className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" strokeWidth={1.75} />
              </div>
              <p className="text-xs text-slate-400">
                Kích hoạt chu kỳ chia đều tác vụ cho tất cả các Worker rảnh để lấy số dư mới nhất của tất cả người chơi.
              </p>
            </button>

            <button
              onClick={handleRestartAll}
              disabled={actionLoading}
              className="p-4 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                  Khởi Động Lại Tất Cả Worker
                </span>
                <RotateCcw className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" strokeWidth={1.75} />
              </div>
              <p className="text-xs text-slate-400">
                Gửi tín hiệu đổi tên ngẫu nhiên và đăng nhập lại cho toàn bộ Minecraft Bot trên các Worker.
              </p>
            </button>
          </div>
        </div>

        {/* System Telemetry */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            <span>Thông số Hệ thống</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <span className="text-slate-400 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                <span>Thời gian Uptime</span>
              </span>
              <span className="font-mono text-slate-200 font-medium">
                {formatUptime(stats.uptimeSeconds)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <span className="text-slate-400 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                <span>Cơ sở Dữ liệu</span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                stats.mongoConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {stats.mongoConnected ? 'MongoDB Atlas' : 'Local File JSON'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                <span>Cơ chế Xác thực</span>
              </span>
              <span className="font-mono text-slate-300 font-semibold text-[11px]">
                WORKER_SECRET
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
