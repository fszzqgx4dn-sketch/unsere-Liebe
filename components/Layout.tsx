
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
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-[#0a0a0a] shadow-[0_0_100px_rgba(0,0,0,0.8)] relative text-white border-x border-white/5">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]/90 backdrop-blur-2xl sticky top-0 z-50 h-20">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <h1 className={`text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-rose-300 transition-all duration-700 ${isSyncing ? 'drop-shadow-[0_0_15px_rgba(129,140,248,0.6)]' : ''}`}>
              unsere Liebe
            </h1>
            {isSyncing && (
              <div className="absolute -top-1 -right-4 flex items-center">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full absolute shadow-[0_0_8px_#6366f1]" />
              </div>
            )}
          </div>
        </div>
        
        {devMode && (
          <button 
            onClick={onSwitchUser}
            className={`text-[9px] uppercase tracking-[0.2em] px-4 py-2 border rounded-full transition-all font-black active:scale-95 ${currentUser === UserRole.ME ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}
          >
            {currentUser === UserRole.ME ? "Me" : "Partner"}
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar pb-32">
        {children}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-[#0a0a0a]/95 backdrop-blur-3xl border-t border-white/5 flex justify-around p-5 z-[60] pb-10 shadow-[0_-20px_40px_rgba(0,0,0,0.8)]">
        <button 
          onClick={() => setActiveTab('daily')}
          className={`flex flex-col items-center space-y-1.5 transition-all duration-300 group ${activeTab === 'daily' ? 'text-indigo-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
          <div className={`p-2 rounded-xl transition-all ${activeTab === 'daily' ? 'bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('responses')}
          className={`relative flex flex-col items-center space-y-1.5 transition-all duration-300 group ${activeTab === 'responses' ? 'text-rose-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
          <div className={`p-2 rounded-xl transition-all ${activeTab === 'responses' ? 'bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.2)]' : ''}`}>
            {unansweredCount > 0 && (
              <div className="absolute top-1 right-1 flex items-center justify-center animate-bounce">
                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-[#0a0a0a] shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
              </div>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest">Shared</span>
        </button>

        <button 
          onClick={() => setActiveTab('checkins')}
          className={`relative flex flex-col items-center space-y-1.5 transition-all duration-300 group ${activeTab === 'checkins' ? 'text-amber-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
          <div className={`p-2 rounded-xl transition-all ${activeTab === 'checkins' ? 'bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : ''}`}>
            {checkInNotificationCount > 0 && (
              <div className="absolute top-1 right-1 flex items-center justify-center animate-pulse">
                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-[#0a0a0a]" />
              </div>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest">Journey</span>
        </button>

        <button 
          onClick={() => setActiveTab('more')}
          className={`flex flex-col items-center space-y-1.5 transition-all duration-300 group ${activeTab === 'more' ? 'text-emerald-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
          <div className={`p-2 rounded-xl transition-all ${activeTab === 'more' ? 'bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest">More</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
