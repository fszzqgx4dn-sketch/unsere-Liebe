
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, UserRole, Prompt, PromptCategory, VisitInfo, Answer, PhotoExchange, PhotoStatus, CheckIn, CheckInType } from './types';
import Layout from './components/Layout';
import Countdown from './components/Countdown';
import { generateQuestion } from './services/geminiService';
import { DAILY_CATEGORIES, MORE_CATEGORIES, CATEGORY_COLORS } from './constants';

// Stable Emoji Shower component to prevent random regeneration on every parent render
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
      if (!parsed.photoExchanges) {
        parsed.photoExchanges = parsed.photoExchange ? [parsed.photoExchange] : [];
        delete parsed.photoExchange;
      }
      if (parsed.isPaired === undefined) {
        parsed.isPaired = false;
        parsed.myPairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      }
      if (!parsed.checkIns) {
        parsed.checkIns = [];
      }
      return parsed;
    }
    
    // Default initial state with rich preview for the new Check-in feature
    const now = new Date();
    const currentWeekLabel = `Week of ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const currentMonthLabel = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });

    return {
      currentUser: UserRole.ME,
      isPaired: false,
      myPairingCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      partnerPairingCode: null,
      visitInfo: null,
      prompts: [],
      checkIns: [
        {
          id: 'preview-weekly-active',
          type: CheckInType.WEEKLY,
          question: "How did we handle the distance this past week? Was there a moment you felt especially close despite the miles, or something we can improve for next week?",
          answers: [],
          date: now.toISOString().split('T')[0],
          periodLabel: currentWeekLabel
        },
        {
          id: 'preview-monthly-active',
          type: CheckInType.MONTHLY,
          question: "Reflecting on this past month: What was our most significant shared milestone? What are you most grateful for in our connection right now?",
          answers: [],
          date: now.toISOString().split('T')[0],
          periodLabel: currentMonthLabel
        },
        {
          id: 'preview-archive-weekly',
          type: CheckInType.WEEKLY,
          question: "Think back to our communication lately. Are we finding enough time for the deep conversations, or has life been getting in the way?",
          answers: [
            { userId: UserRole.ME, text: "I think we did great! That long Friday night call really helped me feel connected again.", timestamp: Date.now() - 86400000 * 5 },
            { userId: UserRole.PARTNER, text: "It's been a busy week for me, but hearing your voice every morning is the highlight of my day.", timestamp: Date.now() - 86400000 * 4 }
          ],
          date: new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0],
          periodLabel: "Last Week"
        }
      ],
      streak: 0,
      lastCompletedDate: null,
      pendingKissFor: null,
      photoExchanges: []
    };
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'more' | 'responses' | 'checkins'>('daily');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [pairingInput, setPairingInput] = useState('');
  
  const [calDate, setCalDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(state.visitInfo?.date || null);
  const [setupLocation, setSetupLocation] = useState(state.visitInfo?.location || '');

  const [activeUnsavedPrompt, setActiveUnsavedPrompt] = useState<Prompt | null>(null);
  const [viewingPromptId, setViewingPromptId] = useState<string | null>(null);
  const [viewingCheckInId, setViewingCheckInId] = useState<string | null>(null);
  
  // Local shower event state (not persisted)
  const [showerEvent, setShowerEvent] = useState<{ id: number } | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  
  const [viewingPhotosList, setViewingPhotosList] = useState<PhotoExchange[]>([]);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  const [photoTimer, setPhotoTimer] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    localStorage.setItem('unsereLiebeState', JSON.stringify(state));
  }, [state]);

  // Automatic Check-in Generation Logic
  useEffect(() => {
    if (!state.isPaired) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Weekly Check-in (Sunday)
    const dayOfWeek = now.getDay(); // 0 is Sunday
    if (dayOfWeek === 0) {
      const sundayStr = new Date(now.setDate(now.getDate() - dayOfWeek)).toISOString().split('T')[0];
      const existingWeekly = state.checkIns.find(c => c.type === CheckInType.WEEKLY && c.date === sundayStr);
      if (!existingWeekly) {
        const newCheckIn: CheckIn = {
          id: `weekly-${sundayStr}`,
          type: CheckInType.WEEKLY,
          question: "Reflect on this past week: What was your favorite moment together? What felt challenging? How can we support each other better next week?",
          answers: [],
          date: sundayStr,
          periodLabel: `Week of ${new Date(sundayStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        };
        setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
      }
    }

    // Reset now for further checks
    const checkNow = new Date();
    // Monthly Check-in (1st of month)
    if (checkNow.getDate() === 1) {
      const monthStr = `${checkNow.getFullYear()}-${(checkNow.getMonth() + 1).toString().padStart(2, '0')}-01`;
      const existingMonthly = state.checkIns.find(c => c.type === CheckInType.MONTHLY && c.date === monthStr);
      if (!existingMonthly) {
        const newCheckIn: CheckIn = {
          id: `monthly-${monthStr}`,
          type: CheckInType.MONTHLY,
          question: "Looking back at the last month: What was our biggest milestone? What are you most grateful for in our relationship right now?",
          answers: [],
          date: monthStr,
          periodLabel: checkNow.toLocaleString(undefined, { month: 'long', year: 'numeric' })
        };
        setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
      }
    }

    // Annual Check-in (Jan 1st)
    if (checkNow.getDate() === 1 && checkNow.getMonth() === 0) {
      const yearStr = `${checkNow.getFullYear()}-01-01`;
      const existingAnnual = state.checkIns.find(c => c.type === CheckInType.ANNUAL && c.date === yearStr);
      if (!existingAnnual) {
        const newCheckIn: CheckIn = {
          id: `annual-${yearStr}`,
          type: CheckInType.ANNUAL,
          question: "A whole year has passed: How have we grown as a couple? What is your dream for us in the coming year?",
          answers: [],
          date: yearStr,
          periodLabel: `Year ${checkNow.getFullYear()}`
        };
        setState(prev => ({ ...prev, checkIns: [newCheckIn, ...prev.checkIns] }));
      }
    }
  }, [state.isPaired, state.checkIns.length]);

  // Recipient logic: Trigger shower once when they see a pending kiss for them
  useEffect(() => {
    if (state.pendingKissFor === state.currentUser) {
      setShowerEvent({ id: Date.now() });
      const timer = setTimeout(() => setShowerEvent(null), 5000);
      // Consume the kiss immediately to prevent multiple triggers
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
    } else if (state.isPaired && state.visitInfo) {
      const visitDate = new Date(state.visitInfo.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (visitDate < today) {
        setIsSetupOpen(true);
      }
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

  const skipPrompt = async () => {
    if (!activeUnsavedPrompt) return;
    setIsGenerating(true);
    try {
      const newQuestion = await generateQuestion(activeUnsavedPrompt.category);
      setActiveUnsavedPrompt({ ...activeUnsavedPrompt, question: newQuestion });
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
    
    // Trigger shower for sender immediately
    setShowerEvent({ id: Date.now() });
    setTimeout(() => setShowerEvent(null), 5000);

    // Set pending kiss for partner to see when they switch/open
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
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const data = canvasRef.current.toDataURL('image/png');
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

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
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

  const getPhotoStatusText = () => {
    const unreadCount = state.photoExchanges.filter(ex => ex.senderId !== state.currentUser && ex.status === PhotoStatus.DELIVERED).length;
    if (unreadCount > 0) return `${unreadCount} New Photo${unreadCount > 1 ? 's' : ''}`;
    const lastEx = [...state.photoExchanges].reverse().find(ex => ex.senderId === state.currentUser);
    if (!lastEx) return "Take a photo";
    if (lastEx.status === PhotoStatus.DELIVERED) return "Delivered";
    if (lastEx.status === PhotoStatus.OPENED) return "Opened";
    return "Delivered";
  };

  const submitAnswer = () => {
    if ((!activeUnsavedPrompt && !viewingPromptId && !viewingCheckInId) || !currentAnswer.trim()) return;
    
    setState(prev => {
      // Handle Check-ins
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

      // Handle Regular Prompts
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
      
      // Streak logic only for regular daily prompts
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

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const calendarDays = useMemo(() => {
    const year = calDate.getFullYear(); const month = calDate.getMonth();
    const count = daysInMonth(year, month); const startDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= count; i++) days.push(new Date(year, month, i));
    return days;
  }, [calDate]);

  const changeMonth = (offset: number) => {
    const newDate = new Date(calDate); newDate.setMonth(calDate.getMonth() + offset); setCalDate(newDate);
  };

  const unreadPhotosCount = state.photoExchanges.filter(ex => ex.senderId !== state.currentUser && ex.status === PhotoStatus.DELIVERED).length;

  if (!state.isPaired) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
        {showerEvent && <EmojiShower eventId={showerEvent.id} />}
        <div className="w-full max-w-sm space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-rose-300">
              unsere Liebe
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-black">Find your partner</p>
          </div>

          <div className="bg-[#171717] p-8 rounded-[2.5rem] border border-[#262626] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] -mr-16 -mt-16 rounded-full group-hover:bg-indigo-500/10 transition-all"></div>
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
                maxLength={6}
                className="w-full bg-[#171717] p-6 rounded-2xl border border-[#262626] text-center text-2xl font-black tracking-[0.5em] text-white focus:border-indigo-500/50 outline-none transition-all"
              />
            </div>
            <button 
              onClick={handlePairing}
              disabled={pairingInput.length < 6}
              className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-lg active:scale-95 transition-all disabled:opacity-20 hover:bg-indigo-500 hover:text-white"
            >
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
      >
        {(viewingPrompt || viewingCheckIn) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#171717] w-full max-w-sm rounded-[2rem] p-6 border border-[#262626] shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-6">
              <div className="absolute top-0 right-0 w-48 h-48 blur-[80px] rounded-full opacity-10 -mr-24 -mt-24 transition-colors" style={{ backgroundColor: viewingCheckIn ? '#f59e0b' : CATEGORY_COLORS[(viewingPrompt as Prompt).category] }}></div>
              <div className="absolute top-0 left-0 w-1 h-16 rounded-full ml-4 mt-4" style={{ backgroundColor: viewingCheckIn ? '#f59e0b' : CATEGORY_COLORS[(viewingPrompt as Prompt).category] }}></div>
              <div className="flex items-center justify-between mb-6 relative z-10">
                <span className="text-[8px] uppercase font-black tracking-[0.2em] px-3 py-1.5 rounded-lg border border-[#262626] shadow-sm bg-[#0a0a0a]" style={{ color: viewingCheckIn ? '#f59e0b' : CATEGORY_COLORS[(viewingPrompt as Prompt).category] }}>
                  {viewingCheckIn ? viewingCheckIn.type : (viewingPrompt as Prompt).category}
                </span>
                <div className="flex items-center space-x-3">
                  {activeUnsavedPrompt && (
                    <button onClick={skipPrompt} disabled={isGenerating} className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-600 hover:text-white transition-all flex items-center bg-[#0a0a0a] px-3 py-1 rounded-lg border border-[#262626]">
                      {isGenerating ? "..." : "Skip"}
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
                {(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).map(a => (
                  <div key={a.userId} className={`p-4 rounded-xl border border-[#262626] shadow-inner ${a.userId === state.currentUser ? 'bg-[#0a0a0a] border-l-4' : 'bg-[#111] border-l-4'}`} style={{ borderLeftColor: a.userId === UserRole.ME ? '#6366f1' : '#ec4899' }}>
                    <p className="text-[8px] uppercase tracking-[0.1em] font-black text-gray-600 mb-2">{a.userId === state.currentUser ? 'Your Answer' : 'Their Answer'}</p>
                    <p className="text-xs text-gray-300 italic font-medium leading-relaxed">"{a.text}"</p>
                  </div>
                ))}
                {(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).length < 2 && !(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).find(a => a.userId === state.currentUser) && (
                  <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Pour your heart out..." className="w-full h-32 p-5 bg-[#0a0a0a] rounded-xl border border-[#262626] focus:border-indigo-500/30 text-gray-200 text-xs font-medium outline-none transition-all" />
                )}
                {(!(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).find(a => a.userId === state.currentUser) || activeUnsavedPrompt) && (
                  <button onClick={submitAnswer} className="w-full bg-white text-black py-3 rounded-xl font-black hover:bg-indigo-500 hover:text-white transition-all text-[9px] uppercase tracking-[0.3em] active:scale-95">Share Reflection</button>
                )}
                {(viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).length === 1 && (viewingCheckIn ? viewingCheckIn.answers : (viewingPrompt as Prompt).answers).find(a => a.userId === state.currentUser) && (
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-center">
                    <p className="text-[8px] uppercase font-black tracking-widest text-indigo-400">Waiting for their response...</p>
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
            {viewingPhotosList.length > 1 && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-white/70">
                {viewingPhotoIndex + 1} of {viewingPhotosList.length}
              </div>
            )}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 animate-pulse">
              Tap to skip
            </div>
          </div>
        )}

        {isCameraOpen && (
          <div className="fixed inset-0 z-[110] bg-black flex flex-col overflow-hidden">
            <div className="flex-1 relative overflow-hidden flex items-center justify-center rounded-b-[2rem]">
              {capturedPhoto ? (
                <img src={capturedPhoto} className="w-full h-full object-cover" alt="Captured" />
              ) : (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              )}
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute top-6 left-6 pointer-events-auto">
                <button 
                  onClick={() => { stopCamera(); setIsCameraOpen(false); setCapturedPhoto(null); }} 
                  className="p-3 bg-black/30 rounded-full backdrop-blur-md text-white border border-white/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-8 pb-12 flex justify-between items-center bg-black relative">
              {capturedPhoto ? (
                <>
                  <button onClick={retakePhoto} className="flex flex-col items-center space-y-2 text-white/80 hover:text-white transition-colors">
                    <div className="p-3 bg-white/10 rounded-full backdrop-blur-md border border-white/5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Retake</span>
                  </button>
                  <button onClick={sendCapturedPhoto} className="bg-indigo-600 text-white flex items-center space-x-3 px-6 py-3 rounded-full font-black uppercase tracking-[0.2em] text-[9px] shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
                    <span>Send</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="w-full flex justify-center items-center">
                  <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white bg-white/5 active:scale-90 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)]" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-4 px-4 pb-12">
          {activeTab !== 'checkins' && (
            <div className="flex justify-between items-center px-2 mb-4">
              <div className="flex items-center space-x-2 bg-[#171717] px-3 py-1.5 rounded-full border border-indigo-500/10 shadow-[0_0_10px_rgba(79,70,229,0.05)]">
                <span className="text-orange-500 text-[10px] animate-pulse">🔥</span>
                <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">{state.streak} Days</span>
              </div>
              <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest bg-[#171717] px-3 py-1.5 rounded-full border border-[#262626]">
                {state.visitInfo ? `Arrival: ${new Date(state.visitInfo.date).toLocaleDateString()}` : 'Date TBD'}
              </div>
            </div>
          )}

          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <Countdown visitInfo={state.visitInfo} onUpdate={() => setIsSetupOpen(true)} />
                <div className="flex gap-3 h-28">
                  <div 
                    onClick={sendKuss}
                    className="flex-1 p-6 bg-[#171717] rounded-2xl border border-[#262626] flex items-center justify-between cursor-pointer hover:bg-[#1f1f1f] transition-all group overflow-hidden relative shadow-sm"
                  >
                    <div className="absolute inset-0 bg-rose-500/0 group-hover:bg-rose-500/5 transition-colors"></div>
                    <div className="flex flex-col items-center justify-center w-full relative z-10 text-center space-y-2">
                      <span className="text-2xl group-hover:scale-125 transition-transform duration-300 drop-shadow-[0_0_5px_rgba(244,63,94,0.3)]">💋</span>
                      <div className="text-center">
                        <h4 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Send Kuss</h4>
                        <p className="text-[7px] text-gray-600 uppercase tracking-[0.2em] font-medium group-hover:text-rose-400">Love shower</p>
                      </div>
                    </div>
                  </div>

                  <div 
                    onClick={() => unreadPhotosCount > 0 ? openPhotos() : startCamera()}
                    className={`flex-1 p-6 rounded-2xl border flex items-center justify-between cursor-pointer hover:bg-[#1f1f1f] transition-all group overflow-hidden relative shadow-sm
                      ${unreadPhotosCount > 0 ? 'bg-rose-900/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'bg-[#171717] border-[#262626]'}`}
                  >
                    <div className="flex flex-col items-center justify-center w-full relative z-10 text-center space-y-2">
                      <span className="text-2xl group-hover:scale-110 transition-transform">📸</span>
                      <div className="text-center">
                        <h4 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Say Cheese</h4>
                        <p className={`text-[7px] uppercase tracking-[0.2em] font-medium ${unreadPhotosCount > 0 ? 'text-rose-300 font-black animate-pulse' : 'text-gray-600'}`}>
                          {getPhotoStatusText()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!viewingPrompt && (
                <div className="text-center p-6 bg-gradient-to-b from-[#171717] to-[#121212] rounded-[2rem] border border-indigo-500/10 relative overflow-hidden group shadow-xl h-52 flex flex-col justify-center">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px] -mr-16 -mt-16 rounded-full group-hover:bg-indigo-500/10 transition-all duration-700"></div>
                  <div className="text-3xl mb-3 group-hover:scale-110 transition-transform relative z-10">✨</div>
                  <h3 className="text-lg font-black text-white mb-2 relative z-10 tracking-tight">Build a Moment</h3>
                  <p className="text-[8px] text-gray-500 mb-6 max-w-[180px] mx-auto uppercase tracking-[0.2em] leading-normal relative z-10 font-medium">Connect deeply through a shared daily reflection.</p>
                  <button onClick={createDailyPrompt} disabled={isGenerating} className="w-full bg-white text-black py-3 rounded-xl font-black hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50 text-[9px] uppercase tracking-[0.3em] shadow-lg relative z-10 active:scale-95">
                    {isGenerating ? "Consulting Stars..." : "Generate Prompt"}
                  </button>
                </div>
              )}

              <div className="px-2 pt-2">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-700 mb-4 flex items-center">
                  <span className="w-8 h-[1px] bg-indigo-500/20 mr-4"></span> Today's Moments
                </h3>
                <div className="space-y-3">
                  {recentMoments.length > 0 ? recentMoments.map(p => (
                    <div key={p.id} onClick={() => { setViewingPromptId(p.id); setActiveUnsavedPrompt(null); }} className="flex items-center justify-between p-5 bg-[#171717] rounded-xl border border-[#262626] cursor-pointer hover:bg-[#1f1f1f] transition-all group shadow-sm">
                      <div className="flex-1 mr-4 text-left">
                        <div className="flex items-center mb-1.5 space-x-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[p.category] }}></span>
                          <p className="text-[7px] text-gray-500 font-black uppercase tracking-[0.1em]">{p.category}</p>
                        </div>
                        <p className="text-xs font-black text-gray-300 line-clamp-1 group-hover:text-white transition-colors tracking-tight">{p.question}</p>
                      </div>
                      <div className="flex -space-x-2 ml-4">
                        {p.answers.map(a => (
                          <div key={a.userId} className={`w-7 h-7 rounded-full border-2 border-[#171717] flex items-center justify-center text-[8px] text-white font-black shadow-lg ${a.userId === UserRole.ME ? 'bg-indigo-600' : 'bg-rose-600'}`}>
                            {a.userId === UserRole.ME ? 'M' : 'H'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center border border-dashed border-[#1a1a1a] rounded-2xl group hover:border-indigo-500/10 transition-all">
                      <p className="text-[8px] text-gray-700 font-black uppercase tracking-[0.2em] group-hover:text-gray-600">Start today's story</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-4 px-2">
              <h2 className="text-xl font-black tracking-tighter text-white mb-1">Archive</h2>
              <p className="text-[8px] text-gray-600 mb-6 uppercase tracking-[0.3em] font-black">Our shared connection.</p>
              {state.prompts.filter(p => p.answers.length > 0).map(prompt => {
                const myAnswer = prompt.answers.find(a => a.userId === state.currentUser);
                const partnerAnswer = prompt.answers.find(a => a.userId !== state.currentUser);
                const catColor = CATEGORY_COLORS[prompt.category];
                return (
                  <div key={prompt.id} className="bg-[#171717] rounded-[1.5rem] p-5 border border-[#262626] shadow-xl relative overflow-hidden mb-3">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[7px] uppercase font-black tracking-[0.2em] px-2 py-1 rounded-lg border border-[#262626] bg-[#0a0a0a]" style={{ color: catColor, borderColor: `${catColor}30` }}>{prompt.category}</span>
                      <span className="text-[7px] text-gray-700 font-black uppercase tracking-[0.1em]">{new Date(prompt.date).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-sm font-black text-white mb-6 leading-tight tracking-tight">{prompt.question}</h3>
                    <div className="space-y-3">
                      {myAnswer && (
                        <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#262626] border-l-4 shadow-inner" style={{ borderLeftColor: '#4f46e5' }}>
                          <p className="text-[7px] font-black uppercase tracking-[0.1em] text-indigo-500 mb-2">Your Reflection</p>
                          <p className="text-[11px] text-gray-300 leading-relaxed italic font-bold">"{myAnswer.text}"</p>
                        </div>
                      )}
                      {partnerAnswer ? (
                        !myAnswer ? (
                          <div className="bg-[#0a0a0a] rounded-xl p-6 text-center border border-[#262626] border-dashed">
                            <p className="text-[7px] text-gray-600 font-black uppercase tracking-[0.2em] mb-4">Locked Message</p>
                            <button onClick={() => { setViewingPromptId(prompt.id); }} className="bg-white text-black text-[7px] font-black uppercase tracking-[0.2em] px-5 py-2 rounded-lg hover:bg-indigo-500 hover:text-white transition-all shadow-md active:scale-95">Answer to Unlock</button>
                          </div>
                        ) : (
                          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#262626] border-l-4 shadow-inner" style={{ borderLeftColor: '#ec4899' }}>
                            <p className="text-[7px] font-black uppercase tracking-[0.1em] text-rose-500 mb-2">Partner Reflection</p>
                            <p className="text-[11px] text-gray-300 leading-relaxed italic font-bold">"{partnerAnswer.text}"</p>
                          </div>
                        )
                      ) : (
                        <div className="bg-[#0a0a0a]/50 rounded-xl p-5 text-center border border-[#262626] border-dashed">
                          <p className="text-[7px] text-gray-700 font-black uppercase tracking-[0.2em]">Waiting for response...</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'checkins' && (
            <div className="space-y-6 px-2">
              <div>
                <h2 className="text-xl font-black tracking-tighter text-white mb-1">Our Journey</h2>
                <p className="text-[8px] text-gray-600 mb-6 uppercase tracking-[0.3em] font-black">Weekly & Monthly Reflections</p>
              </div>

              {/* Pending Check-ins */}
              <div className="space-y-4">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-500/70 mb-2">Current Milestones</h3>
                {state.checkIns.filter(c => !c.answers.find(a => a.userId === state.currentUser)).length > 0 ? (
                  state.checkIns.filter(c => !c.answers.find(a => a.userId === state.currentUser)).map(checkIn => (
                    <div key={checkIn.id} onClick={() => setViewingCheckInId(checkIn.id)} className="bg-gradient-to-br from-[#1c1c1c] to-[#171717] rounded-[1.5rem] p-6 border border-amber-500/20 shadow-xl cursor-pointer hover:border-amber-500/40 transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] -mr-16 -mt-16 rounded-full group-hover:bg-amber-500/10 transition-all"></div>
                      <div className="flex justify-between items-center mb-4 relative z-10">
                        <span className="text-[7px] uppercase font-black tracking-[0.2em] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {checkIn.type} Check-in
                        </span>
                        <span className="text-[8px] text-amber-400 font-black tracking-widest animate-pulse">AVAILABLE</span>
                      </div>
                      <h4 className="text-lg font-black text-white mb-2 leading-tight tracking-tight relative z-10">{checkIn.periodLabel}</h4>
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.1em] font-medium mb-4 relative z-10">Reflection Time</p>
                      <button className="w-full bg-amber-500 text-black py-2 rounded-xl font-black text-[8px] uppercase tracking-[0.3em] shadow-lg group-hover:bg-amber-400 transition-all active:scale-95">
                        Start Check-in
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center border border-dashed border-[#1a1a1a] rounded-2xl">
                    <p className="text-[8px] text-gray-700 font-black uppercase tracking-[0.2em]">You're all caught up!</p>
                  </div>
                )}
              </div>

              {/* Archive Section */}
              <div className="pt-4 border-t border-[#1a1a1a]">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-700 mb-6">Our History</h3>
                <div className="space-y-4">
                  {state.checkIns.filter(c => c.answers.find(a => a.userId === state.currentUser)).length > 0 ? (
                    state.checkIns.filter(c => c.answers.find(a => a.userId === state.currentUser)).map(checkIn => {
                      const myAns = checkIn.answers.find(a => a.userId === state.currentUser);
                      const partnerAns = checkIn.answers.find(a => a.userId !== state.currentUser);
                      return (
                        <div key={checkIn.id} onClick={() => setViewingCheckInId(checkIn.id)} className="bg-[#171717] rounded-2xl p-5 border border-[#262626] cursor-pointer hover:bg-[#1f1f1f] transition-all group">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[7px] uppercase font-black tracking-[0.1em] text-gray-500">{checkIn.type} • {checkIn.periodLabel}</span>
                            <div className="flex -space-x-1">
                              {checkIn.answers.map(a => (
                                <div key={a.userId} className={`w-4 h-4 rounded-full border border-[#171717] flex items-center justify-center text-[5px] text-white font-black ${a.userId === UserRole.ME ? 'bg-indigo-600' : 'bg-rose-600'}`}>
                                  {a.userId === UserRole.ME ? 'M' : 'H'}
                                </div>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs font-black text-gray-300 group-hover:text-white transition-colors">{checkIn.periodLabel} Reflection</p>
                          {partnerAns && !myAns && (
                            <p className="text-[6px] text-rose-400 font-black uppercase tracking-widest mt-2 animate-pulse">Partner responded!</p>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center opacity-30">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em]">The library of us will grow here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'more' && (
            <div className="pb-12 px-2">
              <h2 className="text-xl font-black tracking-tighter text-white mb-1">Deeper Waters</h2>
              <p className="text-[8px] text-gray-600 mb-8 uppercase tracking-[0.3em] font-black">Explore together.</p>
              <div className="grid grid-cols-2 gap-4">
                {MORE_CATEGORIES.map(category => {
                  const isMusic = category === PromptCategory.MUSIC;
                  const catColor = isMusic ? '#71717a' : CATEGORY_COLORS[category];
                  return (
                    <button key={category} onClick={() => createExtraPrompt(category)} disabled={isGenerating} className="bg-[#171717] p-8 rounded-[1.5rem] border border-[#262626] text-left hover:bg-gradient-to-br hover:from-[#171717] hover:to-[#1a1a2a] hover:border-indigo-500/20 transition-all group disabled:opacity-50 relative overflow-hidden active:scale-95">
                      <div className="text-2xl mb-4 group-hover:scale-110 transition-transform relative z-10 duration-500">{getCategoryIcon(category)}</div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 relative z-10 drop-shadow-sm brightness-110" style={{ color: catColor }}>{category}</p>
                      <div className="w-6 h-1 bg-gray-800 rounded-full group-hover:w-12 transition-all duration-500 relative z-10" style={{ backgroundColor: `${catColor}40` }}></div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {isSetupOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300 overflow-y-auto">
            <div className="bg-[#171717] w-full max-w-sm rounded-[2.5rem] p-8 border border-indigo-500/10 shadow-2xl scale-in-95 animate-in relative overflow-hidden max-h-[85vh] flex flex-col">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[80px] -mr-24 -mt-24 rounded-full"></div>
              <h2 className="text-2xl font-black tracking-tighter text-white mb-1 relative z-10">Our Reunion</h2>
              <p className="text-[8px] text-gray-600 mb-6 uppercase tracking-[0.3em] font-black relative z-10">Set your next coordinates.</p>
              <div className="space-y-6 relative z-10 flex-1 overflow-y-auto pr-1 pb-4">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.3em] text-gray-500 mb-3">Where will you meet?</label>
                  <input value={setupLocation} onChange={(e) => setSetupLocation(e.target.value)} className="w-full bg-[#0a0a0a] p-4 rounded-xl border border-[#262626] focus:border-indigo-500/30 text-white outline-none font-bold text-sm transition-all" placeholder="City or Secret Spot" />
                </div>
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.3em] text-gray-500 mb-3">On what day?</label>
                  <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-[#262626] shadow-inner">
                    <div className="flex justify-between items-center mb-4">
                      <button onClick={() => changeMonth(-1)} className="p-2 bg-[#171717] rounded-lg border border-[#262626] text-gray-600 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      </button>
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white">{calDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                      <button onClick={() => changeMonth(1)} className="p-2 bg-[#171717] rounded-lg border border-[#262626] text-gray-600 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {calendarDays.map((d, i) => {
                        if (!d) return <div key={i}></div>;
                        const dateStr = d.toISOString().split('T')[0];
                        const isSelected = selectedDate === dateStr;
                        return (
                          <button key={i} onClick={() => setSelectedDate(dateStr)} className={`h-8 w-8 rounded-lg flex items-center justify-center text-[9px] font-black transition-all ${isSelected ? 'bg-white text-black shadow-lg scale-110' : 'text-gray-500 hover:bg-gray-800'}`}>{d.getDate()}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button onClick={handleUpdateVisit} disabled={!selectedDate || !setupLocation} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase tracking-[0.3em] text-[9px] shadow-lg active:scale-95 transition-all disabled:opacity-20 hover:bg-indigo-500 hover:text-white">Confirm Arrival</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
};

const getCategoryIcon = (cat: PromptCategory) => {
  switch (cat) {
    case PromptCategory.CONTROVERSY: return "🌶️";
    case PromptCategory.SEXY: return "🌹";
    case PromptCategory.FUNNY: return "😂";
    case PromptCategory.FUTURE: return "🚀";
    case PromptCategory.MUSIC: return "🎵";
    case PromptCategory.FAMILY: return "🏠";
    case PromptCategory.GROWTH: return "🌱";
    case PromptCategory.PAST: return "🕰️";
    case PromptCategory.RELATIONSHIP: return "💍";
    case PromptCategory.MEMORIES: return "🖼️";
    case PromptCategory.STORY: return "📖";
    case PromptCategory.POEM: return "✒️";
    case PromptCategory.DATE_IDEA: return "🎟️";
    default: return "✨";
  }
};

export default App;
