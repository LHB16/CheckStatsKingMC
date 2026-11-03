import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Users, 
  Copy, 
  Check, 
  Search, 
  RefreshCw, 
  Calendar,
  ShieldCheck,
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Link2,
  Shield,
  Save,
  CheckCircle2,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';

export default function GuildsPage() {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Cấu hình giới hạn máy chủ & link mời
  const [config, setConfig] = useState({
    allowedGuildId: '1515285801091731517',
    discordInviteUrl: 'https://discord.gg/apMrvJAPy',
    serverRestrictionName: 'KZ Sì to'
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Phân trang: 25 server 1 trang
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchGuilds = async () => {
    setLoading(true);
    try {
      const res = await api.getGuilds();
      setGuilds(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách server Discord:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await api.getGuildsConfig();
      if (res.data) {
        setConfig({
          allowedGuildId: res.data.allowedGuildId || '1515285801091731517',
          discordInviteUrl: res.data.discordInviteUrl || 'https://discord.gg/apMrvJAPy',
          serverRestrictionName: res.data.serverRestrictionName || 'KZ Sì to'
        });
      }
    } catch (err) {
      console.warn('Lỗi tải cấu hình giới hạn máy chủ:', err.message);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchGuilds();
    fetchConfig();
  }, []);

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await api.saveGuildsConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Lỗi khi lưu cấu hình');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSetAllowedGuild = (guild) => {
    setConfig(prev => ({
      ...prev,
      allowedGuildId: guild.guildId,
      serverRestrictionName: guild.name || prev.serverRestrictionName
    }));
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const filteredGuilds = guilds.filter(g => 
    (g.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.guildId || '').includes(searchTerm)
  );

  const totalMembers = guilds.reduce((acc, cur) => acc + (cur.memberCount || 0), 0);

  const totalPages = Math.ceil(filteredGuilds.length / pageSize) || 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedGuilds = filteredGuilds.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" strokeWidth={1.75} />
            <span>Danh sách Máy Chủ Discord Bot Tham Gia</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tự động đồng bộ và lưu trữ danh sách server bot đang hoạt động vào MongoDB.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-slate-400">Tổng thành viên tiếp cận</span>
            <p className="text-sm font-bold text-white font-mono">{totalMembers.toLocaleString()}</p>
          </div>

          <button
            onClick={() => { fetchGuilds(); fetchConfig(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
            <span>Đồng bộ từ Discord</span>
          </button>
        </div>
      </div>

      {/* Cấu Hình Giới Hạn Máy Chủ & Link Mời Discord */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cấu Hình Giới Hạn Máy Chủ & Link Mời</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Chỉ cho phép bot nhận lệnh tại máy chủ chỉ định. Người dùng ở ngoài sẽ nhận thông báo kèm link mời.
              </p>
            </div>
          </div>

          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              <span>Đã lưu thành công!</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4" strokeWidth={1.75} />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Link Mời Discord */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
              <span>Link Mời Máy Chủ Discord</span>
            </label>
            <div className="relative">
              <input
                type="url"
                value={config.discordInviteUrl}
                onChange={(e) => setConfig({ ...config, discordInviteUrl: e.target.value })}
                placeholder="https://discord.gg/apMrvJAPy"
                required
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-all"
              />
              {config.discordInviteUrl && (
                <a
                  href={config.discordInviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở link thử nghiệm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                </a>
              )}
            </div>
          </div>

          {/* ID Server Cho Phép */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
              <span>Server Discord ID Cho Phép</span>
            </label>
            <input
              type="text"
              value={config.allowedGuildId}
              onChange={(e) => setConfig({ ...config, allowedGuildId: e.target.value })}
              placeholder="1515285801091731517"
              required
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Tên Server Hiển Thị & Nút Lưu */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
              <span>Tên Hiển Thị Máy Chủ</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.serverRestrictionName}
                onChange={(e) => setConfig({ ...config, serverRestrictionName: e.target.value })}
                placeholder="KZ Sì to"
                required
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-indigo-500 transition-all"
              />
              <button
                type="submit"
                disabled={savingConfig || configLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:opacity-50 text-white text-xs font-semibold rounded-xl border border-indigo-500 shadow-sm transition-all cursor-pointer flex-shrink-0"
              >
                <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>{savingConfig ? 'Đang lưu...' : 'Lưu'}</span>
              </button>
            </div>
          </div>
        </form>
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
            placeholder="Tìm theo tên server hoặc Guild ID..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Hiển thị: <strong>{filteredGuilds.length}</strong> máy chủ (25/trang)
        </span>
      </div>

      {/* Grid of Guilds */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          <span className="inline-block w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-2" />
          <p>Đang tải danh sách server...</p>
        </div>
      ) : filteredGuilds.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-slate-300">Không tìm thấy máy chủ nào</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm ? 'Không có server nào khớp với từ khóa tìm kiếm.' : 'Bot chưa tham gia server Discord nào hoặc chưa khởi động bot.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedGuilds.map((guild) => {
              const isCopied = copiedId === guild.guildId;
              const isAllowed = config.allowedGuildId === guild.guildId;

              return (
                <div
                  key={guild.guildId}
                  className={`bg-slate-900/70 border rounded-2xl p-5 transition-all flex flex-col justify-between ${
                    isAllowed 
                      ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/30' 
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start gap-3.5 mb-3">
                      {guild.iconUrl ? (
                        <img
                          src={guild.iconUrl}
                          alt={guild.name}
                          className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-base flex-shrink-0 shadow-md">
                          {guild.name ? guild.name.substring(0, 2).toUpperCase() : 'DC'}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-white text-sm tracking-tight truncate" title={guild.name}>
                            {guild.name}
                          </h3>
                        </div>
                        {isAllowed && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                            <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                            <span>Máy Chủ Hoạt Động</span>
                          </span>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px]">
                            {guild.guildId}
                          </span>
                          <button
                            onClick={() => handleCopyId(guild.guildId)}
                            title="Sao chép Guild ID"
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-400" strokeWidth={1.75} />
                            ) : (
                              <Copy className="w-3 h-3" strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 py-3 border-t border-slate-800/60 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                          <span>Thành viên:</span>
                        </span>
                        <span className="font-mono font-semibold text-slate-200">
                          {(guild.memberCount || 0).toLocaleString()}
                        </span>
                      </div>

                      {guild.joinedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                            <span>Tham gia:</span>
                          </span>
                          <span className="text-slate-400 text-[11px] font-mono">
                            {new Date(guild.joinedAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Bot Trực Tuyến</span>
                    </span>
                    {!isAllowed && (
                      <button
                        onClick={() => handleSetAllowedGuild(guild)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                      >
                        Chọn làm server chính
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Thanh phân trang: 25 server / trang */}
          {filteredGuilds.length > pageSize && (
            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-mono">
                Hiển thị <strong>{startIndex + 1}</strong> - <strong>{Math.min(startIndex + pageSize, filteredGuilds.length)}</strong> trên tổng số <strong>{filteredGuilds.length}</strong> máy chủ (25/trang)
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
                  Trang <strong className="text-indigo-400">{validPage}</strong> / {totalPages}
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
    </div>
  );
}
