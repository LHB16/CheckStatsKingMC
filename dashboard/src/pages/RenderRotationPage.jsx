import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  Plus, 
  RefreshCw, 
  Activity, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  X, 
  Key, 
  Globe, 
  Settings, 
  Layers, 
  Radio,
  Server
} from 'lucide-react';
import { api } from '../api';

const AVAILABLE_REGIONS = [
  { id: 'singapore', label: 'Singapore (Đông Nam Á)' },
  { id: 'oregon', label: 'Oregon (Bờ Tây Hoa Kỳ)' },
  { id: 'ohio', label: 'Ohio (Bờ Đông Hoa Kỳ)' },
  { id: 'frankfurt', label: 'Frankfurt (Châu Âu)' },
  { id: 'virginia', label: 'Virginia (Bờ Đông Hoa Kỳ)' }
];

export default function RenderRotationPage() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState({
    gasKeepaliveUrl: '',
    autoRotateEnabled: true,
    masterUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotationMsg, setRotationMsg] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [modalForm, setModalForm] = useState({
    accountId: '',
    name: '',
    apiKey: '',
    ownerId: '',
    repo: 'https://github.com/luuhuubinh/botCheckStatsKingMC',
    branch: 'main',
    allowedRegions: ['singapore', 'oregon', 'ohio', 'frankfurt', 'virginia'],
    maxServices: 1,
    isActive: true
  });
  const [submittingModal, setSubmittingModal] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Load Data
  const fetchData = async () => {
    try {
      const [accRes, setRes] = await Promise.all([
        api.getRenderAccounts(),
        api.getRenderSettings()
      ]);
      setAccounts(accRes.data || []);
      if (setRes.data) {
        setSettings({
          gasKeepaliveUrl: setRes.data.gasKeepaliveUrl || '',
          autoRotateEnabled: setRes.data.autoRotateEnabled ?? true,
          masterUrl: setRes.data.masterUrl || ''
        });
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu Render:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.saveRenderSettings(settings);
      alert('✅ Đã lưu cấu hình xoay Render thành công!');
    } catch (err) {
      alert(`❌ Lỗi khi lưu cấu hình: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Toggle Auto Rotate Switch
  const handleToggleAutoRotate = async () => {
    const nextVal = !settings.autoRotateEnabled;
    setSettings(prev => ({ ...prev, autoRotateEnabled: nextVal }));
    try {
      await api.saveRenderSettings({ ...settings, autoRotateEnabled: nextVal });
    } catch (err) {
      alert(`❌ Lỗi: ${err.message}`);
      setSettings(prev => ({ ...prev, autoRotateEnabled: !nextVal }));
    }
  };

  // Open Modal for Add
  const handleOpenAdd = () => {
    setEditingId(null);
    setModalForm({
      accountId: `render_acc_${String(accounts.length + 1).padStart(2, '0')}`,
      name: `Tài khoản Render ${accounts.length + 1}`,
      apiKey: '',
      ownerId: '',
      repo: 'https://github.com/luuhuubinh/botCheckStatsKingMC',
      branch: 'main',
      allowedRegions: ['singapore', 'oregon', 'ohio', 'frankfurt', 'virginia'],
      maxServices: 1,
      isActive: true
    });
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (acc) => {
    setEditingId(acc.accountId);
    setModalForm({
      accountId: acc.accountId,
      name: acc.name || '',
      apiKey: '', // Để trống nếu không muốn đổi
      ownerId: acc.ownerId || '',
      repo: acc.repo || 'https://github.com/luuhuubinh/botCheckStatsKingMC',
      branch: acc.branch || 'main',
      allowedRegions: acc.allowedRegions || ['singapore', 'oregon', 'ohio', 'frankfurt', 'virginia'],
      maxServices: acc.maxServices || 1,
      isActive: acc.isActive ?? true
    });
    setShowModal(true);
  };

  // Submit Modal (Add or Edit)
  const handleSubmitModal = async (e) => {
    e.preventDefault();
    if (!modalForm.accountId.trim()) {
      alert('Vui lòng nhập Account ID');
      return;
    }
    if (!editingId && !modalForm.apiKey.trim()) {
      alert('Vui lòng nhập Render API Key cho tài khoản mới');
      return;
    }

    setSubmittingModal(true);
    try {
      await api.saveRenderAccount(modalForm);
      setShowModal(false);
      await fetchData();
    } catch (err) {
      alert(`❌ Lỗi khi lưu tài khoản: ${err.message}`);
    } finally {
      setSubmittingModal(false);
    }
  };

  // Delete Account
  const handleDeleteAccount = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${name || id}" khỏi MongoDB?`)) return;
    try {
      await api.deleteRenderAccount(id);
      await fetchData();
    } catch (err) {
      alert(`❌ Lỗi khi xóa tài khoản: ${err.message}`);
    }
  };

  // Test Render API Connection
  const handleTestConnection = async (acc) => {
    setTestingId(acc.accountId);
    setTestResult(null);
    try {
      const res = await api.testRenderConnection({ accountId: acc.accountId });
      setTestResult({
        accountId: acc.accountId,
        success: true,
        message: res.message || 'Kết nối thành công!'
      });
    } catch (err) {
      setTestResult({
        accountId: acc.accountId,
        success: false,
        message: err.message
      });
    } finally {
      setTestingId(null);
    }
  };

  // Manual Test Rotation Trigger
  const handleManualRotate = async () => {
    if (!window.confirm('Bạn có muốn kích hoạt thử nghiệm quy trình Xoay Vòng Worker ngay bây giờ? Master sẽ tạo 1 Worker mới tại Region khác và cập nhật danh sách.')) return;
    setRotating(true);
    setRotationMsg('Đang gửi tín hiệu kích hoạt xoay vòng tới Master...');
    try {
      const res = await api.triggerManualRotation({
        reason: 'Thử nghiệm kích hoạt xoay Worker thủ công từ Web UI Dashboard'
      });
      setRotationMsg(res.message || 'Đã kích hoạt thành công tiến trình xoay Worker!');
      setTimeout(() => {
        fetchData();
      }, 5000);
    } catch (err) {
      setRotationMsg(`❌ Lỗi: ${err.message}`);
    } finally {
      setRotating(false);
    }
  };

  // Toggle Region checkbox in Modal
  const handleToggleRegion = (regId) => {
    setModalForm(prev => {
      const exists = prev.allowedRegions.includes(regId);
      const next = exists 
        ? prev.allowedRegions.filter(r => r !== regId)
        : [...prev.allowedRegions, regId];
      return { ...prev, allowedRegions: next.length > 0 ? next : [regId] };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" strokeWidth={1.75} />
          <p className="text-slate-400 text-sm">Đang tải cấu hình Render từ MongoDB Atlas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner & Quick Controls */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <RotateCcw className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Hệ Thống Tự Động Xoay Render Worker</h2>
                <p className="text-xs text-slate-400">Tự động tạo Service mới tại Region khác khi KingMC giới hạn IP đăng ký</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Auto Rotate Toggle Switch */}
            <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800">
              <span className="text-xs font-medium text-slate-300">Tự động xoay IP:</span>
              <button
                type="button"
                onClick={handleToggleAutoRotate}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  settings.autoRotateEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoRotateEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs font-semibold ${settings.autoRotateEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                {settings.autoRotateEnabled ? 'BẬT' : 'TẮT'}
              </span>
            </div>

            {/* Manual Rotate Button */}
            <button
              onClick={handleManualRotate}
              disabled={rotating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium text-xs shadow-lg shadow-orange-950/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${rotating ? 'animate-spin' : ''}`} strokeWidth={1.75} />
              <span>{rotating ? 'Đang kích hoạt...' : 'Thử nghiệm xoay ngay'}</span>
            </button>

            {/* Add Account Button */}
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-950/30 transition-all"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              <span>Thêm Tài Khoản</span>
            </button>
          </div>
        </div>

        {/* Rotation Result Notice */}
        {rotationMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 animate-pulse" strokeWidth={1.75} />
              <span>{rotationMsg}</span>
            </div>
            <button onClick={() => setRotationMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      {/* Grid: System Config & Render Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: System Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-800/60 text-white">
              <Settings className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
              <h3 className="font-semibold text-sm">Cài Đặt Hệ Thống</h3>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.75} />
                  Webhook Google Apps Script
                </label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={settings.gasKeepaliveUrl}
                  onChange={(e) => setSettings({ ...settings, gasKeepaliveUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">URL Web App để đồng bộ và ping giữ Worker online 5 phút/lần.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" strokeWidth={1.75} />
                  Master Public URL
                </label>
                <input
                  type="url"
                  placeholder="https://botcheckstatskingmc.onrender.com"
                  value={settings.masterUrl}
                  onChange={(e) => setSettings({ ...settings, masterUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">Địa chỉ để Worker gửi báo cáo /api/worker-ip-limit về.</p>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-all disabled:opacity-50"
              >
                {savingSettings ? 'Đang lưu...' : 'Lưu Cài Đặt Hệ Thống'}
              </button>
            </form>
          </div>

          {/* Quick Info Box */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 text-xs text-slate-400 space-y-2.5">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
              Cơ chế hoạt động
            </h4>
            <p>1. Worker nhận thông báo đạt giới hạn đăng ký IP KingMC.</p>
            <p>2. Worker báo về Master thông qua endpoint <code className="text-slate-300 bg-slate-950 px-1 py-0.5 rounded">/api/worker-ip-limit</code>.</p>
            <p>3. Master tự động xóa Service bị chặn trên Render, bốc ngẫu nhiên Region mới và tạo Worker mới.</p>
            <p>4. Tự động đồng bộ URL mới sang Google Apps Script để ping 5 phút/lần.</p>
          </div>
        </div>

        {/* Right Column: Render Account Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
              Danh Sách Tài Khoản Render Pool ({accounts.length})
            </h3>
            <span className="text-xs text-slate-400">Được lưu trữ bền vững trên MongoDB Atlas</span>
          </div>

          {accounts.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-12 text-center text-slate-400 space-y-4">
              <RotateCcw className="w-10 h-10 mx-auto text-slate-600" strokeWidth={1.5} />
              <div>
                <p className="font-medium text-slate-200">Chưa có tài khoản Render nào được cấu hình</p>
                <p className="text-xs text-slate-500 mt-1">Bấm nút "Thêm Tài Khoản" bên trên để thêm API Key của Render.</p>
              </div>
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-all"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                <span>Thêm Tài Khoản Ngay</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((acc) => (
                <div
                  key={acc.accountId}
                  className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-5 shadow-xl transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{acc.name || acc.accountId}</h4>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            acc.isActive 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {acc.isActive ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">ID: {acc.accountId}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(acc)}
                          className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Chỉnh sửa tài khoản"
                        >
                          <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.accountId, acc.name)}
                          className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.75} />
                          API Key:
                        </span>
                        <span className="font-mono text-slate-300">{acc.apiKeyMasked || '••••••••••••'}</span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span>Owner ID:</span>
                        <span className="font-mono text-slate-300">{acc.ownerId || 'Tự động phát hiện'}</span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span>Region hiện tại:</span>
                        <span className="font-medium text-emerald-400 uppercase text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {acc.currentRegion || 'Chưa chạy'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span>Số lần đã xoay:</span>
                        <span className="text-white font-bold">{acc.rotationCount || 0} lần</span>
                      </div>

                      {acc.activeServiceUrl && (
                        <div className="pt-2 border-t border-slate-800/60">
                          <span className="text-[11px] text-slate-400 block mb-1">Public URL:</span>
                          <a
                            href={acc.activeServiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-400 hover:underline flex items-center gap-1 truncate"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{acc.activeServiceUrl}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer / Test Connection Button */}
                  <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleTestConnection(acc)}
                      disabled={testingId === acc.accountId}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Activity className={`w-3.5 h-3.5 text-sky-400 ${testingId === acc.accountId ? 'animate-spin' : ''}`} strokeWidth={1.75} />
                      <span>{testingId === acc.accountId ? 'Đang kiểm tra...' : 'Kiểm tra Render API'}</span>
                    </button>
                  </div>

                  {/* Test Result Message */}
                  {testResult && testResult.accountId === acc.accountId && (
                    <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${
                      testResult.success 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    }`}>
                      {testResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" strokeWidth={1.75} />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" strokeWidth={1.75} />
                      )}
                      <span className="truncate">{testResult.message}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleIn my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-emerald-400" strokeWidth={1.75} />
                <span>{editingId ? 'Cập Nhật Tài Khoản Render' : 'Thêm Tài Khoản Render Mới'}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mã Tài Khoản (ID)*</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingId}
                    placeholder="render_acc_01"
                    value={modalForm.accountId}
                    onChange={(e) => setModalForm({ ...modalForm, accountId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tên Gợi Nhớ</label>
                  <input
                    type="text"
                    placeholder="Tài khoản Render 1"
                    value={modalForm.name}
                    onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Render API Key {editingId ? '(Để trống nếu giữ nguyên)' : '*'}
                </label>
                <input
                  type="password"
                  required={!editingId}
                  placeholder="rnd_xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={modalForm.apiKey}
                  onChange={(e) => setModalForm({ ...modalForm, apiKey: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Owner ID (Tùy chọn)</label>
                  <input
                    type="text"
                    placeholder="Tự động phát hiện nếu để trống"
                    value={modalForm.ownerId}
                    onChange={(e) => setModalForm({ ...modalForm, ownerId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nhánh Git (Branch)</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={modalForm.branch}
                    onChange={(e) => setModalForm({ ...modalForm, branch: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">GitHub Repo URL</label>
                <input
                  type="url"
                  placeholder="https://github.com/luuhuubinh/botCheckStatsKingMC"
                  value={modalForm.repo}
                  onChange={(e) => setModalForm({ ...modalForm, repo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Các Khu Vực (Region) Cho Phép Xoay Vòng</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AVAILABLE_REGIONS.map((reg) => (
                    <label
                      key={reg.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        modalForm.allowedRegions.includes(reg.id)
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={modalForm.allowedRegions.includes(reg.id)}
                        onChange={() => handleToggleRegion(reg.id)}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{reg.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md transition-all disabled:opacity-50"
                >
                  {submittingModal ? 'Đang lưu...' : (editingId ? 'Cập Nhật' : 'Thêm Tài Khoản')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
