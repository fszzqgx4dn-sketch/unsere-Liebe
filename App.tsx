
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  addDoc,
  serverTimestamp,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth, loginAnonymously, storage } from './firebase';
import { AppState, UserRole, Prompt, PromptCategory, VisitInfo, Answer, PhotoExchange, PhotoStatus, CheckIn, CheckInType } from './types';
import Layout from './components/Layout';
import Countdown from './components/Countdown';
import { generateQuestion } from './services/geminiService';
import { DAILY_CATEGORIES, MORE_CATEGORIES, CATEGORY_COLORS } from './constants';

const EmojiShower = React.memo(({ eventId }: { eventId: string }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 2,
      size: 1 + Math.random() * 2,
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
            filter: 'drop-shadow(0 0 15px rgba(244,63,94,0.7))'
          }}>{p.emoji}</span>
      ))}
    </div>
  );
});

const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [localPairing, setLocalPairing] = useState(() => {
    const saved = localStorage.getItem('unsereLiebePairing_v6');
    if (saved) return JSON.parse(saved);
    return {
      myCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      partnerCode: null,
      isPaired: false
    };
  });

  const [sharedState, setSharedState] = useState<{
    visitInfo: VisitInfo | null;
    prompts: Prompt[];
    activePhotos: PhotoExchange[];
  }>({
    visitInfo: null,
    prompts: [],
    activePhotos: [],
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'more' | 'responses' | 'checkins'>('daily');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [pairingInput, setPairingInput] = useState('');
  const [lastKussId, setLastKussId] = useState<string | null>(null);
  const [showerEvent, setShowerEvent] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Fix: Added missing state for viewing prompts
  const [viewingPromptId, setViewingPromptId] = useState<string | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<PhotoExchange | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  
  const conversationId = useMemo(() => {
    if (!localPairing.isPaired || !localPairing.partnerCode) return null;
    return [localPairing.myCode, localPairing.partnerCode].sort().join('-');
  }, [localPairing.isPaired, localPairing.myCode, localPairing.partnerCode]);

  // Auth & Initialization
  useEffect(() => {
    loginAnonymously();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
    });
    return unsub;
  }, []);

  // Real-time Listeners
  useEffect(() => {
    if (!conversationId || !userId) return;

    // 1. Base Conversation Listener (Visit Info)
    const unsubConv = onSnapshot(doc(db, "conversations", conversationId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSharedState(prev => ({ ...prev, visitInfo: data.visitInfo || null }));
      }
    });

    // 2. Kisses Listener (Detect new events)
    const qKisses = query(
      collection(db, "conversations", conversationId, "kisses"),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const unsubKisses = onSnapshot(qKisses, (snap) => {
      if (!snap.empty) {
        const kuss = snap.docs[0];
        const data = kuss.data();
        // Trigger shower if it's new and not from us
        if (data.from !== userId && kuss.id !== lastKussId) {
          setLastKussId(kuss.id);
          setShowerEvent(kuss.id);
          setTimeout(() => setShowerEvent(null), 4000);
        }
      }
    });

    // 3. Prompts Listener
    const qPrompts = query(
      collection(db, "conversations", conversationId, "prompts"),
      orderBy("lastUpdated", "desc")
    );
    const unsubPrompts = onSnapshot(qPrompts, (snap) => {
      const pArr: Prompt[] = [];
      snap.forEach(d => pArr.push({ id: d.id, ...d.data() } as Prompt));
      setSharedState(prev => ({ ...prev, prompts: pArr }));
    });

    // 4. Photos Listener (Only active/unexpired)
    const qPhotos = query(
      collection(db, "conversations", conversationId, "photos"),
      where("expiresAt", ">", Timestamp.now()),
      orderBy("expiresAt", "desc")
    );
    const unsubPhotos = onSnapshot(qPhotos, (snap) => {
      const phArr: PhotoExchange[] = [];
      snap.forEach(d => phArr.push({ id: d.id, ...d.data() } as PhotoExchange));
      setSharedState(prev => ({ ...prev, activePhotos: phArr }));
    });

    return () => {
      unsubConv();
      unsubKisses();
      unsubPrompts();
      unsubPhotos();
    };
  }, [conversationId, userId, lastKussId]);

  useEffect(() => {
    localStorage.setItem('unsereLiebePairing_v6', JSON.stringify(localPairing));
  }, [localPairing]);

  // Actions
  const handleSendKiss = async () => {
    if (!conversationId || !userId) return;
    setShowerEvent(`local-${Date.now()}`);
    setTimeout(() => setShowerEvent(null), 4000);
    await addDoc(collection(db, "conversations", conversationId, "kisses"), {
      from: userId,
      timestamp: serverTimestamp()
    });
  };

  const submitAnswer = async (promptId: string) => {
    if (!conversationId || !userId || !currentAnswer.trim()) return;
    setIsSyncing(true);
    const prompt = sharedState.prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const answer: Answer = {
      userId,
      text: currentAnswer,
      timestamp: Date.now()
    };

    const promptRef = doc(db, "conversations", conversationId, "prompts", promptId);
    await updateDoc(promptRef, {
      [`answers.${userId}`]: answer,
      lastUpdated: Date.now()
    });

    setCurrentAnswer('');
    setIsSyncing(false);
  };

  const handleCreatePrompt = async () => {
    if (!conversationId) return;
    setIsGenerating(true);
    const category = DAILY_CATEGORIES[Math.floor(Math.random() * DAILY_CATEGORIES.length)];
    const question = await generateQuestion(category);
    const id = Math.random().toString(36).substring(2, 9);
    
    await setDoc(doc(db, "conversations", conversationId, "prompts", id), {
      category,
      question,
      answers: {},
      date: new Date().toISOString().split('T')[0],
      isDaily: true,
      lastUpdated: Date.now()
    });
    setIsGenerating(false);
  };

  const handleSendPhoto = async () => {
    if (!conversationId || !userId || !capturedPhoto) return;
    setIsSyncing(true);
    try {
      // 1. Upload to Storage
      const photoName = `photo-${Date.now()}.jpg`;
      const storageRef = ref(storage, `conversations/${conversationId}/${photoName}`);
      await uploadString(storageRef, capturedPhoto, 'data_url');
      const url = await getDownloadURL(storageRef);

      // 2. Register in Firestore with expiry (10 mins)
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 10);

      await addDoc(collection(db, "conversations", conversationId, "photos"), {
        senderId: userId,
        data: url,
        timestamp: Date.now(),
        expiresAt: Timestamp.fromDate(expiry),
        status: PhotoStatus.DELIVERED
      });

      setIsCameraOpen(false);
      setCapturedPhoto(null);
    } catch (e) {
      console.error("Photo failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const takePhoto = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.8));
    }
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isCameraOpen && !capturedPhoto) {
      const start = async () => {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      };
      start();
    }
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [isCameraOpen, capturedPhoto]);

  // UI rendering logic remains consistent with "Midnight Neon" theme
  if (!localPairing.isPaired) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center">
        {showerEvent && <EmojiShower eventId={showerEvent} />}
        <div className="w-full max-sm space-y-12 animate-in fade-in duration-1000">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-rose-300 drop-shadow-[0_0_20px_rgba(129,140,248,0.4)]">unsere Liebe</h1>
          <div className="bg-[#111] p-10 rounded-[3rem] border border-white/5 shadow-2xl">
            <p className="text-[10px] text-zinc-500 font-black uppercase mb-4 tracking-widest">Your Code</p>
            <div className="text-5xl font-black text-white tracking-widest">{localPairing.myCode}</div>
          </div>
          <div className="space-y-6 max-w-xs mx-auto">
            <input value={pairingInput} onChange={(e) => setPairingInput(e.target.value.toUpperCase())} placeholder="PARTNER CODE" className="w-full bg-[#111] p-6 rounded-3xl border border-white/5 text-center text-2xl font-black text-white outline-none focus:border-indigo-500/30" />
            <button onClick={() => setLocalPairing(p => ({ ...p, isPaired: true, partnerCode: pairingInput }))} className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase text-[11px] hover:bg-indigo-500 hover:text-white transition-all">Link Hearts</button>
          </div>
        </div>
      </div>
    );
  }

  const viewingPromptData = sharedState.prompts.find(p => p.id === (viewingPromptId || ''));

  return (
    <>
      {showerEvent && <EmojiShower eventId={showerEvent} />}
      <Layout 
        activeTab={activeTab} setActiveTab={setActiveTab} 
        currentUser={UserRole.ME} onSwitchUser={() => {}}
        unansweredCount={sharedState.prompts.filter(p => p.answers && !p.answers[userId!] && Object.keys(p.answers).length > 0).length}
        checkInNotificationCount={0}
        devMode={false}
        isSyncing={isSyncing}
      >
        {/* Detail Modal */}
        {viewingPromptData && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-[#121212] w-full max-sm rounded-[2.5rem] p-8 border border-white/10 shadow-3xl animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center mb-8">
                <span className="text-[9px] uppercase font-black px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400">Heart To Heart</span>
                <button onClick={() => setViewingPromptId(null)} className="text-zinc-500 hover:text-white transition-colors p-2"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <h2 className="text-2xl font-black text-white mb-8 leading-tight">{viewingPromptData.question}</h2>
              <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {Object.values(viewingPromptData.answers || {}).map((a: any) => {
                  const isMe = a.userId === userId;
                  const canSee = isMe || (viewingPromptData.answers && viewingPromptData.answers[userId!]);
                  return (
                    <div key={a.userId} className={`p-6 rounded-3xl border ${isMe ? 'bg-indigo-500/5 border-indigo-500/10' : 'bg-rose-500/5 border-rose-500/10'} border-l-4`} style={{ borderLeftColor: isMe ? '#818cf8' : '#fb7185' }}>
                      <p className="text-[9px] uppercase font-black mb-3" style={{ color: isMe ? '#818cf8' : '#fb7185' }}>{isMe ? 'You' : 'Partner'}</p>
                      {canSee ? <p className="text-sm text-zinc-300 italic">"{a.text}"</p> : <div className="h-4 w-3/4 bg-zinc-800 rounded-full animate-pulse" />}
                    </div>
                  );
                })}
                {(!viewingPromptData.answers || !viewingPromptData.answers[userId!]) && (
                  <div className="space-y-4 pt-4">
                    <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Type your reflection..." className="w-full h-32 p-6 bg-black/40 rounded-[2rem] border border-white/5 text-white text-sm outline-none focus:border-indigo-500/40" />
                    <button onClick={() => submitAnswer(viewingPromptData.id)} className="w-full bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl active:scale-95">Send To Partner</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-6 px-5 pb-16">
          {activeTab === 'daily' && (
            <div className="space-y-6">
              <Countdown visitInfo={sharedState.visitInfo} onUpdate={() => setIsSetupOpen(true)} />
              <div className="grid grid-cols-2 gap-4 h-32">
                <div onClick={handleSendKiss} className="bg-[#121212] rounded-[2rem] border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all shadow-lg active:scale-95">
                  <span className="text-3xl drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]">💋</span>
                  <h4 className="text-[9px] font-black text-zinc-500 uppercase mt-3">Send Kuss</h4>
                </div>
                <div onClick={() => setIsCameraOpen(true)} className={`rounded-[2rem] border flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 shadow-lg ${sharedState.activePhotos.some(p => p.senderId !== userId) ? 'bg-rose-500/10 border-rose-500/30 animate-pulse' : 'bg-[#121212] border-white/5'}`}>
                  <span className="text-3xl drop-shadow-[0_0_15px_rgba(129,140,248,0.4)]">📸</span>
                  <h4 className="text-[9px] font-black text-zinc-500 uppercase mt-3">Snap</h4>
                </div>
              </div>

              <div className="text-center p-8 bg-gradient-to-br from-[#121212] to-[#0a0a0a] rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                <h3 className="text-xl font-black text-white mb-3">Today's Spark</h3>
                <button onClick={handleCreatePrompt} disabled={isGenerating} className="w-full bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50">
                  {isGenerating ? 'Summoning AI...' : 'Spark Conversation'}
                </button>
              </div>

              <div className="space-y-4">
                {sharedState.prompts.filter(p => p.date === new Date().toISOString().split('T')[0]).map(p => (
                  <div key={p.id} onClick={() => setViewingPromptId(p.id)} className="flex items-center justify-between p-6 bg-[#121212] rounded-[2rem] border border-white/5 cursor-pointer hover:border-white/20 transition-all shadow-lg">
                    <div className="flex-1 mr-4">
                      <p className="text-[8px] font-black uppercase mb-2 tracking-widest" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</p>
                      <p className="text-sm font-bold text-zinc-200 line-clamp-1">{p.question}</p>
                    </div>
                    <div className="flex -space-x-3">
                      {Object.keys(p.answers || {}).map(uid => <div key={uid} className={`w-8 h-8 rounded-full border-[3px] border-[#121212] flex items-center justify-center text-[10px] font-black ${uid === userId ? 'bg-indigo-600' : 'bg-rose-500'}`}>{uid === userId ? 'M' : 'P'}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'responses' && (
            <div className="space-y-6 px-1">
              <h2 className="text-2xl font-black tracking-tight text-white mb-8 border-l-4 border-indigo-500 pl-4">Memory Bank</h2>
              {sharedState.prompts.filter(p => p.answers && Object.keys(p.answers).length > 0).map(p => (
                <div key={p.id} onClick={() => setViewingPromptId(p.id)} className="bg-[#121212] rounded-[2rem] p-6 border border-white/5 cursor-pointer hover:border-white/20 transition-all shadow-md">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[8px] uppercase font-black px-3 py-1 rounded-full bg-black/40" style={{ color: CATEGORY_COLORS[p.category] }}>{p.category}</span>
                    <span className="text-[8px] text-zinc-600 uppercase font-black">{new Date(p.lastUpdated).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-md font-bold text-zinc-200">{p.question}</h3>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'more' && (
            <div className="px-1 space-y-10">
              <h2 className="text-2xl font-black tracking-tight text-white mb-8 border-l-4 border-rose-500 pl-4">Deep Explore</h2>
              <div className="grid grid-cols-2 gap-4">
                {MORE_CATEGORIES.map(category => (
                  <button key={category} onClick={async () => { 
                    setIsGenerating(true); 
                    const q = await generateQuestion(category); 
                    const id = Math.random().toString(36).substring(2, 9);
                    await setDoc(doc(db, "conversations", conversationId!, "prompts", id), { category, question: q, answers: {}, date: new Date().toISOString().split('T')[0], isDaily: false, lastUpdated: Date.now() });
                    setViewingPromptId(id);
                    setIsGenerating(false); 
                  }} className="bg-[#121212] p-8 rounded-[2.5rem] border border-white/5 text-left hover:bg-white/5 active:scale-95 transition-all shadow-md group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-3 h-3 rounded-full m-4 blur-[4px]" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                    <p className="text-[11px] font-black uppercase tracking-tight mb-2" style={{ color: CATEGORY_COLORS[category] }}>{category}</p>
                    <p className="text-[8px] text-zinc-700 uppercase font-black">AI Insight</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sync Settings */}
        {isSetupOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in">
            <div className="bg-[#121212] w-full max-sm rounded-[3rem] p-10 border border-white/5 flex flex-col shadow-3xl">
              <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-white">Settings</h2><button onClick={() => setIsSetupOpen(false)} className="text-zinc-500 p-2"><svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
              <div className="space-y-8">
                <div><label className="text-[10px] font-black text-zinc-600 uppercase">Reunion Spot</label><input value={sharedState.visitInfo?.location || ''} onChange={(e) => updateDoc(doc(db, "conversations", conversationId!), { "visitInfo.location": e.target.value })} className="w-full bg-black/40 p-5 rounded-2xl border border-white/5 text-white mt-3 outline-none" /></div>
                <div><label className="text-[10px] font-black text-zinc-600 uppercase">Meetup Date</label><input type="date" value={sharedState.visitInfo?.date || ''} onChange={(e) => updateDoc(doc(db, "conversations", conversationId!), { "visitInfo.date": e.target.value, "visitInfo.lastUpdated": Date.now() })} className="w-full bg-black/40 p-5 rounded-2xl border border-white/5 text-white mt-3 outline-none" /></div>
                <button onClick={() => setIsSetupOpen(false)} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95">Done</button>
                <div className="pt-8 border-t border-white/5"><button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full bg-rose-500/10 text-rose-400 py-4 rounded-2xl border border-rose-500/20 font-black uppercase text-[9px]">Unlink Device</button></div>
              </div>
            </div>
          </div>
        )}

        {/* Camera flow */}
        {isCameraOpen && (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in slide-in-from-bottom-20 duration-500">
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {capturedPhoto ? <img src={capturedPhoto} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
            </div>
            <div className="p-12 flex justify-center items-center space-x-10 bg-black pb-24">
              {capturedPhoto ? (
                <><button onClick={() => setCapturedPhoto(null)} className="bg-white/10 text-white px-10 py-5 rounded-full font-black text-[11px] uppercase border border-white/5">Retake</button><button onClick={handleSendPhoto} className="bg-indigo-600 text-white px-12 py-5 rounded-full font-black text-[11px] uppercase shadow-xl active:scale-95 transition-all">Send Snap</button></>
              ) : (
                <button onClick={takePhoto} className="w-24 h-24 rounded-full border-[8px] border-white active:scale-90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)]" />
              )}
              <button onClick={() => setIsCameraOpen(false)} className="text-zinc-600 text-[11px] uppercase font-black">Abort</button>
            </div>
          </div>
        )}

        {/* Photo Viewer */}
        {sharedState.activePhotos.length > 0 && sharedState.activePhotos.some(p => p.senderId !== userId) && (
          <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[80] animate-bounce">
            <button onClick={() => setViewingPhoto(sharedState.activePhotos.find(p => p.senderId !== userId)!)} className="bg-rose-500 text-white px-6 py-3 rounded-full font-black text-[10px] uppercase shadow-2xl shadow-rose-500/50">Open Partner Snap</button>
          </div>
        )}

        {viewingPhoto && (
          <div onClick={() => setViewingPhoto(null)} className="fixed inset-0 z-[210] bg-black flex items-center justify-center cursor-pointer animate-in zoom-in">
            <img src={viewingPhoto.data} className="max-w-full max-h-full object-contain" />
            <div className="absolute bottom-16 text-[11px] text-white/40 font-black uppercase tracking-[0.6em] animate-pulse">Tap to close</div>
          </div>
        )}
      </Layout>
    </>
  );
};

export default App;
