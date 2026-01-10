
import React from 'react';
import { VisitInfo } from '../types';

interface CountdownProps {
  visitInfo: VisitInfo | null;
  onUpdate: () => void;
}

const Countdown: React.FC<CountdownProps> = ({ visitInfo, onUpdate }) => {
  if (!visitInfo) {
    return (
      <div 
        onClick={onUpdate}
        className="p-8 bg-[#121212] rounded-[2.5rem] border border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all group overflow-hidden relative shadow-2xl"
      >
        <div className="absolute inset-0 bg-indigo-500/5 blur-3xl rounded-full opacity-20 group-hover:opacity-40 transition-opacity" />
        <div className="flex items-center space-x-5 relative z-10">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-white/5">📍</div>
          <div className="text-left">
            <h4 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Next Reunion</h4>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mt-1">Select location & date</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center relative z-10 group-hover:bg-white/10 transition-colors">
          <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
        </div>
      </div>
    );
  }

  const targetDate = new Date(visitInfo.date);
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const days = diffDays <= 0 ? 0 : diffDays;

  return (
    <div 
      onClick={onUpdate}
      className="p-8 bg-gradient-to-br from-[#121212] to-[#0d0d0d] rounded-[2.5rem] border border-white/5 flex items-center justify-between cursor-pointer hover:border-white/10 transition-all group overflow-hidden relative shadow-2xl"
    >
      <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors"></div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full translate-x-1/2 -translate-y-1/2" />
      
      <div className="flex items-center space-x-5 relative z-10">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-3xl shadow-lg border border-white/10 group-hover:scale-105 transition-transform duration-500">
          ✈️
        </div>
        <div className="text-left">
          <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em] mb-1">Reunion in {visitInfo.location}</h4>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
              {days}
            </span>
            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Days to go</span>
          </div>
        </div>
      </div>
      
      <div className="relative z-10 flex flex-col items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </div>
    </div>
  );
};

export default Countdown;
