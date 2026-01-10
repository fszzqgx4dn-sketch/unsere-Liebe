
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, UserRole, Prompt, PromptCategory, VisitInfo, Answer, PhotoExchange, PhotoStatus, CheckIn, CheckInType } from './types';
import Layout from './components/Layout';
import Countdown from './components/Countdown';
import { generateQuestion } from './services/geminiService';
import { DAILY_CATEGORIES, MORE_CATEGORIES, CATEGORY_COLORS, COLORS } from './constants';

const EmojiShower = React.memo(({ eventId }: { eventId: number }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 1.5 + Math.random() * 2,
      size: 1.5 + Math.random() * 3,
      emoji: Math.random() > 0.3 ? '💋' : '❤️'
    }));
  }, [eventId]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {particles.map((p) => (
        <span key={p.id} className="kiss-emoji" style={{ 
            left: `${p.left}vw`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            fontSize: `${p.size}rem`,
            filter: 'drop-shadow(0 0 15px rgba(244,63,94,0.7))',
            animationFillMode: 'both'
          }}>{p.emoji}</span>
      ))}
    </div>
  );
});

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('unsereLiebeState_v3');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      currentUser: UserRole.ME,
      isPaired: false,
      myPairingCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      partnerPairingCode: null,
      visitInfo: null,
      prompts: [],
      checkIns: [],
      streak: 0,
      lastCompletedDate: null,
      lastKissTimestamp: 0,
      lastKissSenderId: null,
      photoExchanges: [],
      devMode: false
    };
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'more' | 'responses' | 'checkins'>('daily');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [pairingInput, setPairingInput] = useState('');
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastKissSeenAt, setLastKissSeenAt] = useState(state.lastKissTimestamp);
  
  const [selectedDate, setSelectedDate] = useState<string | null>(state.visitInfo?.date || null);
  const [setupLocation, setSetupLocation] = useState(state.visitInfo?.location || '');

  const [activeUnsavedPrompt, setActiveUnsavedPrompt] = useState<Prompt | null>(null);
  const [viewingPromptId, setViewingPromptId] = useState<string | null>(null);
  const [viewingCheckInId, setViewingCheckInId] = useState<string | null>(null);
  
  const [showerEvent, setShowerEvent] = useState<{ id: number } | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  
  const [viewingPhotosList, setViewingPhotosList] = useState<PhotoExchange[]>([]);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  const [photoTimer, setPhotoTimer] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Identity logic
  const myCode = state.myPairingCode;
  const partnerCode = state.partnerPairingCode;
  
  // CRITICAL: activeUserId is local to this device
  const activeUserId = useMemo(() => {
    return state.currentUser === UserRole.ME ? myCode : (partnerCode || 'PARTNER');
  }, [state.currentUser, myCode, partnerCode]);

  // Shared Key is consistent across both devices
  const sharedKey = useMemo(() => {
    if (!state.isPaired || !partnerCode) return null;
    return [myCode, partnerCode].sort().join('-');
  }, [state.isPaired, myCode, partnerCode]);

  // Derived states
  const viewingPrompt = useMemo(() => {
    if (activeUnsavedPrompt) return activeUnsavedPrompt;
    if (!viewingPromptId) return null;
    return state.prompts.find(p => p.id === viewingPromptId) || null;
  }, [state.prompts, viewingPromptId, activeUnsavedPrompt]);

  const viewingCheckIn = useMemo(() => {
    if (!viewingCheckInId) return null;
    return state.checkIns.find(c => c.id === viewingCheckInId) || null;
  }, [state.checkIns, viewingCheckInId]);

  // ROBUST SYNC ENGINE
  const pushToCloud = useCallback(async (data: AppState) => {
    if (!sharedKey) return;
    setIsSyncing(true);
    try {
      // We ONLY push "Shared Content", never the local user role or local pairing code
      const payload = {
        visitInfo: data.visitInfo,
        prompts: data.prompts,
        checkIns: data.checkIns,
        streak: data.streak,
        lastCompletedDate: data.lastCompletedDate,
        lastKissTimestamp: data.lastKissTimestamp,
        lastKissSenderId: data.lastKissSenderId,
        photoExchanges: data.photoExchanges,
        updatedAt: Date.now()
      };
      await fetch(`https://kvdb.io/N9H8ZpXqL6m7k2u4r5t1w0/${sharedKey}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Sync push failed", e);
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  }, [sharedKey]);

  const pullAndMerge = useCallback(async () => {
    if (!sharedKey) return;
    try {
      const res = await fetch(`https://kvdb.io/N9H8ZpXqL6m7k2u4r5t1w0/${sharedKey}`);
      if (!res.ok) return;
      const remote = await res.json();
      
      setState(prev => {
        const mergeArrays = <T extends { id: string; lastUpdated?: number; timestamp?: number }>(local: T[], remoteArr: T[]) => {
          const map = new Map<string, T>();
          local.forEach(i => map.set(i.id, i));
          remoteArr.forEach(i => {
            const existing = map.get(i.id);
            const rTime = i.lastUpdated || i.timestamp || 0;
            const lTime = existing?.lastUpdated || existing?.timestamp || 0;
            if (!existing || rTime > lTime) map.set(i.id, i);
          });
          return Array.from(map.values()).sort((a, b) => (b.timestamp || b.lastUpdated || 0) - (a.timestamp || a.lastUpdated || 0));
        };

        const newVisit = (remote.visitInfo?.lastUpdated || 0) > (prev.visitInfo?.lastUpdated || 0) 
          ? remote.visitInfo : prev.visitInfo;

        const newPrompts = mergeArrays(prev.prompts, remote.prompts || []);
        const newCheckIns = mergeArrays(prev.checkIns, remote.checkIns || []);
        const newPhotos = mergeArrays(prev.photoExchanges, remote.photoExchanges || []);

        const hasChanges = JSON.stringify(prev.visitInfo) !== JSON.stringify(newVisit) ||
                           JSON.stringify(prev.prompts) !== JSON.stringify(newPrompts) ||
                           JSON.stringify(prev.checkIns) !== JSON.stringify(newCheckIns) ||
                           JSON.stringify(prev.photoExchanges) !== JSON.stringify(newPhotos) ||
                           prev.lastKissTimestamp !== remote.lastKissTimestamp;

        if (!hasChanges) return prev;

        return {
          ...prev,
          visitInfo: newVisit,
          prompts: newPrompts,
          checkIns: newCheckIns,
          photoExchanges: newPhotos,
          streak: Math.max(prev.streak, remote.streak || 0),
          lastKissTimestamp: remote.lastKissTimestamp,
          lastKissSenderId: remote.lastKissSenderId
        };
      });
    } catch (e) {
      console.error("Sync pull failed", e);
    }
  }, [sharedKey]);

  // ACTION HANDLERS
  const handleSendKiss = () => {
    if (!partnerCode) return;
    const now = Date.now();
    setShowerEvent({ id: now });
    setTimeout(() => setShowerEvent(null), 5000);
    
    setState(prev => {
      const newState = { ...prev, lastKissTimestamp: now, lastKissSenderId: myCode };
      pushToCloud(newState);
      return newState;
    });
  };

  const submitAnswer = () => {
    if ((!activeUnsavedPrompt && !viewingPromptId && !viewingCheckInId) || !currentAnswer.trim()) return;
    const timestamp = Date.now();
    
    setState(prev => {
      let newState: AppState;
      if (viewingCheckInId) {
        newState = {
          ...prev,
          checkIns: prev.checkIns.map(c => c.id === viewingCheckInId ? {
            ...c, lastUpdated: timestamp, answers: [...c.answers.filter(a => a.userId !== myCode), { userId: myCode, text: currentAnswer, timestamp }]
          } : c)
        };
      } else {
        const targetId = activeUnsavedPrompt ? activeUnsavedPrompt.id : viewingPromptId;
        const target = prev.prompts.find(p => p.id === targetId) || activeUnsavedPrompt;
        if (!target) return prev;

        const updated = {
          ...target, lastUpdated: timestamp,
          answers: [...target.answers.filter(a => a.userId !== myCode), { userId: myCode, text: currentAnswer, timestamp }]
        };

        newState = {
          ...prev,
          prompts: prev.prompts.some(p => p.id === targetId) 
            ? prev.prompts.map(p => p.id === targetId ? updated : p)
            : [updated, ...prev.prompts]
        };
      }
      
      pushToCloud(newState);
      return newState;
    });

    setCurrentAnswer('');
    setActiveUnsavedPrompt(null);
    setViewingPromptId(null);
    setViewingCheckInId(null);
  };

  // EFFECTS
  useEffect(() => {
    if (!sharedKey) return;
    const interval = setInterval(pullAndMerge, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [sharedKey, pullAndMerge]);

  useEffect(() => {
    localStorage.setItem('unsereLiebeState_v3', JSON.stringify(state));
  }, [state]);

  // Remote Kiss Detection
  useEffect(() => {
    if (state.lastKissTimestamp > lastKissSeenAt && state.lastKissSenderId !== myCode) {
      setShowerEvent({ id: state.lastKissTimestamp });
      setLastKissSeenAt(state.lastKissTimestamp);
      setTimeout(() => setShowerEvent(null), 5000);
    }
  }, [state.lastKissTimestamp, state.lastKissSenderId, myCode, lastKissSeenAt]);

  const handlePairing = () => {
    if (pairingInput.length >= 6) {
      setShowerEvent({ id: Date.now() });
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          isPaired: true,
          partnerPairingCode: pairingInput.toUpperCase()
        }));
        setShowerEvent(null);
        setPairingInput('');
      }, 1500);
    }
  };

  const handleUpdateVisit = () => {
    if (!selectedDate || !setupLocation) return;
    setState(prev => {
      const newState = {
        ...prev,
        visitInfo: { date: selectedDate, location: setupLocation, lastUpdated: Date.now() }
      };
      pushToCloud(newState);
      return newState;
    });
    setIsSetupOpen(false);
  };

  const createDailyPrompt = async () => {
    setIsGenerating(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const category = DAILY_CATEGORIES[Math.floor(Math.random() * DAILY_CATEGORIES.length)];
      const question = await generateQuestion(category);
      const newPrompt: Prompt = {
        id: Math.random().toString(36).substr(2, 9),
        category,
        question,
        answers: [],
        date: todayStr,
        isDaily: true,
        lastUpdated: Date.now()
      };
      setActiveUnsavedPrompt(newPrompt);
    } finally {
      setIsGenerating(false);
    }
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { console.error(err); setIsCameraOpen(false); }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = 600;
        canvasRef.current.height = videoRef.current.videoHeight * (600 / videoRef.current.videoWidth);
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        setCapturedPhoto(canvasRef.current.toDataURL('image/jpeg', 0.6));
        if (videoRef.current.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    }
  };

  const sendCapturedPhoto = () => {
    if (!capturedPhoto) return;
    const newEx: PhotoExchange = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: myCode,
      data: capturedPhoto,
      timestamp: Date.now(),
      status: PhotoStatus.DELIVERED
    };
    setState(prev => {
      const newState = { ...prev, photoExchanges: [newEx, ...prev.photoExchanges] };
      pushToCloud(newState);
      return newState;
    });
    setCapturedPhoto(null);
    setIsCameraOpen(false);
  };

  const openPhotos = () => {
    const unread = state.photoExchanges.filter(ex => ex.senderId !== myCode && ex.status === PhotoStatus.DELIVERED);
    if (unread.length > 0) {
      setViewingPhotosList(unread);
      setViewingPhotoIndex(0);
      setPhotoTimer(10);
      setState(prev => {
        const newState = {
          ...prev,
          photoExchanges: prev.photoExchanges.map(ex => 
            (ex.senderId !== myCode && ex.status === PhotoStatus.DELIVERED) ? { ...ex, status: PhotoStatus.OPENED } : ex
          )
        };
        pushToCloud(newState);
        return newState;
      });
    }
  };

  const unreadPhotosCount = state.photoExchanges.filter(ex => ex.senderId !== myCode && ex.status === PhotoStatus.DELIVERED).length;
  const absoluteLastPhoto = state.photoExchanges[0] || null;

  const renderSnapStatus = () => {
    if (!absoluteLastPhoto || unreadPhotosCount > 0) return null;
    const isMe = absoluteLastPhoto.senderId === myCode;
    if (isMe) {
      return absoluteLastPhoto.status === PhotoStatus.OPENED 
        ? <div className="flex flex-col items-center"><span className="text-indigo-400 text-sm animate-pulse">▻</span><p className="text-[6px] font-black uppercase text-indigo-400 mt-1">Seen</p></div>
        : <div className="flex flex-col items-center"><span className="text-indigo-500 text-sm">➤</span><p className="text-[6px] font-black uppercase text-gray-500 mt-1">Sent</p></div>;
    }
    return <div className="flex flex-col items-center"><span className="text-rose-400 text-sm">□</span><p className="text-[6px] font-black uppercase text-rose-400 mt-1">Opened</p></div>;
  };

  if (!state.isPaired) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
        {showerEvent && <EmojiShower eventId={showerEvent.id} />}
        <div className="w-full max-sm space-y-12 animate-in fade-in slide-in-from-bottom-20 duration-1000">
          <div className="relative inline-block">
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-rose-300 drop-shadow-[0_0_20px_rgba(129,140,248,0.4)]">unsere Liebe</h1>
            <div className="absolute -top-4 -right-4 w-8 h-8 bg-indigo-500 rounded-full blur-2xl animate-pulse" />
          </div>
          
          <div className="bg-[#111] p-10 rounded-[3rem] border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative group transition-all hover:border-white/10">
            <div className="absolute inset-0 bg-indigo-500/5 blur-3xl rounded-full opacity-50" />
            <p className="text-[10px] text-zinc-500 font-black uppercase mb-4 tracking-[0.3em]">Your Pair Code</p>
            <div className="text-5xl font-black text-white tracking-[0.2em] relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{state.myPairingCode}</div>
          </div>

          <div className="space-y-6 max-w-xs mx-auto">
            <input 
              value={pairingInput} 
              onChange={(e) => setPairingInput(e.target.value.toUpperCase())} 
              placeholder="PARTNER CODE" 
              className="w-full bg-[#111] p-6 rounded-3xl border border-white/5 text-center text-2xl font-black tracking-[0.4em] text-white outline-none focus:border-indigo-500/30 transition-all placeholder:text-zinc-800 placeholder:tracking-normal shadow-inner" 
            />
            <button 
              onClick={handlePairing} 
              disabled={pairingInput.length < 6} 
              className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase text-[11px] tracking-widest hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-20 shadow-[0_10px_30px_rgba(255,255,255,0.1)] active:scale-95"
            >
              Link Hearts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showerEvent && <EmojiShower eventId={showerEvent.id} />}
      <Layout 
        activeTab={activeTab} setActiveTab={setActiveTab} 
        currentUser={state.currentUser} onSwitchUser={() => setState(prev => ({...prev, currentUser: prev.currentUser === UserRole.ME ? UserRole.PARTNER : UserRole.ME}))}
        unansweredCount={state.prompts.filter(p => p.answers.some(a => a.userId !== myCode) && !p.answers.some(a => a.userId === myCode)).length}
        checkInNotificationCount={state.checkIns.filter(c => !c.answers.some(a => a.userId === myCode)).length}
        devMode={state.devMode}
        isSyncing={isSyncing}
      >
        {/* Modal for Prompting/Answering */}
        {(viewingPrompt || viewingCheckIn) && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-[#121212] w-full max-sm rounded-[2.5rem] p-8 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-10 border-indigo-500/10">
              <div className="flex justify-between items-center mb-8">
                <span className="text-[9px] uppercase font-black px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400">Connection</span>
                <button onClick={() => { setActiveUnsavedPrompt(null); setViewingPromptId(null); setViewingCheckInId(null); }} className="text-zinc-500 hover:text-white transition-colors p-2"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <h2 className="text-2xl font-black text-white mb-8 leading-tight tracking-tight">{viewingCheckIn?.question || viewingPrompt?.question}</h2>
              <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {(viewingCheckIn?.answers || viewingPrompt?.answers || []).map(a => {
                  const isMe = a.userId === myCode;
                  const canSee = isMe || (viewingCheckIn || viewingPrompt)?.answers.some(ans => ans.userId === myCode);
                  return (
                    <div key={a.userId} className={`p-6 rounded-3xl border ${isMe ? 'bg-indigo-500/5 border-indigo-500/10' : 'bg-rose-500/5 border-rose-500/10 shadow-[0_5px_15px_rgba(244,63,94,0.05)]'} border-l-4`} style={{ borderLeftColor: isMe ? '#818cf8' : '#fb7185' }}>
                      <p className="text-[9px] uppercase font-black mb-3 tracking-widest" style={{ color: isMe ? '#818cf8' : '#fb7185' }}>{isMe ? 'You' : 'Partner'}</p>
                      {canSee ? <p className="text-sm text-zinc-300 italic leading-relaxed font-medium">"{a.text}"</p> : <div className="h-4 w-3/4 bg-zinc-800 rounded-full animate-pulse" />}
                    </div>
                  );
                })}
                {!(viewingCheckIn || viewingPrompt)?.answers.some(a => a.userId === myCode) && (
                  <div className="space-y-4 pt-4">
                    <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Type your response..." className="w-full h-32 p-6 bg-black/40 rounded-[2rem] border border-white/5 text-white text-sm outline-none focus:border-indigo-500/40 transition-all placeholder:text-zinc-700 shadow-inner" />
                    <button onClick={submitAnswer} className="w-full bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_10px_20px_rgba(255,255,255,0.05)] hover:shadow-white/10 transition-all active:scale-95">Send Reflection</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-6 px-5 pb-16">
          {activeTab === 'daily' && (
            <div className="space-y-6">
              <Countdown visitInfo={state.visitInfo} onUpdate={() => setIsSetupOpen(true)} />
              
              <div className="grid grid-cols-2 gap-4 h-32">
                <div onClick={handleSendKiss} className="bg-[#121212] rounded-[2rem] border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all group active:scale-95 shadow-lg border-rose-500/5">
                  <span className="text-3xl group-hover:scale-125 transition-transform drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]">💋</span>
                  <h4 className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-3">Send Kuss</h4>
                </div>
                <div onClick={() => unreadPhotosCount > 0 ? openPhotos() : startCamera()} className={`rounded-[2rem] border flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 shadow-lg ${unreadPhotosCount > 0 ? 'bg-rose-500/10 border-rose-500/30 animate-pulse' : 'bg-[#121212] border-white/5 hover:bg-white/5 border-indigo-500/5'}`}>
                  {unreadPhotosCount > 0 ? (
                    <div className="flex flex-col items-center"><span className="text-rose-500 text-sm font-black drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]">● {unreadPhotosCount}</span><h4 className="text-[9px] font-black text-white uppercase mt-1">New Snap</h4></div>
                  ) : (
                    <>
                      <span className="text-3xl drop-shadow-[0_0_15px_rgba(129,140,248,0.4)]">📸</span>
                      <h4 className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-3">Cheese</h4>
                      {renderSnapStatus()}
                    </>
                  )}
                </div>
              </div>

              {!activeUnsavedPrompt && (
                <div className="text-center p-8 bg-gradient-to-br from-[#121212] to-[#0a0a0a] rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group hover:border-indigo-500/20 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <h3 className="text-xl font-black text-white mb-3 tracking-tight">Daily Story Spark</h3>
                  <p className="text-[9px] text-zinc-600 mb-8 uppercase tracking-[0.2em]">Ignite a new conversation</p>
                  <button onClick={createDailyPrompt} className="w-full bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 hover:bg-indigo-50 transition-all border border-indigo-500/5">
                    {isGenerating ? 'Summoning AI...' : 'Generate Prompt'}
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {state.prompts.filter(p => p.date === new Date().toISOString().split('T')[0]).map(p => (
                  <div key={p.id} onClick={() => setViewingPromptId(p.id)} className="flex items-center justify-between p-6 bg-[#121212] rounded-[2rem] border border-white/5 cursor-pointer hover:border-white/20 transition-all hover:translate-y-[-2px] shadow-lg group">
                    <div className="flex-1 mr-4">
                      <p className="text-[8px] font-black uppercase mb-2 tracking-widest group-hover:opacity-100 opacity-60 transition-opacity" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</p>
                      <p className="text-sm font-bold text-zinc-200 line-clamp-1 group-hover:text-white transition-colors">{p.question}</p>
                    </div>
                    <div className="flex -space-x-3">
                      {p.answers.map(a => <div key={a.userId} className={`w-8 h-8 rounded-full border-[3px] border-[#121212] flex items-center justify-center text-[10px] font-black shadow-lg ${a.userId === myCode ? 'bg-indigo-600 text-white' : 'bg-rose-500 text-white'}`}>{a.userId === myCode ? 'M' : 'P'}</div>)}
                      {p.answers.length < 2 && <div className="w-8 h-8 rounded-full border-[3px] border-[#121212] bg-zinc-800/50 flex items-center justify-center text-zinc-600 text-[10px] font-black shadow-inner">+</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-6 px-1">
              <h2 className="text-2xl font-black tracking-tight text-white mb-8 border-l-4 border-rose-500/50 pl-4">Our History</h2>
              {state.prompts.filter(p => p.answers.length > 0).map(p => (
                <div key={p.id} onClick={() => setViewingPromptId(p.id)} className="bg-[#121212] rounded-[2rem] p-6 border border-white/5 cursor-pointer hover:border-white/20 transition-all group shadow-md hover:shadow-indigo-500/5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[8px] uppercase font-black px-3 py-1 rounded-full bg-black/40 border border-white/5" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</span>
                    <span className="text-[8px] text-zinc-600 uppercase font-black">{new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <h3 className="text-md font-bold text-zinc-200 leading-snug group-hover:text-white transition-colors">{p.question}</h3>
                </div>
              ))}
              {state.prompts.filter(p => p.answers.length > 0).length === 0 && (
                <div className="py-32 text-center flex flex-col items-center space-y-4 opacity-50">
                  <span className="text-5xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">📖</span>
                  <p className="text-[10px] uppercase font-black tracking-[0.3em] text-zinc-600">Share your first memory</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checkins' && (
            <div className="space-y-6 px-1">
              <h2 className="text-2xl font-black tracking-tight text-white mb-8 border-l-4 border-amber-500/50 pl-4">The Journey</h2>
              <div className="space-y-4">
                {state.checkIns.map(c => {
                  const answered = c.answers.some(a => a.userId === myCode);
                  return (
                    <div key={c.id} onClick={() => setViewingCheckInId(c.id)} className={`p-7 rounded-[2.5rem] border transition-all cursor-pointer shadow-lg ${answered ? 'bg-[#121212] border-white/5' : 'bg-amber-500/5 border-amber-500/20 shadow-amber-500/5 hover:bg-amber-500/10'}`}>
                      <div className="flex justify-between mb-3">
                        <span className="text-[8px] uppercase font-black text-amber-400 tracking-widest">{c.type}</span>
                        <span className="text-[8px] text-zinc-600 uppercase font-black">{c.periodLabel}</span>
                      </div>
                      <h4 className="text-lg font-black text-white leading-tight">{c.question}</h4>
                      {!answered && <button className="w-full bg-amber-500 text-black py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest mt-6 shadow-xl shadow-amber-500/20 active:scale-95 transition-all">Start Check-in</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'more' && (
            <div className="px-1 space-y-10">
              <h2 className="text-2xl font-black tracking-tight text-white mb-8 border-l-4 border-indigo-500/50 pl-4">Deep Explore</h2>
              <div className="grid grid-cols-2 gap-4">
                {MORE_CATEGORIES.map(category => (
                  <button key={category} onClick={() => { setIsGenerating(true); generateQuestion(category).then(q => { setActiveUnsavedPrompt({id: Math.random().toString(36).substr(2, 9), category, question: q, answers: [], date: new Date().toISOString(), isDaily: false, lastUpdated: Date.now()}); setIsGenerating(false); }); }} className="bg-[#121212] p-8 rounded-[2.5rem] border border-white/5 text-left hover:bg-white/5 active:scale-95 transition-all shadow-md group relative overflow-hidden hover:border-indigo-500/20">
                    <div className="absolute top-0 right-0 w-3 h-3 rounded-full m-4 blur-[4px]" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                    <p className="text-[11px] font-black uppercase tracking-tight mb-2" style={{ color: CATEGORY_COLORS[category] }}>{category}</p>
                    <p className="text-[8px] text-zinc-700 uppercase font-black tracking-wider">AI Insight</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sync Settings */}
        {isSetupOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300">
            <div className="bg-[#121212] w-full max-sm rounded-[3rem] p-10 border border-white/5 flex flex-col shadow-3xl">
              <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-white tracking-tighter">Settings</h2><button onClick={() => setIsSetupOpen(false)} className="text-zinc-500 p-2"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
              <div className="space-y-8">
                <div><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Reunion Spot</label><input value={setupLocation} onChange={(e) => setSetupLocation(e.target.value)} className="w-full bg-black/40 p-5 rounded-2xl border border-white/5 text-white mt-3 focus:border-indigo-500/30 outline-none transition-all shadow-inner" /></div>
                <div><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Meetup Date</label><input type="date" value={selectedDate || ''} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-black/40 p-5 rounded-2xl border border-white/5 text-white mt-3 focus:border-indigo-500/30 outline-none transition-all shadow-inner" /></div>
                <button onClick={handleUpdateVisit} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-95 transition-all">Sync Milestone</button>
                <div className="pt-8 border-t border-white/5"><button onClick={() => setIsConfirmingReset(true)} className="w-full bg-rose-500/10 text-rose-400 py-4 rounded-2xl border border-rose-500/20 font-black uppercase text-[9px] tracking-widest">Unlink Device</button></div>
                {isConfirmingReset && <button onClick={() => {localStorage.removeItem('unsereLiebeState_v3'); window.location.reload();}} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest animate-pulse mt-2 shadow-lg shadow-rose-900/20">Confirm Disconnect</button>}
              </div>
            </div>
          </div>
        )}

        {/* Camera Flow */}
        {isCameraOpen && (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in slide-in-from-bottom-20 duration-500">
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {capturedPhoto ? <img src={capturedPhoto} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
              {!capturedPhoto && <div className="absolute inset-0 border-[50px] border-black/30 pointer-events-none" />}
            </div>
            <div className="p-12 flex justify-center items-center space-x-10 bg-black pb-24">
              {capturedPhoto ? (
                <><button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="bg-white/10 text-white px-10 py-5 rounded-full font-black text-[11px] uppercase tracking-widest border border-white/5">Retake</button><button onClick={sendCapturedPhoto} className="bg-indigo-600 text-white px-12 py-5 rounded-full font-black text-[11px] uppercase tracking-widest shadow-[0_10px_30px_rgba(129,140,248,0.3)] border border-indigo-400/20 transition-all active:scale-95">Send To Her</button></>
              ) : (
                <button onClick={takePhoto} className="w-24 h-24 rounded-full border-[8px] border-white shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-90 transition-all bg-white/10" />
              )}
              <button onClick={() => { setIsCameraOpen(false); if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); }} className="text-zinc-600 text-[11px] uppercase font-black hover:text-white transition-colors">Abort</button>
            </div>
          </div>
        )}

        {/* Receiver Experience */}
        {viewingPhotoIndex !== null && viewingPhotosList[viewingPhotoIndex] && (
          <div onClick={() => { if(viewingPhotoIndex < viewingPhotosList.length - 1) setViewingPhotoIndex(viewingPhotoIndex + 1); else { setViewingPhotoIndex(null); setPhotoTimer(null); } }} className="fixed inset-0 z-[210] bg-black flex flex-col items-center justify-center cursor-pointer animate-in zoom-in duration-300">
            <img src={viewingPhotosList[viewingPhotoIndex].data} className="max-w-full max-h-full object-contain" />
            <div className="absolute top-12 right-12 text-white font-black text-3xl bg-black/60 w-20 h-20 rounded-full flex items-center justify-center border border-white/10 backdrop-blur-md shadow-2xl animate-pulse">{photoTimer}</div>
            <div className="absolute bottom-16 text-[11px] text-white/40 font-black uppercase tracking-[0.6em] animate-pulse">Tap To Next</div>
          </div>
        )}
      </Layout>
    </>
  );
};

export default App;
