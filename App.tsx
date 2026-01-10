
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, UserRole, Prompt, PromptCategory, VisitInfo, Answer, PhotoExchange, PhotoStatus, CheckIn, CheckInType } from './types';
import Layout from './components/Layout';
import Countdown from './components/Countdown';
import { generateQuestion } from './services/geminiService';
import { DAILY_CATEGORIES, MORE_CATEGORIES, CATEGORY_COLORS } from './constants';

// Stable Emoji Shower component
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

  // --- SYNC LOGIC ---
  const sharedKey = useMemo(() => {
    if (!state.isPaired || !state.partnerPairingCode) return null;
    return [state.myPairingCode, state.partnerPairingCode].sort().join('-');
  }, [state.isPaired, state.myPairingCode, state.partnerPairingCode]);

  // Push local changes to cloud
  const pushToCloud = useCallback(async (data: AppState) => {
    if (!sharedKey) return;
    setIsSyncing(true);
    try {
      // We only sync the shared parts of the state
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

  // Pull changes from cloud
  const pullFromCloud = useCallback(async () => {
    if (!sharedKey) return;
    try {
      const res = await fetch(`https://kvdb.io/N9H8ZpXqL6m7k2u4r5t1w0/${sharedKey}`);
      if (!res.ok) return;
      const cloudData = await res.json();
      
      setState(prev => {
        // Only update if cloud data is newer or has different contents
        // This is a simple merge strategy
        const hasChanges = JSON.stringify(prev.visitInfo) !== JSON.stringify(cloudData.visitInfo) ||
                           JSON.stringify(prev.prompts) !== JSON.stringify(cloudData.prompts) ||
                           JSON.stringify(prev.checkIns) !== JSON.stringify(cloudData.checkIns) ||
                           JSON.stringify(prev.photoExchanges) !== JSON.stringify(cloudData.photoExchanges) ||
                           prev.pendingKissFor !== cloudData.pendingKissFor;

        if (!hasChanges) return prev;

        return {
          ...prev,
          visitInfo: cloudData.visitInfo,
          prompts: cloudData.prompts,
          checkIns: cloudData.checkIns,
          streak: cloudData.streak,
          lastCompletedDate: cloudData.lastCompletedDate,
          pendingKissFor: cloudData.pendingKissFor,
          photoExchanges: cloudData.photoExchanges
        };
      });
    } catch (e) {
      console.error("Cloud pull failed", e);
    }
  }, [sharedKey]);

  // Auto-sync polling
  useEffect(() => {
    if (!sharedKey) return;
    const interval = setInterval(pullFromCloud, 5000);
    return () => clearInterval(interval);
  }, [sharedKey, pullFromCloud]);

  // Trigger push on local state changes
  useEffect(() => {
    localStorage.setItem('unsereLiebeState', JSON.stringify(state));
    // Avoid infinite loop by only pushing if we aren't currently pulling
    // In a real app we'd use a versioning system
    const timer = setTimeout(() => {
        if (state.isPaired) pushToCloud(state);
    }, 1000);
    return () => clearTimeout(timer);
  }, [state, pushToCloud]);

  // Reset confirmation state when modal closes
  useEffect(() => {
    if (!isSetupOpen) {
      setIsConfirmingReset(false);
    }
  }, [isSetupOpen]);

  // Automatic Check-in Generation Logic
  useEffect(() => {
    if (!state.isPaired) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    const sundayStr = sunday.toISOString().split('T')[0];
    
    const existingWeekly = state.checkIns.find(c => c.type === CheckInType.WEEKLY && c.date === sundayStr);
    if (!existingWeekly) {
      const newCheckIn: CheckIn = {
        id: `weekly-${sundayStr}`,
        type: CheckInType.WEEKLY,
        question: "Reflect on this past week: What was your favorite moment together? What felt challenging? How can we support each other better next week?",
        answers: [],
        date: sundayStr,
        periodLabel: `Week of ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      };
      setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
    }

    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStr = firstOfMonth.toISOString().split('T')[0];
    const existingMonthly = state.checkIns.find(c => c.type === CheckInType.MONTHLY && c.date === monthStr);
    if (!existingMonthly) {
      const newCheckIn: CheckIn = {
        id: `monthly-${monthStr}`,
        type: CheckInType.MONTHLY,
        question: "Looking back at the last month: What was our biggest milestone? What are you most grateful for in our relationship right now?",
        answers: [],
        date: monthStr,
        periodLabel: firstOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      };
      setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
    }
  }, [state.isPaired]);

  useEffect(() => {
    if (state.pendingKissFor === state.currentUser) {
      setShowerEvent({ id: Date.now() });
      const timer = setTimeout(() => setShowerEvent(null), 5000);
      setState(prev => ({ ...prev, pendingKissFor: null }));
      return () => clearTimeout(timer);
    }
  }, [state.currentUser, state.pendingKissFor]);

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

  useEffect(() => {
    if (state.isPaired && !state.visitInfo) {
      setIsSetupOpen(true);
    }
  }, [state.isPaired, state.visitInfo]);

  const toggleUser = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentUser: prev.currentUser === UserRole.ME ? UserRole.PARTNER : UserRole.ME
    }));
    setActiveUnsavedPrompt(null);
    setViewingPromptId(null);
    setViewingCheckInId(null);
    setCurrentAnswer('');
    setIsCameraOpen(false);
    setCapturedPhoto(null);
    setViewingPhotoIndex(null);
    setPhotoTimer(null);
    setViewingPhotosList([]);
    setShowerEvent(null);
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
      }, 3000);
    }
  };

  const handleUpdateVisit = () => {
    if (!selectedDate || !setupLocation) return;
    setState(prev => ({
      ...prev,
      visitInfo: { date: selectedDate, location: setupLocation }
    }));
    setIsSetupOpen(false);
  };

  const executeResetPairing = () => {
    setState(prev => ({
      ...prev,
      isPaired: false,
      partnerPairingCode: null
    }));
    setIsSetupOpen(false);
    setIsConfirmingReset(false);
    setPairingInput('');
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
        isDaily: true
      };
      setActiveUnsavedPrompt(newPrompt);
      setViewingPromptId(null);
      setViewingCheckInId(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const createExtraPrompt = async (category: PromptCategory) => {
    setIsGenerating(true);
    try {
      const question = await generateQuestion(category);
      const newPrompt: Prompt = {
        id: Math.random().toString(36).substr(2, 9),
        category,
        question,
        answers: [],
        date: new Date().toISOString(),
        isDaily: false
      };
      setActiveUnsavedPrompt(newPrompt);
      setViewingPromptId(null);
      setViewingCheckInId(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const sendKuss = () => {
    const partner = state.currentUser === UserRole.ME ? UserRole.PARTNER : UserRole.ME;
    if (state.pendingKissFor === partner) return;
    setShowerEvent({ id: Date.now() });
    setTimeout(() => setShowerEvent(null), 5000);
    setState(prev => ({ ...prev, pendingKissFor: partner }));
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        // Compress for cloud transmission
        const maxWidth = 800;
        const scale = maxWidth / videoRef.current.videoWidth;
        canvasRef.current.width = maxWidth;
        canvasRef.current.height = videoRef.current.videoHeight * scale;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const data = canvasRef.current.toDataURL('image/jpeg', 0.6); // Jpeg for better compression
        setCapturedPhoto(data);
        stopCamera();
      }
    }
  };

  const sendCapturedPhoto = () => {
    if (!capturedPhoto) return;
    const newEx: PhotoExchange = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: state.currentUser,
      data: capturedPhoto,
      timestamp: Date.now(),
      status: PhotoStatus.DELIVERED
    };
    setState(prev => ({
      ...prev,
      photoExchanges: [...prev.photoExchanges, newEx]
    }));
    setCapturedPhoto(null);
    setIsCameraOpen(false);
  };

  const openPhotos = () => {
    const unread = state.photoExchanges.filter(ex => ex.senderId !== state.currentUser && ex.status === PhotoStatus.DELIVERED);
    if (unread.length > 0) {
      setViewingPhotosList(unread);
      setViewingPhotoIndex(0);
      setPhotoTimer(10);
      setState(prev => ({
        ...prev,
        photoExchanges: prev.photoExchanges.map(ex => 
          (ex.senderId !== prev.currentUser && ex.status === PhotoStatus.DELIVERED) 
            ? { ...ex, status: PhotoStatus.OPENED } 
            : ex
        )
      }));
    }
  };

  const skipPhotoTimer = () => {
    const nextIdx = viewingPhotoIndex !== null ? viewingPhotoIndex + 1 : null;
    if (nextIdx !== null && nextIdx < viewingPhotosList.length) {
      setViewingPhotoIndex(nextIdx);
      setPhotoTimer(10);
    } else {
      setViewingPhotoIndex(null);
      setPhotoTimer(null);
      setViewingPhotosList([]);
    }
  };

  const handleSkipPrompt = () => {
    if (!activeUnsavedPrompt) return;
    if (activeUnsavedPrompt.isDaily) {
      createDailyPrompt();
    } else {
      createExtraPrompt(activeUnsavedPrompt.category);
    }
  };

  const submitAnswer = () => {
    if ((!activeUnsavedPrompt && !viewingPromptId && !viewingCheckInId) || !currentAnswer.trim()) return;
    
    setState(prev => {
      if (viewingCheckInId) {
        const newCheckIns = prev.checkIns.map(c => {
          if (c.id === viewingCheckInId) {
            const existingAnswerIdx = c.answers.findIndex(a => a.userId === prev.currentUser);
            const newAnswer: Answer = { userId: prev.currentUser, text: currentAnswer, timestamp: Date.now() };
            const newAnswers = [...c.answers];
            if (existingAnswerIdx !== -1) { newAnswers[existingAnswerIdx] = newAnswer; } else { newAnswers.push(newAnswer); }
            return { ...c, answers: newAnswers };
          }
          return c;
        });
        return { ...prev, checkIns: newCheckIns };
      }

      const targetId = activeUnsavedPrompt ? activeUnsavedPrompt.id : viewingPromptId;
      let newPrompts = [...prev.prompts];
      let targetPrompt: Prompt;
      const existingIdx = newPrompts.findIndex(p => p.id === targetId);
      if (existingIdx !== -1) {
        targetPrompt = { ...newPrompts[existingIdx] };
      } else if (activeUnsavedPrompt) {
        targetPrompt = { ...activeUnsavedPrompt };
      } else { return prev; }
      const existingAnswerIdx = targetPrompt.answers.findIndex(a => a.userId === prev.currentUser);
      const newAnswer: Answer = { userId: prev.currentUser, text: currentAnswer, timestamp: Date.now() };
      if (existingAnswerIdx !== -1) { targetPrompt.answers[existingAnswerIdx] = newAnswer; } else { targetPrompt.answers.push(newAnswer); }
      if (existingIdx !== -1) { newPrompts[existingIdx] = targetPrompt; } else { newPrompts = [targetPrompt, ...newPrompts]; }
      
      let newStreak = prev.streak;
      let newLastCompletedDate = prev.lastCompletedDate;
      if (targetPrompt.isDaily) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (newLastCompletedDate !== todayStr) {
          if (newLastCompletedDate) {
            const lastDate = new Date(newLastCompletedDate);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0,0,0,0); lastDate.setHours(0,0,0,0);
            if (lastDate.getTime() === yesterday.getTime()) { newStreak += 1; } else { newStreak = 1; }
          } else { newStreak = 1; }
          newLastCompletedDate = todayStr;
        }
      }
      return { ...prev, prompts: newPrompts, streak: newStreak, lastCompletedDate: newLastCompletedDate };
    });
    
    setCurrentAnswer(''); 
    setActiveUnsavedPrompt(null); 
    setViewingPromptId(null);
    setViewingCheckInId(null);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const recentMoments = state.prompts.filter(p => p.answers.length > 0 && p.date.split('T')[0] === todayStr);
  const viewingPrompt = state.prompts.find(p => p.id === viewingPromptId) || activeUnsavedPrompt;
  const viewingCheckIn = state.checkIns.find(c => c.id === viewingCheckInId);
  
  const hasUserAnsweredViewing = useMemo(() => {
    if (viewingCheckIn) return viewingCheckIn.answers.some(a => a.userId === state.currentUser);
    if (viewingPrompt) return viewingPrompt.answers.some(a => a.userId === state.currentUser);
    return false;
  }, [viewingPrompt, viewingCheckIn, state.currentUser]);

  const unansweredCount = useMemo(() => {
    return state.prompts.filter(p => {
      const partnerAnswered = p.answers.some(a => a.userId !== state.currentUser);
      const meAnswered = p.answers.some(a => a.userId === state.currentUser);
      return partnerAnswered && !meAnswered;
    }).length;
  }, [state.prompts, state.currentUser]);

  const checkInNotificationCount = useMemo(() => {
    return state.checkIns.filter(c => {
      const meAnswered = c.answers.some(a => a.userId === state.currentUser);
      return !meAnswered;
    }).length;
  }, [state.checkIns, state.currentUser]);

  const calendarDays = useMemo(() => {
    const year = calDate.getFullYear(); const month = calDate.getMonth();
    const count = new Date(year, month + 1, 0).getDate(); const startDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= count; i++) days.push(new Date(year, month, i));
    return days;
  }, [calDate]);

  const changeMonth = (offset: number) => {
    const newDate = new Date(calDate); newDate.setMonth(calDate.getMonth() + offset); setCalDate(newDate);
  };

  const unreadPhotosCount = state.photoExchanges.filter(ex => ex.senderId !== state.currentUser && ex.status === PhotoStatus.DELIVERED).length;

  const absoluteLastPhoto = useMemo(() => {
    if (state.photoExchanges.length === 0) return null;
    return state.photoExchanges[state.photoExchanges.length - 1];
  }, [state.photoExchanges]);

  const renderSnapStatus = () => {
    if (!absoluteLastPhoto) return null;
    if (unreadPhotosCount > 0) return null;

    const isMe = absoluteLastPhoto.senderId === state.currentUser;
    const status = absoluteLastPhoto.status;

    if (isMe) {
      if (status === PhotoStatus.OPENED) {
        return (
          <div className="flex flex-col items-center">
            <span className="text-indigo-400 text-sm">▻</span>
            <p className="text-[6px] font-black uppercase tracking-[0.1em] text-indigo-400 mt-1">Seen</p>
          </div>
        );
      } else {
        return (
          <div className="flex flex-col items-center">
            <span className="text-indigo-500 text-sm">➤</span>
            <p className="text-[6px] font-black uppercase tracking-[0.1em] text-gray-500 mt-1">Delivered</p>
          </div>
        );
      }
    } else {
      return (
        <div className="flex flex-col items-center">
          <span className="text-rose-400 text-sm">□</span>
          <p className="text-[6px] font-black uppercase tracking-[0.1em] text-rose-400 mt-1">Opened</p>
        </div>
      );
    }
  };

  if (!state.isPaired) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        {showerEvent && <EmojiShower eventId={showerEvent.id} />}
        <div className="w-full max-sm space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-rose-300">
              unsere Liebe
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-black">Find your partner</p>
          </div>

          <div className="bg-[#171717] p-8 rounded-[2.5rem] border border-[#262626] shadow-2xl relative overflow-hidden group">
            <p className="text-[8px] text-gray-600 font-black uppercase tracking-[0.3em] mb-4">Your Pairing Code</p>
            <div className="text-4xl font-black text-white tracking-[0.2em] mb-4 select-all cursor-pointer hover:text-indigo-300 transition-colors">
              {state.myPairingCode}
            </div>
            <p className="text-[7px] text-gray-500 uppercase tracking-widest leading-relaxed">Send this to your love to connect profiles</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[8px] text-gray-600 font-black uppercase tracking-[0.3em]">Enter Partner's Code</label>
              <input 
                value={pairingInput}
                onChange={(e) => setPairingInput(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                className="w-full bg-[#171717] p-6 rounded-2xl border border-[#262626] text-center text-2xl font-black tracking-[0.5em] text-white outline-none"
              />
            </div>
            <button onClick={handlePairing} disabled={pairingInput.length < 6} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-lg disabled:opacity-20 hover:bg-indigo-500 hover:text-white transition-all">
              Connect Hearts
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
        currentUser={state.currentUser} onSwitchUser={toggleUser}
        unansweredCount={unansweredCount}
        checkInNotificationCount={checkInNotificationCount}
        devMode={state.devMode}
        isSyncing={isSyncing}
      >
        {(viewingPrompt || viewingCheckIn) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#171717] w-full max-sm rounded-[2rem] p-6 border border-[#262626] shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-6">
              <div className="flex items-center justify-between mb-6 relative z-10">
                <span className="text-[8px] uppercase font-black tracking-[0.2em] px-3 py-1.5 rounded-lg border border-[#262626] shadow-sm bg-[#0a0a0a]" style={{ color: viewingCheckIn ? '#f59e0b' : CATEGORY_COLORS[(viewingPrompt as Prompt).category] }}>
                  {viewingCheckIn ? viewingCheckIn.type : (viewingPrompt as Prompt).category}
                </span>
                <div className="flex items-center space-x-2">
                  {activeUnsavedPrompt && (
                    <button onClick={handleSkipPrompt} className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-white transition-colors px-3 py-1.5 bg-[#0a0a0a] rounded-lg border border-[#262626]">
                      Skip
                    </button>
                  )}
                  <button onClick={() => { setActiveUnsavedPrompt(null); setViewingPromptId(null); setViewingCheckInId(null); setCurrentAnswer(''); }} className="text-gray-700 hover:text-white transition-colors p-1.5 bg-[#0a0a0a] rounded-lg border border-[#262626]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <h2 className="text-xl font-bold text-white mb-6 leading-snug tracking-tight relative z-10">{viewingCheckIn ? viewingCheckIn.question : (viewingPrompt as Prompt).question}</h2>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).map(a => {
                  const isOwnAnswer = a.userId === state.currentUser;
                  const shouldReveal = isOwnAnswer || hasUserAnsweredViewing;

                  return (
                    <div key={a.userId} className={`p-4 rounded-xl border border-[#262626] shadow-inner ${isOwnAnswer ? 'bg-[#0a0a0a]' : 'bg-[#111]'}`} style={{ borderLeft: `4px solid ${a.userId === UserRole.ME ? '#6366f1' : '#ec4899'}` }}>
                      <p className="text-[8px] uppercase tracking-[0.1em] font-black text-gray-600 mb-2">{isOwnAnswer ? 'You' : 'Partner'}</p>
                      {shouldReveal ? (
                        <p className="text-xs text-gray-300 italic font-medium leading-relaxed">"{a.text}"</p>
                      ) : (
                        <div className="flex items-center space-x-2 py-2">
                          <div className="h-2 w-full bg-gray-800 rounded-full animate-pulse opacity-50" />
                          <span className="text-[8px] font-black uppercase text-indigo-500 whitespace-nowrap">Answer to Reveal</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!hasUserAnsweredViewing && (
                  <div className="space-y-4">
                    <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Pour your heart out..." className="w-full h-32 p-5 bg-[#0a0a0a] rounded-xl border border-[#262626] focus:border-indigo-500/30 text-gray-200 text-xs font-medium outline-none transition-all" />
                    <button onClick={submitAnswer} className="w-full bg-white text-black py-3 rounded-xl font-black hover:bg-indigo-500 hover:text-white transition-all text-[9px] uppercase tracking-[0.3em] active:scale-95">Share Reflection</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewingPhotoIndex !== null && viewingPhotosList[viewingPhotoIndex] && (
          <div onClick={skipPhotoTimer} className="fixed inset-0 z-[110] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300 cursor-pointer">
            <img src={viewingPhotosList[viewingPhotoIndex].data} className="max-w-full max-h-full object-contain pointer-events-none" alt="Snap" />
            <div className="absolute top-10 right-10 text-white font-black text-2xl bg-black/40 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md">
              {photoTimer}
            </div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 animate-pulse">
              Tap to skip
            </div>
          </div>
        )}

        {isCameraOpen && (
          <div className="fixed inset-0 z-[110] bg-black flex flex-col overflow-hidden">
            <div className="flex-1 relative flex items-center justify-center">
              {capturedPhoto ? <img src={capturedPhoto} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
              <canvas ref={canvasRef} className="hidden" />
              <button onClick={() => { stopCamera(); setIsCameraOpen(false); setCapturedPhoto(null); }} className="absolute top-6 left-6 p-3 bg-black/30 rounded-full backdrop-blur-md text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-8 pb-12 flex justify-center items-center bg-black">
              {capturedPhoto ? (
                <div className="flex space-x-4">
                  <button onClick={() => { setCapturedPhoto(null); startCamera(); }} className="bg-white/10 text-white px-6 py-3 rounded-full font-black uppercase tracking-[0.2em] text-[9px]">Retake</button>
                  <button onClick={sendCapturedPhoto} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-black uppercase tracking-[0.2em] text-[9px]">Send</button>
                </div>
              ) : (
                <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white" />
              )}
            </div>
          </div>
        )}

        <div className="pt-4 px-4 pb-12">
          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2 mb-4">
                <div className="flex items-center space-x-2 bg-[#171717] px-3 py-1.5 rounded-full border border-indigo-500/10">
                  <span className="text-orange-500 text-[10px] animate-pulse">🔥</span>
                  <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">{state.streak} Days</span>
                </div>
                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest bg-[#171717] px-3 py-1.5 rounded-full">
                  {state.visitInfo ? `Arrival: ${new Date(state.visitInfo.date).toLocaleDateString()}` : 'Date TBD'}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Countdown visitInfo={state.visitInfo} onUpdate={() => setIsSetupOpen(true)} />
                <div className="flex gap-3 h-28">
                  <div onClick={sendKuss} className="flex-1 p-6 bg-[#171717] rounded-2xl border border-[#262626] flex items-center justify-between cursor-pointer hover:bg-[#1f1f1f] transition-all relative overflow-hidden text-center">
                    <div className="flex flex-col items-center justify-center w-full relative z-10 space-y-2">
                      <span className="text-2xl">💋</span>
                      <h4 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Send Kuss</h4>
                    </div>
                  </div>
                  <div onClick={() => unreadPhotosCount > 0 ? openPhotos() : startCamera()} className={`flex-1 p-6 rounded-2xl border flex flex-col items-center justify-center cursor-pointer hover:bg-[#1f1f1f] transition-all relative overflow-hidden text-center ${unreadPhotosCount > 0 ? 'bg-rose-900/20 border-rose-500/40' : 'bg-[#171717] border-[#262626]'}`}>
                    <div className="flex flex-col items-center justify-center w-full relative z-10 space-y-1">
                      {unreadPhotosCount > 0 ? (
                         <div className="flex flex-col items-center">
                            <span className="text-rose-500 text-sm">■</span>
                            <h4 className="text-[8px] font-black text-white uppercase tracking-[0.2em] mt-1">{unreadPhotosCount} Received</h4>
                         </div>
                      ) : (
                        <>
                          <span className="text-2xl">📸</span>
                          <h4 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Say Cheese</h4>
                          {renderSnapStatus()}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {!viewingPrompt && (
                <div className="text-center p-6 bg-[#171717] rounded-[2rem] border border-[#262626] relative overflow-hidden h-52 flex flex-col justify-center group">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 bg-indigo-500 group-hover:scale-110 transition-transform duration-500 blur-2xl" />
                  <h3 className="text-lg font-black text-white mb-2 tracking-tight relative z-10">Daily Reflection</h3>
                  <p className="text-[8px] text-gray-500 mb-6 uppercase tracking-[0.2em] font-medium relative z-10">Connect deeply through a shared moment.</p>
                  <button onClick={createDailyPrompt} disabled={isGenerating} className="w-full bg-white text-black py-3 rounded-xl font-black hover:bg-indigo-500 hover:text-white transition-all text-[9px] uppercase tracking-[0.3em] active:scale-95 relative z-10">
                    {isGenerating ? "..." : "Generate Prompt"}
                  </button>
                </div>
              )}

              <div className="px-2 pt-2">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-700 mb-4 flex items-center">
                  <span className="w-8 h-[1px] bg-indigo-500/20 mr-4"></span> Today's Moments
                </h3>
                <div className="space-y-3">
                  {recentMoments.length > 0 ? recentMoments.map(p => (
                    <div key={p.id} onClick={() => { setViewingPromptId(p.id); setActiveUnsavedPrompt(null); }} className="flex items-center justify-between p-5 bg-[#171717] rounded-[1.5rem] border border-[#262626] cursor-pointer hover:bg-[#1f1f1f] transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 rounded-full opacity-10" style={{ backgroundColor: CATEGORY_COLORS[p.category] }} />
                      <div className="flex-1 mr-4 relative z-10">
                        <p className="text-[7px] font-black uppercase tracking-[0.1em] mb-1" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</p>
                        <p className="text-xs font-black text-gray-300 line-clamp-1 group-hover:text-white transition-colors">{p.question}</p>
                      </div>
                      <div className="flex -space-x-2 relative z-10">
                        {p.answers.map(a => (
                          <div key={a.userId} className={`w-7 h-7 rounded-full border-2 border-[#171717] flex items-center justify-center text-[8px] font-black ${a.userId === state.currentUser ? 'bg-indigo-600' : 'bg-rose-600'}`}>
                            {a.userId === UserRole.ME ? 'M' : 'H'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center border border-dashed border-[#1a1a1a] rounded-2xl">
                      <p className="text-[8px] text-gray-700 font-black uppercase tracking-[0.2em]">Start today's story</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-4 px-2">
              <h2 className="text-xl font-black tracking-tighter text-white">Archive</h2>
              {state.prompts.length > 0 ? state.prompts.filter(p => p.answers.length > 0).map(prompt => {
                const meAnswered = prompt.answers.some(a => a.userId === state.currentUser);

                return (
                  <div key={prompt.id} onClick={() => setViewingPromptId(prompt.id)} className="bg-[#171717] rounded-[1.5rem] p-5 border border-[#262626] mb-3 relative overflow-hidden cursor-pointer hover:bg-[#1f1f1f] transition-all">
                    <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 rounded-full opacity-5" style={{ backgroundColor: CATEGORY_COLORS[prompt.category] }} />
                    <div className="flex justify-between mb-4 relative z-10">
                      <span className="text-[7px] uppercase font-black" style={{ color: CATEGORY_COLORS[prompt.category] }}>{prompt.category}</span>
                      <span className="text-[7px] text-gray-700 uppercase">{new Date(prompt.date).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-sm font-black text-white mb-6 leading-tight relative z-10">{prompt.question}</h3>
                    
                    <div className="space-y-3 relative z-10">
                      {meAnswered ? (
                        prompt.answers.map(ans => {
                          const isOwn = ans.userId === state.currentUser;
                          return (
                            <div key={ans.userId} className={`bg-[#0a0a0a] rounded-xl p-4 border border-[#262626] border-l-4`} style={{ borderLeftColor: isOwn ? '#4f46e5' : '#ec4899' }}>
                              <p className="text-[7px] font-black uppercase tracking-[0.1em] text-gray-600 mb-2">{isOwn ? 'You' : 'Partner'}</p>
                              <p className="text-[11px] text-gray-300 italic">"{ans.text}"</p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-4 bg-[#0a0a0a] rounded-xl border border-indigo-500/10 text-center space-y-3">
                          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Partner shared their thoughts!</p>
                          <button className="w-full bg-indigo-600 text-white py-2 rounded-lg font-black text-[8px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-900/20">Answer to Reveal</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div className="py-12 text-center opacity-30">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em]">No shared history yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checkins' && (
            <div className="space-y-6 px-2">
              <h2 className="text-xl font-black tracking-tighter text-white">Our Journey</h2>
              <div className="space-y-4">
                {state.checkIns.filter(c => !c.answers.find(a => a.userId === state.currentUser)).map(checkIn => {
                  const partnerAnswered = checkIn.answers.some(a => a.userId !== state.currentUser);
                  return (
                    <div key={checkIn.id} onClick={() => setViewingCheckInId(checkIn.id)} className="bg-[#171717] rounded-[1.5rem] p-6 border border-amber-500/20 cursor-pointer transition-all hover:bg-[#1f1f1f]">
                      <span className="text-[7px] uppercase font-black text-amber-400">{checkIn.type} Check-in</span>
                      <h4 className="text-lg font-black text-white mt-2">{checkIn.periodLabel}</h4>
                      {partnerAnswered && (
                        <div className="mt-2 flex items-center space-x-1">
                          <span className="text-[6px] font-black uppercase text-indigo-400 tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded">Partner answered!</span>
                        </div>
                      )}
                      <button className="w-full bg-amber-500 text-black py-2 rounded-xl font-black text-[8px] uppercase tracking-[0.3em] mt-4 shadow-lg shadow-amber-900/20">Start Check-in</button>
                    </div>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-[#1a1a1a]">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-700 mb-6">Our History</h3>
                <div className="space-y-4">
                  {state.checkIns.filter(c => c.answers.length > 0).map(checkIn => {
                    const meAnswered = checkIn.answers.some(a => a.userId === state.currentUser);
                    return (
                      <div key={checkIn.id} onClick={() => setViewingCheckInId(checkIn.id)} className="bg-[#171717] p-5 rounded-2xl border border-[#262626] cursor-pointer hover:bg-[#1f1f1f] transition-all">
                        <span className="text-[7px] uppercase font-black text-gray-500">{checkIn.type} • {checkIn.periodLabel}</span>
                        <p className="text-xs font-black text-gray-300 mt-2">{checkIn.periodLabel} Reflection</p>
                        {!meAnswered && (
                          <button className="w-full bg-indigo-600 text-white py-2 rounded-lg font-black text-[7px] uppercase tracking-[0.2em] mt-4">Answer to Reveal</button>
                        )}
                      </div>
                    );
                  })}
                  {state.checkIns.filter(c => c.answers.length > 0).length === 0 && (
                    <div className="py-12 text-center opacity-30">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em]">The library of us will grow here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'more' && (
            <div className="px-2">
              <h2 className="text-xl font-black tracking-tighter text-white">Explore</h2>
              <div className="grid grid-cols-2 gap-4 mt-8">
                {MORE_CATEGORIES.map(category => (
                  <button 
                    key={category} 
                    onClick={() => createExtraPrompt(category)} 
                    className="bg-[#171717] p-6 rounded-[2rem] border border-[#262626] text-left hover:bg-[#1f1f1f] active:scale-95 transition-all group overflow-hidden relative"
                  >
                    <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 rounded-full opacity-10" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-40 text-white">Category</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.1em] leading-tight" style={{ color: CATEGORY_COLORS[category] }}>{category}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {isSetupOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-[#171717] w-full max-sm rounded-[2.5rem] p-8 border border-indigo-500/10 relative flex flex-col max-h-[90vh] overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-white tracking-tighter">Settings</h2>
                <button onClick={() => setIsSetupOpen(false)} className="text-gray-600 hover:text-white p-2 bg-[#0a0a0a] rounded-xl border border-[#262626]">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-8 flex-1 overflow-y-auto pr-1">
                <section className="space-y-4">
                  <h3 className="text-[8px] font-black uppercase tracking-[0.4em] text-indigo-400 border-b border-indigo-500/10 pb-2">Reunion Details</h3>
                  <div>
                    <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Where will you meet?</label>
                    <input value={setupLocation} onChange={(e) => setSetupLocation(e.target.value)} className="w-full bg-[#0a0a0a] p-4 rounded-xl border border-[#262626] text-white mt-2 font-bold focus:border-indigo-500/30 outline-none transition-all" placeholder="City" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest">On what day?</label>
                    <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-[#262626] mt-2">
                      <div className="flex justify-between items-center mb-4">
                        <button onClick={() => changeMonth(-1)} className="text-gray-500 hover:text-white p-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className="text-[8px] font-black text-white uppercase tracking-widest">{calDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                        <button onClick={() => changeMonth(1)} className="text-gray-500 hover:text-white p-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((d, i) => d ? (
                          <button key={i} onClick={() => setSelectedDate(d.toISOString().split('T')[0])} className={`h-8 w-8 rounded-lg text-[9px] font-black transition-all ${selectedDate === d.toISOString().split('T')[0] ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:bg-white/5'}`}>{d.getDate()}</button>
                        ) : <div key={i} />)}
                      </div>
                    </div>
                  </div>
                  <button onClick={handleUpdateVisit} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-[9px] tracking-[0.2em] shadow-lg active:scale-95 transition-all">Save Reunion Info</button>
                </section>
                
                <section className="space-y-4">
                  <h3 className="text-[8px] font-black uppercase tracking-[0.4em] text-rose-400 border-b border-rose-500/10 pb-2">Connection</h3>
                  <div className="bg-[#0a0a0a] p-5 rounded-2xl border border-[#262626]">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Your Code</span>
                      <span className="text-xs font-black text-white tracking-[0.2em]">{state.myPairingCode}</span>
                    </div>
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Partner Code</span>
                      <span className="text-xs font-black text-white tracking-[0.2em]">{state.partnerPairingCode || 'Not set'}</span>
                    </div>
                    
                    {!isConfirmingReset ? (
                      <button 
                        onClick={() => setIsConfirmingReset(true)} 
                        className="w-full bg-rose-500/10 text-rose-400 py-3 rounded-xl border border-rose-500/20 font-black uppercase text-[8px] tracking-[0.2em] hover:bg-rose-500/20 transition-all active:scale-95"
                      >
                        Reset Pairing
                      </button>
                    ) : (
                      <div className="space-y-3 animate-in zoom-in-95 duration-200">
                        <p className="text-[8px] font-black uppercase tracking-widest text-rose-500 text-center mb-2">Are you sure? This will disconnect you.</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setIsConfirmingReset(false)} 
                            className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl border border-white/10 font-black uppercase text-[8px] tracking-[0.2em]"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={executeResetPairing} 
                            className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-black uppercase text-[8px] tracking-[0.2em] shadow-lg shadow-rose-900/40 active:scale-95 transition-all"
                          >
                            Yes, Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-4 pb-8">
                  <h3 className="text-[8px] font-black uppercase tracking-[0.4em] text-amber-400 border-b border-amber-500/10 pb-2">App Settings</h3>
                  <div className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-2xl border border-[#262626]">
                    <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Developer Mode</span>
                    <button 
                      onClick={() => setState(prev => ({ ...prev, devMode: !prev.devMode }))}
                      className={`w-10 h-5 rounded-full relative transition-all duration-300 ${state.devMode ? 'bg-indigo-600' : 'bg-gray-800'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-md transition-all duration-300 ${state.devMode ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
};

export default App;
