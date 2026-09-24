import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Plus, 
  RefreshCw, 
  Activity, 
  RotateCcw, 
  Play, 
  Pause, 
  Trash2, 
  Bot, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { api } from '../api';

export default function WorkersPage() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '', secret: '' });
  const [adding, setAdding] = useState(false);
  const [operatingId, setOperatingId] = useState(null);

  const fetchWorkers = async () => {
    try {
      const res = await api.getWorkers();
      setWorkers(res.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const handleAddWorker = async (e) => {
    e.preventDefault();
    if (!addForm.url.trim()) return;

    setAdding(true);
    try {
      await api.addWorker(addForm);
      setShowAddModal(false);
      setAddForm({ name: '', url: '', secret: '' });
      await fetchWorkers();
    } catch (err) {
      alert(`Lỗi khi thêm Worker: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id) => {
    setOperatingId(id);
    try {
      await api.toggleWorker(id);
      await fetchWorkers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setOperatingId(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Worker "${name}" khỏi hệ thống?`)) return;
    setOperatingId(id);
    try {
      await api.deleteWorker(id);
      await fetchWorkers();
    } catch (err) {
      alert(`Lỗi khi xóa: ${err.message}`);
    } finally {
      setOperatingId(null);
    }
  };

  const handlePing = async (id) => {
    setOperatingId(id);
    try {
      const res = await api.pingWorker(id);
      if (res.data?.success) {
        alert(`Ping thành công! Độ trễ: ${res.data.latency}ms | Bot: ${res.data.botUsername || 'Chưa đăng nhập'}`);
      } else {
        alert(`Không thể kết nối tới Worker: ${res.data?.lastError || 'Timeout'}`);
      }
      await fetchWorkers();
    } catch (err) {
      alert(`Lỗi ping: ${err.message}`);
    } finally {
      setOperatingId(null);
    }
  };

  const handleRestart = async (id, name) => {
    if (!window.confirm(`Gửi lệnh khởi động lại Minecraft Bot trên Worker "${name}"?`)) return;
    setOperatingId(id);
    try {
      const res = await api.restartWorker(id);
      alert(`Đã khởi động lại thành công! Tên bot mới: ${res.data?.username || 'Mới'}`);
      await fetchWorkers();
    } catch (err) {
      alert(`Lỗi restart: ${err.message}`);
    } finally {
      setOperatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            <span>Danh sách Worker Node Vệ Tinh</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dữ liệu Worker được lưu trữ an toàn trong MongoDB. Tự động chia tải Round-Robin khi thực thi lệnh.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchWorkers}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            <span>Thêm Worker Mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}

      {/* Workers Grid / Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          <span className="inline-block w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-2" />
          <p>Đang tải danh sách Worker...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-slate-300">Chưa có Worker Node nào</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Hệ thống đang chạy đơn lẻ hoặc chưa cấu hình Worker từ xa. Hãy nhấn "Thêm Worker Mới" để liên kết Render Worker.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workers.map((worker) => {
            const isLocal = worker.type === 'local';
            const isBusy = worker.busy;
            const isOnline = worker.online;
            const isActive = worker.isActive;
            const isOperating = operatingId === (worker.id || worker._id);

            return (
              <div 
                key={worker.id || worker._id}
                className={`bg-slate-900/70 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                  !isActive 
                    ? 'border-slate-800/50 opacity-60' 
                    : isOnline 
                      ? 'border-slate-800 hover:border-slate-700 shadow-sm' 
                      : 'border-rose-950/40'
                }`}
              >
                <div>
                  {/* Top Bar: Name & Status Badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm tracking-tight">{worker.name}</h3>
                        {isLocal && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                            Local
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono truncate max-w-[220px] mt-0.5">
                        {worker.url}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                      !isActive
                        ? 'bg-slate-800 text-slate-400 border-slate-700'
                        : isBusy
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : isOnline
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        !isActive 
                          ? 'bg-slate-500' 
                          : isBusy 
                            ? 'bg-amber-400 animate-pulse' 
                            : isOnline 
                              ? 'bg-emerald-400' 
                              : 'bg-rose-400'
                      }`} />
                      <span>
                        {!isActive ? 'Tạm dừng' : isBusy ? 'Đang bận' : isOnline ? 'Online' : 'Offline'}
                      </span>
                    </span>
                  </div>

                  {/* Body Metrics: Bot Username, Ping */}
                  <div className="space-y-2 py-3 border-y border-slate-800/60 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                        <span>Bot In-game:</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-200">
                        {worker.username || 'Chưa đăng nhập'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                        <span>Độ trễ (Ping):</span>
                      </span>
                      <span className="font-mono">
                        {worker.latency >= 0 ? (
                          <span className={worker.latency < 200 ? 'text-emerald-400' : 'text-amber-400'}>
                            {worker.latency} ms
                          </span>
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </span>
                    </div>

                    {worker.lastHeartbeat && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                          <span>Heartbeat:</span>
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {new Date(worker.lastHeartbeat).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-2 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {!isLocal && (
                      <button
                        onClick={() => handleToggle(worker.id || worker._id)}
                        disabled={isOperating}
                        title={isActive ? 'Tạm dừng nhận tác vụ' : 'Kích hoạt lại'}
                        className={`p-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                          isActive 
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' 
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {isActive ? (
                          <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
                        ) : (
                          <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handlePing(worker.id || worker._id)}
                      disabled={isOperating || !isActive}
                      title="Kiểm tra kết nối và đo ping"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Activity className={`w-3.5 h-3.5 ${isOperating ? 'animate-spin text-emerald-400' : ''}`} strokeWidth={1.75} />
                    </button>

                    <button
                      onClick={() => handleRestart(worker.id || worker._id, worker.name)}
                      disabled={isOperating || !isActive}
                      title="Đổi tên và Khởi động lại Bot in-game"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 text-xs transition-all cursor-pointer disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>

                  {!isLocal && (
                    <button
                      onClick={() => handleDelete(worker.id || worker._id, worker.name)}
                      disabled={isOperating}
                      title="Xóa Worker khỏi MongoDB"
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm Worker Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
                <span>Thêm Worker Node Mới</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleAddWorker} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tên Định Danh
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="VD: Render-Worker-02"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  URL Worker Node <span className="text-rose-400">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={addForm.url}
                  onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
                  placeholder="https://kingmc-worker-2.onrender.com"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Đảm bảo Worker Node đã deploy và đang mở endpoint /health
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mật Khẩu Riêng (Tùy chọn)
                </label>
                <input
                  type="password"
                  value={addForm.secret}
                  onChange={(e) => setAddForm({ ...addForm, secret: e.target.value })}
                  placeholder="Để trống để dùng WORKER_SECRET chung của Master"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
                >
                  {adding ? 'Đang kiểm tra & Thêm...' : 'Lưu Worker vào MongoDB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
