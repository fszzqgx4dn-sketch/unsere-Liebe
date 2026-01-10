
import React from 'react';
import { UserRole } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'daily' | 'more' | 'responses' | 'checkins';
  setActiveTab: (tab: 'daily' | 'more' | 'responses' | 'checkins') => void;
  currentUser: UserRole;
  onSwitchUser: () => void;
  unansweredCount: number;
  checkInNotificationCount: number;
  devMode: boolean;
  isSyncing?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  currentUser, 
  onSwitchUser,
  unansweredCount,
  checkInNotificationCount,
  devMode,
  isSyncing
}) => {
  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-[#0a0a0a] shadow-2xl relative text-white border-x border-[#1a1a1a]">
      {/* Header */}
      <header className="p-4 border-b border-indigo-500/10 flex justify-between items-center bg-[#0a0a0a]/90 backdrop-blur-xl sticky top-0 z-20 h-16">
        <div className="flex items-center space-x-2">
          <h1 className={`text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-rose-300 transition-all duration-500 ${isSyncing ? 'drop-shadow-[0_0_10px_rgba(129,140,248,0.5)]' : ''}`}>
            unsere Liebe
          </h1>
          {isSyncing && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />}
        </div>
        {devMode && (
          <button 
            onClick={onSwitchUser}
            className="text-[9px] uppercase tracking-[0.2em] px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full hover:bg-white hover:text-black transition-all font-black text-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.1)] active:scale-95 animate-in fade-in zoom-in duration-300"
          >
            {currentUser === UserRole.ME ? "Partner Mode" : "My Mode"}
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-indigo-500/10 flex justify-around p-4 z-40 pb-8 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setActiveTab('daily')}
          className={`flex flex-col items-center space-y-1 transition-all duration-300 ${activeTab === 'daily' ? 'text-indigo-400 scale-110' : 'text-gray-600 hover:text-gray-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${activeTab === 'daily' ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Daily</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('responses')}
          className={`relative flex flex-col items-center space-y-1 transition-all duration-300 ${activeTab === 'responses' ? 'text-rose-400 scale-110' : 'text-gray-600 hover:text-gray-400'}`}
        >
          {unansweredCount > 0 && (
            <div className="absolute -top-2 -right-2 flex items-center justify-center animate-bounce">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="absolute text-[8px] font-black text-white">{unansweredCount}</span>
            </div>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${activeTab === 'responses' ? 'drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Shared</span>
        </button>

        <button 
          onClick={() => setActiveTab('checkins')}
          className={`relative flex flex-col items-center space-y-1 transition-all duration-300 ${activeTab === 'checkins' ? 'text-amber-400 scale-110' : 'text-gray-600 hover:text-gray-400'}`}
        >
          {checkInNotificationCount > 0 && (
            <div className="absolute -top-2 -right-2 flex items-center justify-center animate-bounce">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="absolute text-[8px] font-black text-white">{checkInNotificationCount}</span>
            </div>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${activeTab === 'checkins' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Check-in</span>
        </button>

        <button 
          onClick={() => setActiveTab('more')}
          className={`flex flex-col items-center space-y-1 transition-all duration-300 ${activeTab === 'more' ? 'text-emerald-400 scale-110' : 'text-gray-600 hover:text-gray-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${activeTab === 'more' ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Explore</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
