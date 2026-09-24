import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  RefreshCw, 
  Search, 
  Trash2, 
  Eye, 
  EyeOff, 
  LineChart, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Coins, 
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { api } from '../api';

export default function TrackerPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ playerName: '', initialBalance: '' });
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedPlayerHistory, setSelectedPlayerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Phân trang: 25 người 1 trang
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchTrackers = async () => {
    try {
      const res = await api.getTrackers();
      setPlayers(res.data || []);
    } catch (err) {
      console.error('Lỗi nạp tracker:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackers();
  }, []);

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!addForm.playerName.trim()) return;

    setAdding(true);
    try {
      await api.addTracker(addForm.playerName.trim(), addForm.initialBalance || null);
      setShowAddModal(false);
      setAddForm({ playerName: '', initialBalance: '' });
      await fetchTrackers();
    } catch (err) {
      alert(`Lỗi khi thêm người chơi: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (key) => {
    try {
      await api.toggleTracker(key);
      await fetchTrackers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  const handleDelete = async (key, name) => {
    if (!window.confirm(`Xóa người chơi "${name}" khỏi danh sách theo dõi vĩnh viễn?`)) return;
    try {
      await api.deleteTracker(key);
      await fetchTrackers();
    } catch (err) {
      alert(`Lỗi khi xóa: ${err.message}`);
    }
  };

  const handleScanNow = async () => {
    setScanning(true);
    try {
      const res = await api.checkTrackersNow();
      alert(res.message || 'Đã kích hoạt quét số dư');
      setTimeout(fetchTrackers, 3000);
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleViewHistory = async (key) => {
    setHistoryLoading(true);
    try {
      const res = await api.getTrackerHistory(key);
      setSelectedPlayerHistory(res.data);
    } catch (err) {
      alert(`Lỗi tải lịch sử: ${err.message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const filteredPlayers = players.filter(p => 
    p.playerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredPlayers.length / pageSize) || 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedPlayers = filteredPlayers.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            <span>Quản lý Người Dùng Theo Dõi Số Dư (Tracker)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Lịch sử số dư được lưu trữ 3 ngày trên MongoDB Atlas và tự động cập nhật định kỳ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScanNow}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${scanning ? 'animate-spin text-emerald-400' : ''}`} strokeWidth={1.75} />
            <span>Quét Số Dư Ngay</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" strokeWidth={1.75} />
            <span>Thêm Người Chơi</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Tìm kiếm người chơi Minecraft..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Hiển thị: <strong>{filteredPlayers.length}</strong> người chơi (25/trang)
        </span>
      </div>

      {/* Table / List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          <span className="inline-block w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-2" />
          <p>Đang tải danh sách người chơi...</p>
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-slate-300">Không tìm thấy người chơi nào</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchTerm ? 'Không có người chơi nào khớp với từ khóa tìm kiếm.' : 'Nhấn "Thêm Người Chơi" để bắt đầu theo dõi biến động tài sản.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Người Chơi</th>
                  <th className="px-5 py-3.5">Số Dư Hiện Tại</th>
                  <th className="px-5 py-3.5">Biến Động 3 Ngày</th>
                  <th className="px-5 py-3.5">Mẫu Dữ Liệu</th>
                  <th className="px-5 py-3.5">Kiểm Tra Cuối</th>
                  <th className="px-5 py-3.5">Trạng Thái</th>
                  <th className="px-5 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedPlayers.map((player) => {
                  const isPositive = player.change > 0;
                  const isNegative = player.change < 0;

                  return (
                    <tr key={player.playerKey} className="hover:bg-slate-800/30 transition-colors">
                      {/* Name & Avatar */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={`https://minotar.net/avatar/${player.playerName}/32`}
                            alt={player.playerName}
                            className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div>
                            <span className="font-bold text-white text-sm tracking-tight">{player.playerName}</span>
                            <p className="text-[10px] text-slate-400 font-mono">key: {player.playerKey}</p>
                          </div>
                        </div>
                      </td>

                      {/* Current Balance */}
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {player.formattedBalance}
                        </span>
                      </td>

                      {/* Change */}
                      <td className="px-5 py-3">
                        {player.pointsCount > 1 ? (
                          <div className={`flex items-center gap-1 font-mono text-xs font-semibold ${
                            isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-400'
                          }`}>
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                            ) : isNegative ? (
                              <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                            ) : null}
                            <span>
                              {isPositive ? '+' : ''}${Math.abs(player.change).toLocaleString()}
                            </span>
                            <span className="text-[10px] opacity-75">
                              ({player.changePercent}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">Chưa đủ dữ liệu</span>
                        )}
                      </td>

                      {/* Points Count */}
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">
                          {player.pointsCount} mốc
                        </span>
                      </td>

                      {/* Last Checked */}
                      <td className="px-5 py-3 text-slate-400 font-mono text-[11px]">
                        {player.lastChecked ? new Date(player.lastChecked).toLocaleString('vi-VN') : 'Chưa có'}
                      </td>

                      {/* Status Badge */}
                      <td className="px-5 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5 ${
                          player.isTracking 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${player.isTracking ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                          <span>{player.isTracking ? 'Đang theo dõi' : 'Tạm dừng'}</span>
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewHistory(player.playerKey)}
                            title="Xem lịch sử biến động số dư"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            <LineChart className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>

                          <button
                            onClick={() => handleToggle(player.playerKey)}
                            title={player.isTracking ? 'Tạm dừng theo dõi' : 'Kích hoạt lại'}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              player.isTracking 
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' 
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {player.isTracking ? (
                              <EyeOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                            ) : (
                              <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                            )}
                          </button>

                          <button
                            onClick={() => handleDelete(player.playerKey, player.playerName)}
                            title="Xóa người chơi"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Thanh phân trang: 25 người / trang */}
          {filteredPlayers.length > pageSize && (
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-mono">
                Hiển thị <strong>{startIndex + 1}</strong> - <strong>{Math.min(startIndex + pageSize, filteredPlayers.length)}</strong> trên tổng số <strong>{filteredPlayers.length}</strong> người chơi (25/trang)
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={validPage === 1}
                  title="Trang đầu"
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={validPage === 1}
                  title="Trang trước"
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>

                <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-slate-300 text-xs">
                  Trang <strong className="text-emerald-400">{validPage}</strong> / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={validPage === totalPages}
                  title="Trang sau"
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={validPage === totalPages}
                  title="Trang cuối"
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Thêm Người Chơi Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
                <span>Thêm Người Chơi Theo Dõi</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleAddPlayer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tên Người Chơi (Ingame) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.playerName}
                  onChange={(e) => setAddForm({ ...addForm, playerName: e.target.value })}
                  placeholder="VD: Notch, Alex, KingMC_Pro..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Số Dư Khởi Tạo (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={addForm.initialBalance}
                  onChange={(e) => setAddForm({ ...addForm, initialBalance: e.target.value })}
                  placeholder="VD: $1,500,000 hoặc 1.5M"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Nếu để trống, số dư sẽ được cập nhật ở chu kỳ kiểm tra tự động tiếp theo.
                </span>
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
                  {adding ? 'Đang thêm...' : 'Lưu Người Chơi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lịch Sử Biến Động Số Dư */}
      {selectedPlayerHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={`https://minotar.net/avatar/${selectedPlayerHistory.playerName}/36`}
                  alt={selectedPlayerHistory.playerName}
                  className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700"
                />
                <div>
                  <h3 className="font-bold text-white text-base tracking-tight">
                    {selectedPlayerHistory.playerName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lịch sử biến động số dư 3 ngày qua ({selectedPlayerHistory.history?.length || 0} mốc)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPlayerHistory(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {/* Quick Stat Summary */}
            <div className="grid grid-cols-3 gap-3 my-4 flex-shrink-0">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Bắt đầu</span>
                <p className="text-sm font-bold text-slate-200 font-mono mt-0.5">
                  ${(selectedPlayerHistory.stats?.startBalance || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Hiện tại</span>
                <p className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                  ${(selectedPlayerHistory.stats?.currentBalance || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Chênh lệch</span>
                <p className={`text-sm font-bold font-mono mt-0.5 ${
                  (selectedPlayerHistory.stats?.balanceChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {(selectedPlayerHistory.stats?.balanceChange || 0) >= 0 ? '+' : ''}
                  ${(selectedPlayerHistory.stats?.balanceChange || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Thời Gian</th>
                    <th className="py-2 px-3">Số Dư Ghi Nhận</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {(selectedPlayerHistory.history || []).slice().reverse().map((h, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/20">
                      <td className="py-2 px-3 text-slate-400">
                        {new Date(h.timestamp).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2 px-3 font-semibold text-emerald-400">
                        {h.formatted || `$${h.balance?.toLocaleString()}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end flex-shrink-0">
              <button
                onClick={() => setSelectedPlayerHistory(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
