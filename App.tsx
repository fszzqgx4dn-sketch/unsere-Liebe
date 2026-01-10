
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, UserRole, Prompt, PromptCategory, VisitInfo, Answer, PhotoExchange, PhotoStatus, CheckIn, CheckInType } from './types';
import Layout from './components/Layout';
import Countdown from './components/Countdown';
import { generateQuestion } from './services/geminiService';
import { DAILY_CATEGORIES, MORE_CATEGORIES, CATEGORY_COLORS } from './constants';

const EmojiShower = React.memo(({ eventId }: { eventId: number }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 1.2 + Math.random() * 2.5,
      emoji: Math.random() > 0.4 ? '💋' : '❤️'
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
            animationFillMode: 'both'
          }}>{p.emoji}</span>
      ))}
    </div>
  );
});

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('unsereLiebeState');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.devMode === undefined) parsed.devMode = false;
      return parsed;
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
      pendingKissFor: null,
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
  
  const [calDate, setCalDate] = useState(new Date());
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

  // --- IDENTITY HELPERS ---
  const myCode = state.myPairingCode;
  const partnerCode = state.partnerPairingCode;

  // Use this for UI role mapping
  const activeUserId = useMemo(() => {
    return state.currentUser === UserRole.ME ? myCode : (partnerCode || 'PARTNER_TEMP');
  }, [state.currentUser, myCode, partnerCode]);

  // --- SYNC LOGIC ---
  const sharedKey = useMemo(() => {
    if (!state.isPaired || !partnerCode) return null;
    return [myCode, partnerCode].sort().join('-');
  }, [state.isPaired, myCode, partnerCode]);

  const pushToCloud = useCallback(async (data: AppState) => {
    if (!sharedKey) return;
    setIsSyncing(true);
    try {
      const sharedData = {
        visitInfo: data.visitInfo,
        prompts: data.prompts,
        checkIns: data.checkIns,
        streak: data.streak,
        lastCompletedDate: data.lastCompletedDate,
        pendingKissFor: data.pendingKissFor,
        photoExchanges: data.photoExchanges,
        lastUpdate: Date.now()
      };
      await fetch(`https://kvdb.io/N9H8ZpXqL6m7k2u4r5t1w0/${sharedKey}`, {
        method: 'POST',
        body: JSON.stringify(sharedData)
      });
    } catch (e) {
      console.error("Cloud push failed", e);
    } finally {
      setIsSyncing(false);
    }
  }, [sharedKey]);

  const pullFromCloud = useCallback(async () => {
    if (!sharedKey) return;
    try {
      const res = await fetch(`https://kvdb.io/N9H8ZpXqL6m7k2u4r5t1w0/${sharedKey}`);
      if (!res.ok) return;
      const cloudData = await res.json();
      
      setState(prev => {
        // Advanced merge strategy: Keep items with newer timestamps
        const mergeVisits = (local: VisitInfo | null, remote: VisitInfo | null) => {
          if (!local) return remote;
          if (!remote) return local;
          return remote.lastUpdated > local.lastUpdated ? remote : local;
        };

        const mergeArrays = <T extends { id: string; lastUpdated?: number; timestamp?: number }>(local: T[], remote: T[]) => {
          const map = new Map<string, T>();
          local.forEach(item => map.set(item.id, item));
          remote.forEach(item => {
            const existing = map.get(item.id);
            const remoteTime = item.lastUpdated || item.timestamp || 0;
            const localTime = existing?.lastUpdated || existing?.timestamp || 0;
            if (!existing || remoteTime > localTime) {
              map.set(item.id, item);
            }
          });
          return Array.from(map.values()).sort((a, b) => (b.timestamp || b.lastUpdated || 0) - (a.timestamp || a.lastUpdated || 0));
        };

        const newVisit = mergeVisits(prev.visitInfo, cloudData.visitInfo);
        const newPrompts = mergeArrays(prev.prompts, cloudData.prompts);
        const newCheckIns = mergeArrays(prev.checkIns, cloudData.checkIns);
        const newPhotos = mergeArrays(prev.photoExchanges, cloudData.photoExchanges);
        
        // Simple string comparisons for streaks/dates
        const newStreak = Math.max(prev.streak, cloudData.streak || 0);
        
        const hasChanges = JSON.stringify(prev.visitInfo) !== JSON.stringify(newVisit) ||
                           JSON.stringify(prev.prompts) !== JSON.stringify(newPrompts) ||
                           JSON.stringify(prev.checkIns) !== JSON.stringify(newCheckIns) ||
                           JSON.stringify(prev.photoExchanges) !== JSON.stringify(newPhotos) ||
                           prev.pendingKissFor !== cloudData.pendingKissFor;

        if (!hasChanges) return prev;

        return {
          ...prev,
          visitInfo: newVisit,
          prompts: newPrompts,
          checkIns: newCheckIns,
          streak: newStreak,
          lastCompletedDate: cloudData.lastCompletedDate || prev.lastCompletedDate,
          pendingKissFor: cloudData.pendingKissFor,
          photoExchanges: newPhotos
        };
      });
    } catch (e) {
      console.error("Cloud pull failed", e);
    }
  }, [sharedKey]);

  useEffect(() => {
    if (!sharedKey) return;
    const interval = setInterval(pullFromCloud, 4000); // Poll every 4 seconds
    return () => clearInterval(interval);
  }, [sharedKey, pullFromCloud]);

  useEffect(() => {
    localStorage.setItem('unsereLiebeState', JSON.stringify(state));
    const timer = setTimeout(() => {
      if (state.isPaired) pushToCloud(state);
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, pushToCloud]);

  // --- AUTOMATIC GENERATION ---
  useEffect(() => {
    if (!state.isPaired) return;
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    const sundayStr = sunday.toISOString().split('T')[0];
    
    if (!state.checkIns.find(c => c.type === CheckInType.WEEKLY && c.date === sundayStr)) {
      const newCheckIn: CheckIn = {
        id: `weekly-${sundayStr}`,
        type: CheckInType.WEEKLY,
        question: "Reflect on this past week: What was your favorite moment together? What felt challenging? How can we support each other better next week?",
        answers: [],
        date: sundayStr,
        periodLabel: `Week of ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        lastUpdated: Date.now()
      };
      setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
    }
  }, [state.isPaired, state.checkIns]);

  useEffect(() => {
    if (state.pendingKissFor === myCode) {
      setShowerEvent({ id: Date.now() });
      const timer = setTimeout(() => setShowerEvent(null), 5000);
      setState(prev => ({ ...prev, pendingKissFor: null }));
      return () => clearTimeout(timer);
    }
  }, [myCode, state.pendingKissFor]);

  useEffect(() => {
    if (photoTimer !== null) {
      if (photoTimer > 0) {
        const t = setTimeout(() => setPhotoTimer(photoTimer - 1), 1000);
        return () => clearTimeout(t);
      } else {
        const nextIdx = viewingPhotoIndex !== null ? viewingPhotoIndex + 1 : null;
        if (nextIdx !== null && nextIdx < viewingPhotosList.length) {
          setViewingPhotoIndex(nextIdx);
          setPhotoTimer(10);
        } else {
          setViewingPhotoIndex(null);
          setPhotoTimer(null);
          setViewingPhotosList([]);
        }
      }
    }
  }, [photoTimer, viewingPhotoIndex, viewingPhotosList]);

  const toggleUser = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentUser: prev.currentUser === UserRole.ME ? UserRole.PARTNER : UserRole.ME
    }));
  }, []);

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
      }, 2000);
    }
  };

  const handleUpdateVisit = () => {
    if (!selectedDate || !setupLocation) return;
    setState(prev => ({
      ...prev,
      visitInfo: { date: selectedDate, location: setupLocation, lastUpdated: Date.now() }
    }));
    setIsSetupOpen(false);
  };

  const executeResetPairing = () => {
    setState(prev => ({
      ...prev,
      isPaired: false,
      partnerPairingCode: null,
      visitInfo: null,
      prompts: [],
      checkIns: [],
      photoExchanges: []
    }));
    setIsSetupOpen(false);
    setIsConfirmingReset(false);
  };

  const createDailyPrompt = async () => {
    setIsGenerating(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const category = DAILY_CATEGORIES[Math.floor(Math.random() * DAILY_CATEGORIES.length)];
      let daysToVisit = undefined;
      let location = undefined;
      if (state.visitInfo) {
        const diff = new Date(state.visitInfo.date).getTime() - new Date().getTime();
        daysToVisit = Math.ceil(diff / (1000 * 60 * 60 * 24));
        location = state.visitInfo.location;
      }
      const question = await generateQuestion(category, daysToVisit, location);
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

  const sendKuss = () => {
    if (!partnerCode) return;
    setShowerEvent({ id: Date.now() });
    setTimeout(() => setShowerEvent(null), 5000);
    setState(prev => ({ ...prev, pendingKissFor: partnerCode }));
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error(err);
      setIsCameraOpen(false);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const maxWidth = 600;
        const scale = maxWidth / videoRef.current.videoWidth;
        canvasRef.current.width = maxWidth;
        canvasRef.current.height = videoRef.current.videoHeight * scale;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        setCapturedPhoto(canvasRef.current.toDataURL('image/jpeg', 0.5));
        if (videoRef.current.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    }
  };

  const sendCapturedPhoto = () => {
    if (!capturedPhoto) return;
    const newEx: PhotoExchange = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: activeUserId,
      data: capturedPhoto,
      timestamp: Date.now(),
      status: PhotoStatus.DELIVERED
    };
    setState(prev => ({
      ...prev,
      photoExchanges: [newEx, ...prev.photoExchanges]
    }));
    setCapturedPhoto(null);
    setIsCameraOpen(false);
  };

  const openPhotos = () => {
    const unread = state.photoExchanges.filter(ex => ex.senderId !== activeUserId && ex.status === PhotoStatus.DELIVERED);
    if (unread.length > 0) {
      setViewingPhotosList(unread);
      setViewingPhotoIndex(0);
      setPhotoTimer(10);
      setState(prev => ({
        ...prev,
        photoExchanges: prev.photoExchanges.map(ex => 
          (ex.senderId !== activeUserId && ex.status === PhotoStatus.DELIVERED) ? { ...ex, status: PhotoStatus.OPENED } : ex
        )
      }));
    }
  };

  const submitAnswer = () => {
    if ((!activeUnsavedPrompt && !viewingPromptId && !viewingCheckInId) || !currentAnswer.trim()) return;
    
    setState(prev => {
      const timestamp = Date.now();
      if (viewingCheckInId) {
        const newCheckIns = prev.checkIns.map(c => {
          if (c.id === viewingCheckInId) {
            const answers = [...c.answers.filter(a => a.userId !== activeUserId), { userId: activeUserId, text: currentAnswer, timestamp }];
            return { ...c, answers, lastUpdated: timestamp };
          }
          return c;
        });
        return { ...prev, checkIns: newCheckIns };
      }

      const targetId = activeUnsavedPrompt ? activeUnsavedPrompt.id : viewingPromptId;
      let targetPrompt = prev.prompts.find(p => p.id === targetId) || activeUnsavedPrompt;
      if (!targetPrompt) return prev;

      const newAnswers = [...targetPrompt.answers.filter(a => a.userId !== activeUserId), { userId: activeUserId, text: currentAnswer, timestamp }];
      const updatedPrompt = { ...targetPrompt, answers: newAnswers, lastUpdated: timestamp };
      
      const newPrompts = prev.prompts.some(p => p.id === targetId) 
        ? prev.prompts.map(p => p.id === targetId ? updatedPrompt : p)
        : [updatedPrompt, ...prev.prompts];

      return { ...prev, prompts: newPrompts };
    });
    
    setCurrentAnswer(''); 
    setActiveUnsavedPrompt(null); 
    setViewingPromptId(null);
    setViewingCheckInId(null);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const recentMoments = state.prompts.filter(p => p.answers.length > 0 && p.date === todayStr);
  const viewingPrompt = state.prompts.find(p => p.id === viewingPromptId) || activeUnsavedPrompt;
  const viewingCheckIn = state.checkIns.find(c => c.id === viewingCheckInId);
  
  const hasUserAnsweredViewing = useMemo(() => {
    if (viewingCheckIn) return viewingCheckIn.answers.some(a => a.userId === activeUserId);
    if (viewingPrompt) return viewingPrompt.answers.some(a => a.userId === activeUserId);
    return false;
  }, [viewingPrompt, viewingCheckIn, activeUserId]);

  const unansweredCount = useMemo(() => {
    return state.prompts.filter(p => {
      const partnerAnswered = p.answers.some(a => a.userId !== activeUserId);
      const meAnswered = p.answers.some(a => a.userId === activeUserId);
      return partnerAnswered && !meAnswered;
    }).length;
  }, [state.prompts, activeUserId]);

  const unreadPhotosCount = state.photoExchanges.filter(ex => ex.senderId !== activeUserId && ex.status === PhotoStatus.DELIVERED).length;

  const absoluteLastPhoto = useMemo(() => {
    return state.photoExchanges[0] || null;
  }, [state.photoExchanges]);

  const renderSnapStatus = () => {
    if (!absoluteLastPhoto || unreadPhotosCount > 0) return null;
    const isMe = absoluteLastPhoto.senderId === activeUserId;
    if (isMe) {
      return absoluteLastPhoto.status === PhotoStatus.OPENED 
        ? <div className="flex flex-col items-center"><span className="text-indigo-400 text-sm">▻</span><p className="text-[6px] font-black uppercase text-indigo-400 mt-1">Seen</p></div>
        : <div className="flex flex-col items-center"><span className="text-indigo-500 text-sm">➤</span><p className="text-[6px] font-black uppercase text-gray-500 mt-1">Delivered</p></div>;
    }
    return <div className="flex flex-col items-center"><span className="text-rose-400 text-sm">□</span><p className="text-[6px] font-black uppercase text-rose-400 mt-1">Opened</p></div>;
  };

  if (!state.isPaired) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        {showerEvent && <EmojiShower eventId={showerEvent.id} />}
        <div className="w-full max-sm space-y-12 animate-in fade-in slide-in-from-bottom-10">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-rose-300">unsere Liebe</h1>
          <div className="bg-[#171717] p-8 rounded-[2.5rem] border border-[#262626]">
            <p className="text-[8px] text-gray-600 font-black uppercase mb-4 tracking-widest">Your Pairing Code</p>
            <div className="text-4xl font-black text-white tracking-[0.2em]">{state.myPairingCode}</div>
          </div>
          <div className="space-y-6">
            <input value={pairingInput} onChange={(e) => setPairingInput(e.target.value.toUpperCase())} placeholder="PARTNER CODE" className="w-full bg-[#171717] p-6 rounded-2xl border border-[#262626] text-center text-2xl font-black tracking-[0.5em] text-white outline-none" />
            <button onClick={handlePairing} disabled={pairingInput.length < 6} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-500 hover:text-white transition-all">Connect Hearts</button>
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
        currentUser={state.currentUser} onSwitchUser={toggleUser}
        unansweredCount={unansweredCount}
        checkInNotificationCount={0}
        devMode={state.devMode}
        isSyncing={isSyncing}
      >
        {(viewingPrompt || viewingCheckIn) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#171717] w-full max-sm rounded-[2rem] p-6 border border-[#262626] shadow-2xl animate-in slide-in-from-bottom-6">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[8px] uppercase font-black px-3 py-1.5 rounded-lg border border-[#262626] bg-[#0a0a0a]">Prompt</span>
                <button onClick={() => { setActiveUnsavedPrompt(null); setViewingPromptId(null); setViewingCheckInId(null); }} className="text-gray-500 hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <h2 className="text-xl font-bold text-white mb-6 leading-snug">{viewingCheckIn?.question || viewingPrompt?.question}</h2>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {(viewingCheckIn?.answers || viewingPrompt?.answers || []).map(a => (
                  <div key={a.userId} className={`p-4 rounded-xl border border-[#262626] ${a.userId === activeUserId ? 'bg-[#0a0a0a]' : 'bg-[#111]'} border-l-4`} style={{ borderLeftColor: a.userId === activeUserId ? '#6366f1' : '#ec4899' }}>
                    <p className="text-[8px] uppercase font-black text-gray-600 mb-2">{a.userId === activeUserId ? 'You' : 'Partner'}</p>
                    { (a.userId === activeUserId || hasUserAnsweredViewing) ? <p className="text-xs text-gray-300 italic">"{a.text}"</p> : <div className="h-2 w-full bg-gray-800 rounded animate-pulse" /> }
                  </div>
                ))}
                {!hasUserAnsweredViewing && (
                  <div className="space-y-4">
                    <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Share your thoughts..." className="w-full h-32 p-5 bg-[#0a0a0a] rounded-xl border border-[#262626] text-white text-xs outline-none" />
                    <button onClick={submitAnswer} className="w-full bg-white text-black py-3 rounded-xl font-black text-[9px] uppercase tracking-widest">Share Reflection</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewingPhotoIndex !== null && viewingPhotosList[viewingPhotoIndex] && (
          <div onClick={() => setViewingPhotoIndex(null)} className="fixed inset-0 z-[110] bg-black flex flex-col items-center justify-center cursor-pointer">
            <img src={viewingPhotosList[viewingPhotoIndex].data} className="max-w-full max-h-full object-contain" />
            <div className="absolute top-10 right-10 text-white font-black text-2xl bg-black/40 w-12 h-12 rounded-full flex items-center justify-center">{photoTimer}</div>
          </div>
        )}

        <div className="pt-4 px-4 pb-12">
          {activeTab === 'daily' && (
            <div className="space-y-4">
              <Countdown visitInfo={state.visitInfo} onUpdate={() => setIsSetupOpen(true)} />
              <div className="flex gap-3 h-28">
                <div onClick={sendKuss} className="flex-1 p-6 bg-[#171717] rounded-2xl border border-[#262626] flex flex-col items-center justify-center cursor-pointer hover:bg-[#1f1f1f]">
                  <span className="text-2xl">💋</span>
                  <h4 className="text-[8px] font-black text-white uppercase tracking-widest mt-2">Send Kuss</h4>
                </div>
                <div onClick={() => unreadPhotosCount > 0 ? openPhotos() : startCamera()} className={`flex-1 p-6 rounded-2xl border flex flex-col items-center justify-center cursor-pointer ${unreadPhotosCount > 0 ? 'bg-rose-900/20 border-rose-500/40' : 'bg-[#171717] border-[#262626]'}`}>
                  {unreadPhotosCount > 0 ? (
                    <div className="flex flex-col items-center"><span className="text-rose-500 text-sm">■</span><h4 className="text-[8px] font-black text-white uppercase mt-1">{unreadPhotosCount} Received</h4></div>
                  ) : (
                    <>
                      <span className="text-2xl">📸</span>
                      <h4 className="text-[8px] font-black text-white uppercase tracking-widest mt-2">Say Cheese</h4>
                      {renderSnapStatus()}
                    </>
                  )}
                </div>
              </div>
              {!viewingPrompt && (
                <div className="text-center p-6 bg-[#171717] rounded-[2rem] border border-[#262626]">
                  <h3 className="text-lg font-black text-white mb-2">Daily Reflection</h3>
                  <p className="text-[8px] text-gray-500 mb-6 uppercase tracking-widest">Connect deeply through a shared moment.</p>
                  <button onClick={createDailyPrompt} className="w-full bg-white text-black py-3 rounded-xl font-black text-[9px] uppercase tracking-widest">{isGenerating ? '...' : 'Generate Prompt'}</button>
                </div>
              )}
              <div className="space-y-3">
                {recentMoments.map(p => (
                  <div key={p.id} onClick={() => setViewingPromptId(p.id)} className="flex items-center justify-between p-5 bg-[#171717] rounded-[1.5rem] border border-[#262626] cursor-pointer">
                    <div className="flex-1 mr-4">
                      <p className="text-[7px] font-black uppercase mb-1" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</p>
                      <p className="text-xs font-black text-gray-300 line-clamp-1">{p.question}</p>
                    </div>
                    <div className="flex -space-x-2">
                      {p.answers.map(a => <div key={a.userId} className={`w-6 h-6 rounded-full border-2 border-[#171717] flex items-center justify-center text-[8px] font-black ${a.userId === myCode ? 'bg-indigo-600' : 'bg-rose-600'}`}>{a.userId === myCode ? 'Y' : 'P'}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-4 px-2">
              <h2 className="text-xl font-black tracking-tighter text-white">Archive</h2>
              {state.prompts.filter(p => p.answers.length > 0).map(prompt => (
                <div key={prompt.id} onClick={() => setViewingPromptId(prompt.id)} className="bg-[#171717] rounded-[1.5rem] p-5 border border-[#262626] mb-3">
                  <div className="flex justify-between mb-4"><span className="text-[7px] uppercase font-black" style={{ color: CATEGORY_COLORS[prompt.category] }}>{prompt.category}</span></div>
                  <h3 className="text-sm font-black text-white leading-tight">{prompt.question}</h3>
                </div>
              ))}
            </div>
          )}

          {/* ... Other tabs follow similar identification mapping ... */}
        </div>

        {isSetupOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
            <div className="bg-[#171717] w-full max-sm rounded-[2.5rem] p-8 border border-[#262626] flex flex-col">
              <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-black text-white">Settings</h2><button onClick={() => setIsSetupOpen(false)} className="text-gray-500"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
              <div className="space-y-6">
                <div><label className="text-[8px] font-black text-gray-500 uppercase">Location</label><input value={setupLocation} onChange={(e) => setSetupLocation(e.target.value)} className="w-full bg-[#0a0a0a] p-4 rounded-xl border border-[#262626] text-white mt-2" /></div>
                <div><label className="text-[8px] font-black text-gray-500 uppercase">Date</label><input type="date" onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-[#0a0a0a] p-4 rounded-xl border border-[#262626] text-white mt-2" /></div>
                <button onClick={handleUpdateVisit} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-[9px] tracking-widest">Save Reunion</button>
                <div className="pt-6 border-t border-[#262626]"><button onClick={() => setIsConfirmingReset(true)} className="w-full bg-rose-500/10 text-rose-400 py-3 rounded-xl border border-rose-500/20 font-black uppercase text-[8px]">Reset Pairing</button></div>
                {isConfirmingReset && <button onClick={executeResetPairing} className="w-full bg-rose-600 text-white py-3 rounded-xl font-black uppercase text-[8px]">Confirm Reset</button>}
              </div>
            </div>
          </div>
        )}

        {isCameraOpen && (
          <div className="fixed inset-0 z-[130] bg-black flex flex-col">
            <div className="flex-1 relative flex items-center justify-center">
              {capturedPhoto ? <img src={capturedPhoto} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="p-8 flex justify-center space-x-4 bg-black">
              {capturedPhoto ? (
                <><button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="bg-white/10 text-white px-6 py-3 rounded-full font-black text-[9px] uppercase">Retake</button><button onClick={sendCapturedPhoto} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-black text-[9px] uppercase">Send</button></>
              ) : (
                <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white" />
              )}
              <button onClick={() => { setIsCameraOpen(false); if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); }} className="text-white text-[9px] uppercase font-black">Cancel</button>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
};

export default App;
