
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
        className="p-6 bg-[#171717] rounded-3xl border border-[#262626] flex items-center justify-between cursor-pointer hover:bg-[#1f1f1f] transition-all group overflow-hidden relative"
      >
        <div className="flex items-center space-x-4 relative z-10">
          <span className="text-2xl">📍</span>
          <div className="text-left">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Next Reunion</h4>
            <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-medium">Set your coordinates</p>
          </div>
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
      className="p-6 bg-[#171717] rounded-3xl border border-[#262626] flex items-center justify-between cursor-pointer hover:bg-[#1f1f1f] transition-all group overflow-hidden relative"
    >
      <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/5 transition-colors"></div>
      <div className="flex items-center space-x-4 relative z-10">
        <span className="text-2xl group-hover:scale-110 transition-transform">📅</span>
        <div className="text-left">
          <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Reunion in {visitInfo.location}</h4>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-medium">
            {days} Days Left
          </p>
        </div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    </div>
  );
};

export default Countdown;
