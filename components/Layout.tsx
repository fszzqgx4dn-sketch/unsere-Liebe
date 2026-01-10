
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
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-[#050505] shadow-[0_0_150px_rgba(0,0,0,1)] relative text-white border-x border-white/5">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#050505]/95 backdrop-blur-3xl sticky top-0 z-50 h-24">
        <div className="flex items-center space-x-3">
          <div className="relative group">
            <h1 className={`text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-rose-300 transition-all duration-1000 ${isSyncing ? 'drop-shadow-[0_0_20px_rgba(129,140,248,0.7)] scale-105' : 'drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]'}`}>
              unsere Liebe
            </h1>
            {isSyncing && (
              <div className="absolute -top-1 -right-6 flex items-center">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping opacity-75" />
                <div className="w-2 h-2 bg-indigo-400 rounded-full absolute shadow-[0_0_12px_#6366f1]" />
              </div>
            )}
          </div>
        </div>
        
        {devMode && (
          <button 
            onClick={onSwitchUser}
            className={`text-[9px] uppercase tracking-[0.2em] px-5 py-2.5 border rounded-full transition-all font-black active:scale-95 shadow-lg ${currentUser === UserRole.ME ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" : "bg-rose-500/10 border-rose-500/30 text-rose-400"}`}
          >
            {currentUser === UserRole.ME ? "View: Me" : "View: Partner"}
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar pb-36">
        {children}
      </main>

      {/* Modern Floating Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-[#050505]/98 backdrop-blur-3xl border-t border-white/5 flex justify-around p-6 z-[60] pb-12 shadow-[0_-30px_60px_rgba(0,0,0,0.9)]">
        <button 
          onClick={() => setActiveTab('daily')}
          className={`flex flex-col items-center space-y-2 transition-all duration-500 group ${activeTab === 'daily' ? 'text-indigo-400 scale-110' : 'text-zinc-700 hover:text-zinc-400'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-500 ${activeTab === 'daily' ? 'bg-indigo-500/10 shadow-[0_0_25px_rgba(99,102,241,0.3)]' : 'group-hover:bg-white/5'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Home</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('responses')}
          className={`relative flex flex-col items-center space-y-2 transition-all duration-500 group ${activeTab === 'responses' ? 'text-rose-400 scale-110' : 'text-zinc-700 hover:text-zinc-400'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-500 ${activeTab === 'responses' ? 'bg-rose-500/10 shadow-[0_0_25px_rgba(244,63,94,0.3)]' : 'group-hover:bg-white/5'}`}>
            {unansweredCount > 0 && (
              <div className="absolute top-1 right-1 flex items-center justify-center animate-bounce">
                <div className="w-3 h-3 bg-rose-500 rounded-full border-[3px] border-[#050505] shadow-[0_0_15px_rgba(244,63,94,0.6)]" />
              </div>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Shared</span>
        </button>

        <button 
          onClick={() => setActiveTab('checkins')}
          className={`relative flex flex-col items-center space-y-2 transition-all duration-500 group ${activeTab === 'checkins' ? 'text-amber-400 scale-110' : 'text-zinc-700 hover:text-zinc-400'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-500 ${activeTab === 'checkins' ? 'bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.3)]' : 'group-hover:bg-white/5'}`}>
            {checkInNotificationCount > 0 && (
              <div className="absolute top-1 right-1 flex items-center justify-center animate-pulse">
                <div className="w-3 h-3 bg-amber-500 rounded-full border-[3px] border-[#050505] shadow-[0_0_10px_rgba(245,158,11,0.4)]" />
              </div>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Journey</span>
        </button>

        <button 
          onClick={() => setActiveTab('more')}
          className={`flex flex-col items-center space-y-2 transition-all duration-500 group ${activeTab === 'more' ? 'text-emerald-400 scale-110' : 'text-zinc-700 hover:text-zinc-400'}`}
        >
          <div className={`p-2.5 rounded-2xl transition-all duration-500 ${activeTab === 'more' ? 'bg-emerald-500/10 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : 'group-hover:bg-white/5'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">More</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
