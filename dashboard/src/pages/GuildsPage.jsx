import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Users, 
  Copy, 
  Check, 
  Search, 
  RefreshCw, 
  Calendar,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Link2,
  Save,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Plus,
  Ban
} from 'lucide-react';
import { api } from '../api';

export default function GuildsPage() {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Cấu hình Whitelist & Blacklist & Link mời
  const [config, setConfig] = useState({
    restrictionMode: 'whitelist', // 'whitelist' | 'blacklist' | 'none'
    whitelistGuildIds: ['1515285801091731517'],
    blacklistGuildIds: [],
    discordInviteUrl: 'https://discord.gg/apMrvJAPy',
    serverRestrictionName: 'KZ Sì to'
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Text tạm để chỉnh sửa ID ngăn cách bởi dấu phẩy
  const [whitelistInput, setWhitelistInput] = useState('1515285801091731517');
  const [blacklistInput, setBlacklistInput] = useState('');

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
        const wl = res.data.whitelistGuildIds || (res.data.allowedGuildId ? [res.data.allowedGuildId] : ['1515285801091731517']);
        const bl = res.data.blacklistGuildIds || [];
        setConfig({
          restrictionMode: res.data.restrictionMode || 'whitelist',
          whitelistGuildIds: wl,
          blacklistGuildIds: bl,
          discordInviteUrl: res.data.discordInviteUrl || 'https://discord.gg/apMrvJAPy',
          serverRestrictionName: res.data.serverRestrictionName || 'KZ Sì to'
        });
        setWhitelistInput(wl.join(', '));
        setBlacklistInput(bl.join(', '));
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

    const parsedWhitelist = Array.from(new Set(whitelistInput.split(/[,;\s]+/).map(id => id.trim()).filter(Boolean)));
    const parsedBlacklist = Array.from(new Set(blacklistInput.split(/[,;\s]+/).map(id => id.trim()).filter(Boolean)));

    const payload = {
      ...config,
      whitelistGuildIds: parsedWhitelist,
      blacklistGuildIds: parsedBlacklist
    };

    try {
      const res = await api.saveGuildsConfig(payload);
      if (res.data) {
        setConfig(res.data);
        setWhitelistInput((res.data.whitelistGuildIds || []).join(', '));
        setBlacklistInput((res.data.blacklistGuildIds || []).join(', '));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Lỗi khi lưu cấu hình');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleWhitelist = async (guildId) => {
    const isWhitelisted = (config.whitelistGuildIds || []).includes(guildId);
    const newWhitelist = isWhitelisted
      ? config.whitelistGuildIds.filter(id => id !== guildId)
      : [...(config.whitelistGuildIds || []), guildId];
    const newBlacklist = isWhitelisted
      ? (config.blacklistGuildIds || [])
      : (config.blacklistGuildIds || []).filter(id => id !== guildId);

    const newConfig = {
      ...config,
      whitelistGuildIds: newWhitelist,
      blacklistGuildIds: newBlacklist
    };
    setConfig(newConfig);
    setWhitelistInput(newWhitelist.join(', '));
    setBlacklistInput(newBlacklist.join(', '));

    try {
      await api.saveGuildsConfig(newConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const handleToggleBlacklist = async (guildId) => {
    const isBlacklisted = (config.blacklistGuildIds || []).includes(guildId);
    const newBlacklist = isBlacklisted
      ? config.blacklistGuildIds.filter(id => id !== guildId)
      : [...(config.blacklistGuildIds || []), guildId];
    const newWhitelist = isBlacklisted
      ? (config.whitelistGuildIds || [])
      : (config.whitelistGuildIds || []).filter(id => id !== guildId);

    const newConfig = {
      ...config,
      whitelistGuildIds: newWhitelist,
      blacklistGuildIds: newBlacklist
    };
    setConfig(newConfig);
    setWhitelistInput(newWhitelist.join(', '));
    setBlacklistInput(newBlacklist.join(', '));

    try {
      await api.saveGuildsConfig(newConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err.message);
    }
  };

  const isGuildAllowed = (guildId) => {
    if (config.restrictionMode === 'none') return true;
    if (config.restrictionMode === 'blacklist') {
      return !(config.blacklistGuildIds || []).includes(guildId);
    }
    return (config.whitelistGuildIds || []).includes(guildId);
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
            <span>Quản Lý Máy Chủ Discord & Phân Quyền</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Quản lý chế độ Whitelist (danh sách trắng) & Blacklist (danh sách đen) cho Bot hoạt động đa máy chủ.
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

      {/* Cấu Hình Whitelist & Blacklist Máy Chủ */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Chế Độ Giới Hạn Máy Chủ (Access Control)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Thiết lập quy tắc máy chủ cho phép nhận lệnh. Khi dùng ngoài phạm vi, bot sẽ tự động gửi link mời.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
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
        </div>

        {/* 3 Chế Độ Hoạt Động */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">Chọn chế độ kiểm soát:</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setConfig({ ...config, restrictionMode: 'whitelist' })}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                config.restrictionMode === 'whitelist'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <ShieldCheck className="w-5 h-5 mt-0.5 text-emerald-400 flex-shrink-0" strokeWidth={1.75} />
              <div>
                <p className="text-xs font-bold text-white">Chỉ Whitelist</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Chỉ các máy chủ trong Danh sách trắng mới được dùng bot. Server khác bị chặn kèm link mời.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setConfig({ ...config, restrictionMode: 'blacklist' })}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                config.restrictionMode === 'blacklist'
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 ring-1 ring-rose-500/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <ShieldAlert className="w-5 h-5 mt-0.5 text-rose-400 flex-shrink-0" strokeWidth={1.75} />
              <div>
                <p className="text-xs font-bold text-white">Chặn Blacklist</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cho phép tất cả server, TRỪ các server bị đưa vào Danh sách đen.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setConfig({ ...config, restrictionMode: 'none' })}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                config.restrictionMode === 'none'
                  ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <ShieldOff className="w-5 h-5 mt-0.5 text-indigo-400 flex-shrink-0" strokeWidth={1.75} />
              <div>
                <p className="text-xs font-bold text-white">Mở Tự Do (Tất Cả)</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Không áp dụng giới hạn máy chủ, mọi server bot tham gia đều sử dụng được.
                </p>
              </div>
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
          {/* Thông tin Link Mời & Tên Máy Chủ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
                <span>Link Mời Máy Chủ Discord (Gửi khi bị chặn)</span>
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
                <span>Tên Máy Chủ Chính Hiển Thị Trong Thông Báo</span>
              </label>
              <input
                type="text"
                value={config.serverRestrictionName}
                onChange={(e) => setConfig({ ...config, serverRestrictionName: e.target.value })}
                placeholder="KZ Sì to"
                required
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Ô Nhập Danh Sách Whitelist & Blacklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Whitelist Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Danh Sách ID Whitelist (Cách nhau bởi dấu phẩy)</span>
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {(config.whitelistGuildIds || []).length} server
                </span>
              </div>
              <textarea
                rows={2}
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                placeholder="1515285801091731517, 1325097222152519751"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all resize-none"
              />
            </div>

            {/* Blacklist Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Danh Sách ID Blacklist (Cách nhau bởi dấu phẩy)</span>
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {(config.blacklistGuildIds || []).length} server
                </span>
              </div>
              <textarea
                rows={2}
                value={blacklistInput}
                onChange={(e) => setBlacklistInput(e.target.value)}
                placeholder="Nhập ID các server muốn cấm hoạt động..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none focus:border-rose-500 transition-all resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingConfig || configLoading}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:opacity-50 text-white text-xs font-semibold rounded-xl border border-indigo-500 shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{savingConfig ? 'Đang lưu cấu hình...' : 'Lưu Thay Đổi'}</span>
            </button>
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
              const isWhitelisted = (config.whitelistGuildIds || []).includes(guild.guildId);
              const isBlacklisted = (config.blacklistGuildIds || []).includes(guild.guildId);
              const allowed = isGuildAllowed(guild.guildId);

              return (
                <div
                  key={guild.guildId}
                  className={`bg-slate-900/70 border rounded-2xl p-5 transition-all flex flex-col justify-between ${
                    allowed
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-rose-950/60 bg-slate-950/40 opacity-80'
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-white text-sm tracking-tight truncate" title={guild.name}>
                            {guild.name}
                          </h3>
                        </div>

                        {/* Badges Phân Loại */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {isWhitelisted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                              <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                              <span>Whitelist</span>
                            </span>
                          )}
                          {isBlacklisted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-semibold">
                              <Ban className="w-3 h-3" strokeWidth={1.75} />
                              <span>Blacklist</span>
                            </span>
                          )}
                          {allowed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px]">
                              <Check className="w-3 h-3" strokeWidth={1.75} />
                              <span>Được Dùng Bot</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px]">
                              <ShieldAlert className="w-3 h-3" strokeWidth={1.75} />
                              <span>Bị Chặn</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-1.5">
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

                  {/* Quick Action Buttons: Whitelist / Blacklist toggle */}
                  <div className="mt-3 pt-3 border-t border-slate-800/40 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => handleToggleWhitelist(guild.guildId)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        isWhitelisted
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                      }`}
                    >
                      <Plus className="w-3 h-3" strokeWidth={1.75} />
                      <span>{isWhitelisted ? 'Bỏ Whitelist' : '+ Whitelist'}</span>
                    </button>

                    <button
                      onClick={() => handleToggleBlacklist(guild.guildId)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        isBlacklisted
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                      }`}
                    >
                      <Ban className="w-3 h-3" strokeWidth={1.75} />
                      <span>{isBlacklisted ? 'Bỏ Blacklist' : '+ Blacklist'}</span>
                    </button>
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
