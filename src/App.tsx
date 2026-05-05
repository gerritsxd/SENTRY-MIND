import React, { useState, useEffect } from 'react';
import { auth, signInWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { ai, CONSCIENCE_MENTOR_SYSTEM_PROMPT } from './lib/gemini';
import { 
  Shield, 
  History, 
  Zap, 
  Eye, 
  LogOut, 
  Plus, 
  AlertTriangle,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Components ---

function Header({ user }: { user: User | null }) {
  return (
    <header className="flex justify-between items-end border-b-2 border-white pb-4 mb-4">
      <div>
        <h1 className="text-5xl font-black tracking-tighter">SENTRY-MIND</h1>
        <p className="text-xs opacity-70 uppercase tracking-[0.2em]">
          {user ? `System ID: ${user.uid.slice(0,8)}-Alpha | Auth: Google_SECURE` : 'System ID: x8821-Alpha | Auth: UNAUTHENTICATED'}
        </p>
      </div>
      <div className="text-right hidden sm:block">
        <div className="flex items-center gap-4">
          {user && (
            <button onClick={logout} className="text-xs border-2 border-white px-2 py-1 hover:bg-white hover:text-black transition-colors uppercase font-bold flex items-center gap-2">
              <LogOut size={12} /> Logout
            </button>
          )}
          <p className="text-sm border-2 border-white px-2 py-1 font-bold">
            STATUS: {user ? 'MONITORING_CONSCIENCE' : 'IDLE'}
          </p>
        </div>
      </div>
    </header>
  );
}

function ActionsSection({ user, setLastCritique }: { user: User; setLastCritique: (c: string) => void }) {
  const [action, setAction] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userValues, setUserValues] = useState<string[]>([]);

  useEffect(() => {
    // Sync values for prompt
    const docRef = doc(db, 'users', user.uid);
    const unsubValues = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setUserValues(snap.data().values || []);
    });

    const q = query(
      collection(db, 'journal'), 
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubLogs = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubValues();
      unsubLogs();
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action.trim()) return;

    setLoading(true);
    try {
      const prompt = `ACTION: "${action}"\nVALUES: ${JSON.stringify(userValues)}`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { systemInstruction: CONSCIENCE_MENTOR_SYSTEM_PROMPT }
      });
      
      const rawText = response.text || "";
      const critiqueMatch = rawText.match(/<CRITIQUE>([\s\S]*?)<\/CRITIQUE>/);
      const scoreMatch = rawText.match(/<SCORE>([\s\S]*?)<\/SCORE>/);
      
      const critique = critiqueMatch ? critiqueMatch[1].trim() : rawText;
      const score = scoreMatch ? parseInt(scoreMatch[1].trim()) || 50 : 50;

      setLastCritique(critique);

      await addDoc(collection(db, 'journal'), {
        uid: user.uid,
        action: action,
        timestamp: new Date().toISOString(),
        category: 'general',
        critique: critique,
        dissonanceScore: score
      });
      setAction('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="actions-section" className="col-span-12 lg:col-span-6 row-span-4 border-2 border-white p-4 flex flex-col min-h-[400px]">
      <h2 className="text-xl font-bold border-b-2 border-white pb-2 mb-4 uppercase">ACTION_LOG.TXT</h2>
      <div className="flex-grow space-y-3 overflow-y-auto pr-2 custom-scrollbar">
        {logs.map((log) => (
          <div key={log.id} className="border border-white/30 p-2 text-sm flex flex-col sm:flex-row justify-between gap-1">
            <span className="uppercase font-bold">[{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}] {log.action}</span>
            <span className="opacity-60 italic text-[10px]">ENTRY_{log.id.slice(0,4)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <form onSubmit={handleSubmit} className="flex border-2 border-white">
          <input 
            id="action-input"
            type="text" 
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="ENTRY_INPUT: WHAT DID YOU DO?" 
            className="bg-transparent p-2 flex-grow outline-none text-sm uppercase"
            disabled={loading}
          />
          <button 
            id="log-button"
            type="submit"
            className="bg-white text-black px-4 font-bold hover:bg-black hover:text-white transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '...' : 'LOG'}
          </button>
        </form>
      </div>
    </section>
  );
}

function MirrorSection({ user }: { user: User }) {
  const [profile, setProfile] = useState<any>(null);
  const [newValue, setNewValue] = useState('');
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const docRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
      } else {
        setDoc(docRef, { uid: user.uid, values: [] });
      }
    });

    const q = query(collection(db, 'journal'), where('uid', '==', user.uid));
    const unsubLogs = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => doc.data()));
    });

    return () => {
      unsubProfile();
      unsubLogs();
    };
  }, [user]);

  const addValue = async () => {
    if (!newValue.trim()) return;
    const updatedValues = [...(profile?.values || []), newValue.trim()];
    await setDoc(doc(db, 'users', user.uid), { values: updatedValues }, { merge: true });
    setNewValue('');
  };

  // Integrity Gap: Average of dissonance scores from journals
  const scoredLogs = logs.filter(l => l.dissonanceScore !== undefined);
  const averageDissonance = scoredLogs.length > 0
    ? scoredLogs.reduce((acc, curr) => acc + (curr.dissonanceScore || 0), 0) / scoredLogs.length
    : 0;
  
  const integrityGap = Math.round(averageDissonance);

  return (
    <section id="mirror-section" className="col-span-12 lg:col-span-3 row-span-4 border-2 border-white p-4 flex flex-col justify-between min-h-[400px]">
      <div>
        <h2 className="text-xl font-bold border-b-2 border-white pb-2 mb-4 uppercase">THE MIRROR</h2>
        <div id="integrity-gap-display" className="space-y-6">
          <div>
            <p className="text-xs uppercase opacity-60 mb-1">Integrity Alignment</p>
            <div className="text-4xl font-bold">{100 - integrityGap}%</div>
            <div className="h-4 w-full border-2 border-white mt-2 relative overflow-hidden">
              <motion.div 
                className="h-full bg-white" 
                initial={{ width: 0 }}
                animate={{ width: `${100 - integrityGap}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase opacity-60 mb-2">Stated Values</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {profile?.values?.map((v: string) => (
                <span key={v} className="text-[10px] px-1 border border-white uppercase">{v}</span>
              ))}
            </div>
            <div className="flex border border-white">
              <input 
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="bg-transparent text-[10px] p-1 flex-grow outline-none uppercase"
                placeholder="ADD_VALUE"
              />
              <button onClick={addValue} className="bg-white text-black px-2 flex items-center"><Plus size={10}/></button>
            </div>
          </div>
        </div>
      </div>
      <div className={`p-2 text-xs font-bold text-center uppercase tracking-tighter ${integrityGap > 30 ? 'bg-white text-black animate-pulse' : 'border-2 border-white'}`}>
        INTEGRITY GAP: {integrityGap > 30 ? 'CRITICAL' : 'OPTIMAL'}
      </div>
    </section>
  );
}

function MentorSection({ critique }: { critique: string | null }) {
  return (
    <section className="col-span-12 lg:col-span-3 row-span-4 border-2 border-white p-4 bg-white text-black min-h-[400px]">
      <h2 className="text-xl font-black mb-4 uppercase border-b-2 border-black pb-2">MENTOR_FEED</h2>
      {critique ? (
        <div className="text-sm leading-relaxed">
          <p className="font-bold mb-2 uppercase select-all underline decoration-double">LATEST_ANALYSIS:</p>
          <p className="mb-4 font-bold uppercase">{critique}</p>
          <div className="text-[10px] uppercase border-t border-black pt-4 mt-8 opacity-70">
            ENGINE: GEMINI_BRUTAL_v2.1
            <br />STATUS: UNRELENTING
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 opacity-30">
          <Zap size={32} />
          <p className="text-[10px] font-bold mt-2">WAITING_FOR_SINS</p>
        </div>
      )}
    </section>
  );
}

function VaultSection() {
  const issues = [
    { id: '01', title: "GLOBAL COBALT MINING" },
    { id: '02', title: "MICROPLASTIC SATURATION" },
    { id: '03', title: "SAND SCARCITY CRISIS" },
    { id: '04', title: "DEEP SEA MINING PACTS" }
  ];

  return (
    <section id="vault-section" className="col-span-12 row-span-2 border-2 border-white p-4">
      <h2 className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
        <History size={12} /> MEMORY_VAULT // SLOW-BURN_ISSUES
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {issues.map((issue) => (
          <div key={issue.id} className="border border-white p-2 hover:bg-white hover:text-black transition-all cursor-crosshair">
            <p className="text-[10px] opacity-50">{issue.id}</p>
            <p className="text-xs font-bold uppercase">{issue.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tutorial({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      targetId: 'action-input',
      title: 'THE JOURNAL',
      text: 'Be honest. Log an action that felt morally gray today (e.g., "Ordered Amazon for convenience").',
    },
    {
      targetId: 'log-button',
      title: 'THE CONSCIENCE',
      text: "Click this to trigger Sentry-MIND's ethical dissection. Brace yourself for a brutal reality check.",
    },
    {
      targetId: 'integrity-gap-display',
      title: 'THE MIRROR',
      text: 'This is the delta between who you say you are and what you actually do. It never lies.',
    },
    {
      targetId: 'vault-section',
      title: 'NORMALIZATION',
      text: 'Keep track of the issues society is trying to make you forget.',
    }
  ];

  const currentStep = steps[step];
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    }
  }, [step]);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 font-mono">
      {coords && (
        <motion.div 
          className="absolute border-4 border-white pointer-events-none z-[101]"
          initial={false}
          animate={{
            top: coords.top - 8,
            left: coords.left - 8,
            width: coords.width + 16,
            height: coords.height + 16,
          }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        />
      )}
      
      <AnimatePresence mode="wait">
        <motion.div 
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-black border-4 border-white p-6 shadow-[10px_10px_0px_0px_rgba(255,255,255,1)] z-[102]"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-black italic underline decoration-double">{currentStep.title}</h3>
            <span className="text-xs opacity-50 uppercase font-bold tracking-widest">{step + 1} / {steps.length}</span>
          </div>
          <p className="text-sm font-bold uppercase mb-8 leading-relaxed italic">{currentStep.text}</p>
          <div className="flex justify-between gap-4">
            <button onClick={onComplete} className="text-xs border-2 border-white/30 px-3 py-1 hover:border-white uppercase font-bold">Skip Tutorial</button>
            <button onClick={handleNext} className="bg-white text-black px-8 py-2 font-black text-lg hover:bg-black hover:text-white transition-all uppercase border-2 border-white">
              {step === steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCritique, setLastCritique] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const completed = localStorage.getItem(`tutorial_complete_${u.uid}`);
        if (!completed) {
          setShowTutorial(true);
        }
      }
      setLoading(false);
    });
  }, []);

  const completeTutorial = () => {
    if (user) {
      localStorage.setItem(`tutorial_complete_${user.uid}`, 'true');
    }
    setShowTutorial(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center font-mono">
      <div className="text-xl font-bold animate-pulse text-white uppercase tabular-nums">SYNC_SYSTEM_INITIALIZING... [OK]</div>
    </div>
  );

  return (
    <div className="bg-black text-white font-mono min-h-screen flex flex-col p-4 md:p-8 selection:bg-white selection:text-black">
      <Header user={user} />

      {!user ? (
        <main className="flex-grow flex flex-col items-center justify-center p-8 space-y-12">
          <motion.div 
            animate={{ rotate: [0, 90, 180, 270, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <Shield className="w-48 h-48 md:w-64 md:h-64" />
          </motion.div>
          <div className="text-center space-y-4">
            <h2 className="text-6xl md:text-8xl font-black tracking-tighter">SENTRY-MIND</h2>
            <p className="text-sm md:text-xl opacity-60 uppercase tracking-widest italic">Weaponized Ethics for the Digital Nomad.</p>
          </div>
          <button onClick={signInWithGoogle} className="text-3xl font-black border-4 border-white px-8 py-4 hover:bg-white hover:text-black transition-all uppercase">
            INITIALIZE_CREDENTIALS
          </button>
          <div className="max-w-md text-[10px] opacity-40 uppercase leading-relaxed text-center">
            WARNING: By entering, you consent to an uncompromising audit of your cognitive dissonance. Identity spoofing is handled via Firebase Secure Auth.
          </div>
        </main>
      ) : (
        <main className="grid grid-cols-12 gap-4 flex-grow">
          <MirrorSection user={user} />
          <ActionsSection user={user} setLastCritique={setLastCritique} />
          <MentorSection critique={lastCritique} />
          <VaultSection />
        </main>
      )}

      {showTutorial && user && <Tutorial onComplete={completeTutorial} />}

      <footer className="mt-8 flex flex-col md:flex-row justify-between text-[10px] uppercase tracking-widest opacity-40 border-t border-white pt-4">
        <span>FIREBASE_CONNECTION: {user ? 'ACTIVE' : 'IDLE'} [DB: FIRESTORE]</span>
        <span>© 2026 SENTRY-MIND CORP // ALL SINS LOGGED // BUILD_v8.1</span>
      </footer>
    </div>
  );
}

