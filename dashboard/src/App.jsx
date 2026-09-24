import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import OverviewPage from './pages/OverviewPage';
import WorkersPage from './pages/WorkersPage';
import TrackerPage from './pages/TrackerPage';
import GuildsPage from './pages/GuildsPage';
import { api, authStorage } from './api';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authStorage.hasToken());
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewData, setOverviewData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async () => {
    if (!authStorage.hasToken()) return;
    try {
      const res = await api.getOverview();
      if (res.data) {
        setOverviewData(res.data);
      }
    } catch (e) {
      console.warn('Lỗi lấy dữ liệu Overview:', e.message);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOverview();
    setTimeout(() => setRefreshing(false), 600);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchOverview();
      const interval = setInterval(fetchOverview, 10000); // 10s auto refresh overview
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchOverview]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    fetchOverview();
  };

  const handleLogout = () => {
    authStorage.clearToken();
    setIsAuthenticated(false);
  };

  const getPageInfo = () => {
    switch (activeTab) {
      case 'workers':
        return {
          title: 'Quản Lý Worker Node',
          subtitle: 'Giám sát, thêm/xóa và phân phối tải giữa các Minecraft Bot'
        };
      case 'trackers':
        return {
          title: 'Player Balance Tracker',
          subtitle: 'Theo dõi tài sản và lịch sử số dư người chơi KingMC.vn'
        };
      case 'guilds':
        return {
          title: 'Máy Chủ Discord',
          subtitle: 'Danh sách server Discord mà bot đang hoạt động'
        };
      default:
        return {
          title: 'Bảng Điều Khiển Tổng Quan',
          subtitle: 'Trung tâm giám sát Master Node & Hệ thống Worker vệ tinh'
        };
    }
  };

  const pageInfo = getPageInfo();

  const sidebarStats = {
    onlineWorkers: overviewData?.workers?.online,
    totalWorkers: overviewData?.workers?.total,
    totalTrackers: overviewData?.trackers?.active,
    totalGuilds: overviewData?.guilds?.total,
    mongoConnected: overviewData?.mongoConnected,
    queueLength: overviewData?.queue?.length
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {!isAuthenticated && (
        <LoginModal onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Fixed Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        stats={sidebarStats}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <Header
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewPage
              overviewData={overviewData}
              onRefresh={fetchOverview}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'workers' && (
            <WorkersPage />
          )}

          {activeTab === 'trackers' && (
            <TrackerPage />
          )}

          {activeTab === 'guilds' && (
            <GuildsPage />
          )}
        </main>
      </div>
    </div>
  );
}
