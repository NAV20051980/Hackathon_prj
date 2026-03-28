import { useEffect, useMemo, useRef, useState } from 'react'
import Spline from '@splinetool/react-spline'
import './index.css'
import { supabase } from './lib/supabase'

type Mode = 'prosecution' | 'defence' | 'demo'
type Role = 'judge' | 'prosecution' | 'defence' | 'evidence'

type CourtTurn = 'prosecution' | 'defence' | 'judge'

type Case = {
  id: 'theft' | 'murder' | 'fraud' | 'assault'
  title: string
  description: string
}

type ChatMsg = {
  id: string
  role: Exclude<Role, 'evidence'>
  text: string
  ts: number
}

type EvidenceMsg = {
  id: string
  role: 'evidence'
  content: string
  fileUrl: string
  fileName: string
  fileType: string
  ts: number
}

type Msg = ChatMsg | EvidenceMsg

const CASES: Case[] = [
  {
    id: 'theft',
    title: 'Theft (CCTV Presence)',
    description:
      'The accused is charged with theft based on CCTV footage showing presence at the scene.',
  },
  {
    id: 'murder',
    title: 'Murder (Circumstantial Evidence)',
    description:
      'The accused is charged with murder based on circumstantial evidence and timeline inconsistencies.',
  },
  {
    id: 'fraud',
    title: 'Fraud (Financial Records)',
    description:
      'A fraud case where financial records indicate unauthorized transfers without consent.',
  },
  {
    id: 'assault',
    title: 'Assault (Witness Testimony)',
    description:
      'A person is accused of assault after a public altercation with multiple witnesses.',
  },
]

// Fallback example responses if backend AI is unavailable
const PROS_EXAMPLES = [
  'The accused was clearly present at the scene.',
  'Evidence strongly suggests involvement.',
  'The timeline and witness accounts align against the accused.',
  'The accused had motive and opportunity consistent with the alleged act.',
]

const DEF_EXAMPLES = [
  'Presence does not prove guilt.',
  'There is no direct evidence linking the accused.',
  'Witness testimony is inconsistent and unreliable.',
  'Reasonable doubt remains given the lack of definitive proof.',
]

const JUDGE_EXAMPLES = [
  'Defence, respond to this argument.',
  'Provide evidence to support your claim.',
  'Argument noted. Continue.',
  'Keep your responses focused on facts and evidence.',
]

function pickExample(pool: string[], avoid?: string) {
  if (pool.length === 0) return ''
  if (pool.length === 1) return pool[0]!
  const filtered = avoid ? pool.filter((x) => x !== avoid) : pool
  const p = filtered.length ? filtered : pool
  return p[Math.floor(Math.random() * p.length)]!
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function roleMeta(role: Role) {
  switch (role) {
    case 'judge':
      return { label: 'Judge', icon: '⚖️', tone: 'judge' as const }
    case 'prosecution':
      return { label: 'Prosecution', icon: '🔥', tone: 'pros' as const }
    case 'defence':
      return { label: 'Defence', icon: '🛡️', tone: 'def' as const }
    case 'evidence':
      return { label: 'Evidence', icon: '📂', tone: 'evidence' as const }
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const RESPONSE_DELAY_MS = 650

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}



async function generateRoleResponse(opts: {
  role: CourtTurn
  caseText: string
  lastArgument: string
  evidence: { description: string; fileType: string }[]
  history?: { role: string; text: string }[]
}): Promise<string> {
  const { role, caseText, lastArgument, evidence, history = [] } = opts

  try {
    const res = await fetch(`${API_BASE}/api/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, caseText, lastArgument, evidence, history }),
    })
    if (!res.ok) {
      throw new Error('Bad response')
    }
    const data = (await res.json()) as { text?: string }
    if (data.text && data.text.trim().length > 0) {
      return data.text.trim()
    }
  } catch {
    // Fallback: use local canned examples, still enforcing 1–2 sentence, role-specific responses
    if (role === 'prosecution') {
      return pickExample(PROS_EXAMPLES)
    }
    if (role === 'defence') {
      return pickExample(DEF_EXAMPLES)
    }
    return pickExample(JUDGE_EXAMPLES)
  }

  // If backend returned an empty payload, still return a usable fallback.
  if (role === 'prosecution') return pickExample(PROS_EXAMPLES)
  if (role === 'defence') return pickExample(DEF_EXAMPLES)
  return pickExample(JUDGE_EXAMPLES)
}

interface VerdictModalProps {
  show: boolean;
  verdict: { winner: string; judgement: string } | null;
  onClose: () => void;
  onNewTrial: () => void;
}

function VerdictModal({ show, verdict, onClose, onNewTrial }: VerdictModalProps) {
  if (!show || !verdict) return null;
  const isPros = verdict.winner.toUpperCase().includes('PROSECUTION');

  return (
    <div className="modalOverlay fade-in" style={{ zIndex: 11000 }}>
      <div className="modalContent scale-in verdictModal">
        <header className="verdictHeader">
          <div className="verdictIcon">⚖️</div>
          <h2 className="verdictTitle">Final Verdict</h2>
        </header>

        <div className="verdictBody">
          <div className="winnerStatus">
            Verdict: <span className={isPros ? 'prosWinner' : 'defWinner'}>
              {verdict.winner} WINS
            </span>
          </div>
          
          <div className="judgementBox">
            <h3>Judge's Reasoning</h3>
            <p>{verdict.judgement}</p>
          </div>
        </div>

        <div className="verdictActions">
          <button className="btn btnGhost" onClick={onClose}>Close</button>
          <button className="btn btnPrimary" onClick={onNewTrial}>Start New Trial</button>
        </div>
      </div>
    </div>
  );
}

interface DisclaimerModalProps {
  showDisclaimer: boolean;
  onAgree: () => void;
}

function DisclaimerModal({ showDisclaimer, onAgree }: DisclaimerModalProps) {
  if (!showDisclaimer) return null;
  return (
    <div className="modalOverlay fade-in">
      <div className="modalContent scale-in">
        <div className="modalHeader">
          ⚖️ LegalLens Disclaimer
        </div>
        <div className="modalBody">
          <p>
            This application is developed strictly for educational and practice purposes. It is designed to simulate legal scenarios and assist users in understanding legal processes in a simplified, experimental environment.
          </p>
          <p>
            The system operates using programmed logic and artificial intelligence, and does not possess human judgment, emotions, ethical reasoning, or real-world contextual understanding. Any responses, arguments, or outputs generated by the application are automated and should not be interpreted as accurate legal opinions or advice.
          </p>
          <p>
            This platform is not a licensed legal service, and nothing within it should be relied upon for making legal decisions or handling real cases. Users are strongly encouraged to consult a qualified legal professional for any actual legal matters.
          </p>
          <p>
            Additionally, the scenarios, case simulations, and outputs may be incomplete, inaccurate, or simplified for learning purposes. The creators of this application do not guarantee the correctness, reliability, or applicability of any information provided.
          </p>
          <p>
            By using this application, you acknowledge that it is a learning tool only, and you agree that the developers are not responsible for any consequences arising from its use beyond its intended educational scope.
          </p>
        </div>
        <button className="btn btnPrimary modalBtn" onClick={onAgree}>
          I Agree
        </button>
      </div>
    </div>
  );
}

interface LoginScreenProps {
  showDisclaimer: boolean;
  isAuthenticated: boolean;
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  authEmail: string;
  setAuthEmail: (email: string) => void;
  authPass: string;
  setAuthPass: (pass: string) => void;
  authName: string;
  setAuthName: (name: string) => void;
  isLoading: boolean;
  warning: string | null;
  onAuth: (e: React.FormEvent) => void;
  onGoogleAuth: () => void;
}

function LoginScreen({
  showDisclaimer,
  isAuthenticated,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPass,
  setAuthPass,
  authName,
  setAuthName,
  isLoading,
  warning,
  onAuth,
  onGoogleAuth
}: LoginScreenProps) {
  if (showDisclaimer || isAuthenticated) return null;
  return (
    <div className="appShell">
      <div className="bgGlow" aria-hidden="true" />
      <main className="container authContainer">
        <div className="card authCard scale-in">
          <header className="authHeader">
            <h2 className="title">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
            <p className="authSub">Justice. Integrity. Results.</p>
          </header>

          <form className="authForm" onSubmit={onAuth}>
            {authMode === 'signup' && (
              <div className="inputGroup">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  className="inputArea"
                  placeholder="Attorney John Doe"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  required={authMode === 'signup'}
                />
              </div>
            )}

            <div className="inputGroup">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="inputArea"
                placeholder="lawyer@firm.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>

            <div className="inputGroup">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="inputArea"
                placeholder="••••••••"
                value={authPass}
                onChange={(e) => setAuthPass(e.target.value)}
                required
              />
            </div>
            
            {warning && (
              <div className={`authWarning ${warning.includes('Check') ? 'success' : 'error'}`}>
                {warning}
              </div>
            )}

            <button className="btn btnPrimary authBtn" type="submit" disabled={isLoading}>
              {isLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <div className="divider"><span>OR</span></div>

          <button className="btn btnGhost googleBtn" onClick={onGoogleAuth} disabled={isLoading}>
            <svg className="googleIcon" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <footer className="authFooter">
            {authMode === 'login' ? (
              <p>New to LegalLens? <button className="textLink" onClick={() => setAuthMode('signup')}>Sign Up</button></p>
            ) : (
              <p>Already have an account? <button className="textLink" onClick={() => setAuthMode('login')}>Sign In</button></p>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'chat'>('landing')
  const [selectedCaseId, setSelectedCaseId] = useState<Case['id']>('theft')
  const selectedCase = useMemo(
    () => CASES.find((c) => c.id === selectedCaseId) ?? CASES[0]!,
    [selectedCaseId],
  )

  const [currentMode, setCurrentMode] = useState<Mode>('demo')
  const [currentTurnRole, setCurrentTurnRole] = useState<CourtTurn>('prosecution')
  const [turnCount, setTurnCount] = useState(0)
  const [messages, setMessages] = useState<Msg[]>([])

  const [draft, setDraft] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [showDisclaimer, setShowDisclaimer] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authName, setAuthName] = useState('')
  const [userProfile, setUserProfile] = useState<any>(null)

  const [verdict, setVerdict] = useState<{ winner: string; judgement: string } | null>(null)
  const [showVerdictModal, setShowVerdictModal] = useState(false)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error) {
        console.warn('Profile fetch error (might not be created yet):', error.message)
      } else {
        setUserProfile(data)
      }
    } catch (err) {
      console.error('Unexpected profile fetch error:', err)
    }
  }

  // Auth Effect: Check current session and listen for changes
  useEffect(() => {
    // 1. Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
    })

    // 2. Listen for auth changes (login, logout, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      if (session) {
        setWarning(null) // Clear any auth errors on success
        if (session.user) {
          fetchProfile(session.user.id)
        }
      } else {
        setUserProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function handleAgree() {
    setShowDisclaimer(false)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)
    setWarning(null)

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPass,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPass,
          options: {
            data: {
              full_name: authName
            }
          }
        })
        if (error) throw error
        setWarning('Check your email for a confirmation link!')
      }
    } catch (err: any) {
      setWarning(err.message || 'Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setIsLoading(true)
    setWarning(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err: any) {
      setWarning(err.message || 'Google authentication failed.')
      setIsLoading(false)
    }
  }

  async function handleLogout() {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
      setScreen('landing')
    } catch (err) {
      console.error('Logout error', err)
    } finally {
      setIsLoading(false)
    }
  }

  const endRef = useRef<HTMLDivElement | null>(null)

  const lastProsRef = useRef<string | undefined>(undefined)
  const lastDefRef = useRef<string | undefined>(undefined)
  const lastJudgeRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, screen])

  function evidenceForPrompt(msgs: Msg[]) {
    return msgs
      .filter((m): m is EvidenceMsg => m.role === 'evidence')
      .map((m) => ({ description: m.content, fileType: m.fileType }))
  }

  function resolveFileUrl(fileUrl: string) {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl
    if (!API_BASE) return fileUrl
    return `${API_BASE}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
  }

  function isImageFileType(fileType: string) {
    return fileType.toLowerCase().startsWith('image/')
  }

  function getInitialTurnForMode(mode: Mode): CourtTurn {
    if (mode === 'defence') return 'defence'
    // Demo mode starts with prosecution step on Next Step.
    return 'prosecution'
  }

  async function resetSession(mode: Mode, caseId?: Case['id']) {
    const resolvedCaseId = caseId ?? selectedCaseId
    const activeCase = CASES.find((c) => c.id === resolvedCaseId) ?? CASES[0]!

    setCurrentMode(mode)
    setCurrentTurnRole(getInitialTurnForMode(mode))
    setTurnCount(0)
    setVerdict(null)
    setShowVerdictModal(false)
    setDraft('')
    setEvidenceOpen(false)
    setEvidenceFile(null)
    setEvidenceDescription('')
    setIsLoading(false)
    setWarning(null)
    lastProsRef.current = undefined
    lastDefRef.current = undefined
    lastJudgeRef.current = undefined

    const first: Msg = {
      id: newId(),
      role: 'judge',
      text: `[Judge] Court is now in session. ${activeCase.title}.`,
      ts: Date.now(),
    }
    setMessages([first])

    await sleep(RESPONSE_DELAY_MS + 250)

    const second: Msg = {
      id: newId(),
      role: 'judge',
      text:
        mode === 'demo'
          ? '[Judge] Press “Next Step” to advance the simulation.'
          : '[Judge] Present your argument clearly. Evidence may be added at any time.',
      ts: Date.now(),
    }
    setMessages((m) => [...m, second])
  }

  function goToChat(mode: Mode) {
    setScreen('chat')
    void resetSession(mode)
  }

  function onCaseChange(nextCaseId: Case['id']) {
    setSelectedCaseId(nextCaseId)
    if (screen === 'chat') {
      // Reset history + turn state immediately when changing case in the chat header.
      void resetSession(currentMode, nextCaseId)
    }
  }

  async function handleDeclareVerdict() {
    setIsLoading(true)
    setWarning(null)
    try {
      const res = await fetch(`${API_BASE}/api/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text })),
          caseText: selectedCase.description,
          evidence: evidenceForPrompt(messages)
        }),
      })
      if (!res.ok) throw new Error('Verdict failed')
      const data = await res.json()
      setVerdict(data)
      setShowVerdictModal(true)
    } catch (err) {
      setWarning('The judge is unable to reach a decision right now. Try another turn.')
    } finally {
      setIsLoading(false)
    }
  }

  function push(role: Role, text: string) {

    if (role === 'evidence') return
    const tag =
      role === 'judge'
        ? '[Judge]'
        : role === 'prosecution'
          ? '[Prosecution]'
          : '[Defence]'

    setMessages((m) => [
      ...m,
      {
        id: newId(),
        role,
        text: `${tag} ${text}`,
        ts: Date.now(),
      },
    ])
  }

  async function maybeJudgeIntervention(nextTurnCount: number, caseText: string) {
    if (nextTurnCount % 3 !== 0) return

    setCurrentTurnRole('judge')
    const last = messages[messages.length - 1]
    const lastArgument = last ? ('text' in last ? last.text : last.content) : caseText
    const judgeText = await generateRoleResponse({
      role: 'judge',
      caseText,
      lastArgument,
      evidence: evidenceForPrompt(messages),
      history: messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text }))
    })
    push('judge', judgeText)
    setCurrentTurnRole('prosecution')
  }

  async function sendInProsecutionMode() {
    const raw = draft
    const text = raw.trim()
    if (!text || isLoading || currentMode !== 'prosecution') return
    if (currentTurnRole !== 'prosecution') return

    setIsLoading(true)
    setWarning(null)
    try {
      if (!text) {
        setWarning('Please provide an argument.')
        return
      }

      push('prosecution', text)
      setDraft('')
      setCurrentTurnRole('defence')

      await sleep(RESPONSE_DELAY_MS)
      const reqHistory = [
        ...messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text })),
        { role: 'prosecution', text: `[Prosecution] ${text}` }
      ]
      const defenceText = await generateRoleResponse({
        role: 'defence',
        caseText: selectedCase.description,
        lastArgument: text,
        evidence: evidenceForPrompt(messages),
        history: reqHistory
      })
      push('defence', defenceText)

      const nextTurnCount = turnCount + 1
      setTurnCount(nextTurnCount)
      await maybeJudgeIntervention(nextTurnCount, selectedCase.description)

      // Hand turn back to the user (prosecution)
      setCurrentTurnRole('prosecution')
    } finally {
      setIsLoading(false)
    }
  }

  async function sendInDefenceMode() {
    const raw = draft
    const text = raw.trim()
    if (!text || isLoading || currentMode !== 'defence') return
    if (currentTurnRole !== 'defence') return

    setIsLoading(true)
    setWarning(null)
    try {
      if (!text) {
        setWarning('Please provide an argument.')
        return
      }

      push('defence', text)
      setDraft('')
      setCurrentTurnRole('prosecution')

      await sleep(RESPONSE_DELAY_MS)
      const reqHistory = [
        ...messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text })),
        { role: 'defence', text: `[Defence] ${text}` }
      ]
      const prosText = await generateRoleResponse({
        role: 'prosecution',
        caseText: selectedCase.description,
        lastArgument: text,
        evidence: evidenceForPrompt(messages),
        history: reqHistory
      })
      push('prosecution', prosText)

      const nextTurnCount = turnCount + 1
      setTurnCount(nextTurnCount)
      await maybeJudgeIntervention(nextTurnCount, selectedCase.description)

      // Hand turn back to the user (defence)
      setCurrentTurnRole('defence')
    } finally {
      setIsLoading(false)
    }
  }

  async function nextStepDemo() {
    if (currentMode !== 'demo' || isLoading) return

    setIsLoading(true)
    setWarning(null)
    try {
      // Demo mode: fully AI-driven sequence, still one role at a time
      const last = messages[messages.length - 1]
      const lastArg = last ? ('text' in last ? last.text : last.content) : selectedCase.description

      const prosText = await generateRoleResponse({
        role: 'prosecution',
        caseText: selectedCase.description,
        lastArgument: lastArg,
        evidence: evidenceForPrompt(messages),
        history: messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text }))
      })
      push('prosecution', prosText)

      await sleep(RESPONSE_DELAY_MS)
      
      const reqHistory = [
        ...messages.map(m => ({ role: m.role, text: m.role === 'evidence' ? m.content : m.text })),
        { role: 'prosecution', text: `[Prosecution] ${prosText}` }
      ]
      const defText = await generateRoleResponse({
        role: 'defence',
        caseText: selectedCase.description,
        lastArgument: prosText,
        evidence: evidenceForPrompt(messages),
        history: reqHistory
      })
      push('defence', defText)

      const nextTurnCount = turnCount + 1
      setTurnCount(nextTurnCount)
      await maybeJudgeIntervention(nextTurnCount, selectedCase.description)
    } finally {
      setIsLoading(false)
    }
  }

  async function onSend() {
    if (currentMode === 'demo' || isLoading) return
    if (currentMode === 'prosecution') {
      await sendInProsecutionMode()
    } else if (currentMode === 'defence') {
      await sendInDefenceMode()
    }
  }

  async function onSubmitEvidence() {
    const description = evidenceDescription.trim()
    if (!evidenceFile || !description || isLoading) return

    setIsLoading(true)
    setWarning(null)
    try {
      const formData = new FormData()
      formData.append('file', evidenceFile)
      formData.append('description', description)

      const res = await fetch(`${API_BASE}/upload-evidence`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = (await res.json()) as {
        fileUrl: string
        description: string
        fileName?: string
        fileType?: string
      }

      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: 'evidence',
          content: data.description ?? description,
          fileUrl: data.fileUrl,
          fileName: data.fileName ?? evidenceFile.name,
          fileType: data.fileType ?? evidenceFile.type ?? 'application/octet-stream',
          ts: Date.now(),
        },
      ])

      setEvidenceFile(null)
      setEvidenceDescription('')
      setEvidenceOpen(false)
    } catch {
      setWarning('Evidence upload failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function onSplineLoad(splineApp: any) {
    // 1. Try hiding them by exact possible names from the screenshot
    const namesToHide = ['light', 'of light', 'Text', 'Words', 'OF', 'LIFE', 'CE', 'SLICE', 'SLICE OF LIFE', 'Text 2', 'Text 3'];
    namesToHide.forEach(name => {
      const obj = splineApp.findObjectByName(name);
      if (obj) obj.visible = false;
    });

    // 2. Try an advanced traversal to find and hide any object that is a Text component
    try {
      // Spline internal scene references
      if (splineApp._scene && splineApp._scene.children) {
        splineApp._scene.traverse((obj: any) => {
          // If the object resembles a text object or has the offending text
          if (obj.name && (obj.name.toLowerCase().includes('text') || obj.name.includes('LIFE') || obj.name.includes('OF'))) {
            obj.visible = false;
          }
        });
      }
    } catch (err) {
      // Ignore traversal errors
    }
  }

  if (screen === 'landing') {
    if (!isAuthenticated && !showDisclaimer) {
      return (
        <div className={`appShell ${showDisclaimer ? 'modalActive' : ''}`}>
          <LoginScreen 
            showDisclaimer={showDisclaimer}
            isAuthenticated={isAuthenticated}
            authMode={authMode}
            setAuthMode={setAuthMode}
            authEmail={authEmail}
            setAuthEmail={setAuthEmail}
            authPass={authPass}
            setAuthPass={setAuthPass}
            authName={authName}
            setAuthName={setAuthName}
            isLoading={isLoading}
            warning={warning}
            onAuth={handleAuth}
            onGoogleAuth={handleGoogleAuth}
          />
        </div>
      );
    }
    return (
      <div className={`appShell ${showDisclaimer ? 'modalActive' : ''}`}>
        <DisclaimerModal 
          showDisclaimer={showDisclaimer}
          onAgree={handleAgree}
        />
        <div className="bgGlow" aria-hidden="true" />
        <div className="splineContainer">
          <Spline 
            scene="https://prod.spline.design/s-TVmb-vnLuVF0qW/scene.splinecode" 
            onLoad={onSplineLoad}
          />
        </div>
        <main className="container landing">
          <header className="heroHeader">
            <div className="homeLogo" aria-hidden="true">
              ⚖️ LegalLens
            </div>
            <h1 className="title">Justice. Integrity. Results.</h1>
            {userProfile?.name && (
              <div className="welcomeUser">
                Welcome back, Counselor <span>{userProfile.name}</span>
                <button className="btnText logoutLink" onClick={handleLogout}>
                  (Sign Out)
                </button>
              </div>
            )}
          </header>

          <section className="card modeCard">
            <div className="sectionTitle">Choose a mode</div>
            <div className="modeButtons">
              <button
                className="btn btnPrimary"
                onClick={() => goToChat('prosecution')}
              >
                Prosecution Mode
              </button>
              <button
                className="btn btnPrimary"
                onClick={() => goToChat('defence')}
              >
                Defence Mode
              </button>
              <button className="btn btnPrimary" onClick={() => goToChat('demo')}>
                Demo Mode
              </button>
            </div>
            <div className="hintRow">
              <span className="hintPill">
                Tip: Demo mode uses “Next Step” only.
              </span>
              <span className="hintPill">
                Case can be changed in-chat (top dropdown).
              </span>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className={`appShell chatShell ${showDisclaimer ? 'modalActive' : ''}`}>
      <DisclaimerModal 
        showDisclaimer={showDisclaimer}
        onAgree={handleAgree}
      />
      
      <VerdictModal 
        show={showVerdictModal}
        verdict={verdict}
        onClose={() => setShowVerdictModal(false)}
        onNewTrial={() => resetSession(currentMode)}
      />

      {/* Cinematic Particles */}
      {[...Array(12)].map((_, i) => (
        <div 
          key={i} 
          className="particle" 
          style={{ 
            left: `${Math.random() * 100}%`, 
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 15}s`,
            animationDuration: `${10 + Math.random() * 10}s`
          }} 
        />
      ))}
      <div className="bgGlow" aria-hidden="true" />
      <div className="container chatLayout">
        <header className="chatHeader">
          <button className="iconBtn" onClick={() => setScreen('landing')}>
            ←
            <span className="srOnly">Back to landing</span>
          </button>

          <div className="headerCenter">
            <label className="srOnly" htmlFor="caseSelect">
              Select case
            </label>
            <select
              id="caseSelect"
              className="caseSelect"
              value={selectedCaseId}
              onChange={(e) => onCaseChange(e.target.value as Case['id'])}
              disabled={isLoading}
            >
              {CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <div className="headerSub">
              Mode: <b>{currentMode}</b> • Turn role: <b>{currentTurnRole}</b> •
              Exchanges: <b>{turnCount}</b>
            </div>
          </div>

          <div className="headerActions">
            {turnCount >= 6 && !verdict && (
              <button 
                className="btn btnPrimary declareBtn pulse-gold" 
                onClick={handleDeclareVerdict}
                disabled={isLoading}
              >
                {isLoading ? 'Judge Analyzing...' : 'Declare Result'}
              </button>
            )}
            <button className="btnSm" onClick={handleLogout}>
              Logout
            </button>
            <button className="btnSm" onClick={() => resetSession(currentMode)}>
              Reset
            </button>
          </div>
        </header>

        <div className="messagesCard">
          <div className="messages" role="log" aria-live="polite">
            <div
              className={`emptyLogo ${messages.length > 2 ? 'hidden' : ''}`}
              aria-hidden="true"
            >
              ⚖️ LegalLens
            </div>
            {messages.map((m) => {
              const meta = roleMeta(m.role)
              return (
                <div key={m.id} className={`msgRow ${meta.tone}`}>
                  <div className="msgMeta">
                    <span className="msgIcon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="msgRole">{meta.label}</span>
                  </div>
                  <div className="bubble">
                    {m.role === 'evidence' ? (
                      <div className="evidenceCard">
                        <div className="evidenceTitle">📂 Evidence Submitted</div>
                        <div className="evidenceDesc">
                          <div className="evidenceDescLabel">Description</div>
                          <div className="evidenceDescText">{m.content}</div>
                        </div>
                        <div className="evidencePreview">
                          {isImageFileType(m.fileType) ? (
                            <img
                              className="evidenceThumb"
                              src={resolveFileUrl(m.fileUrl)}
                              alt={m.fileName}
                              loading="lazy"
                            />
                          ) : (
                            <a
                              className="evidenceFileLink"
                              href={resolveFileUrl(m.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="evidenceFileIcon" aria-hidden="true">
                                📄
                              </span>
                              <span className="evidenceFileName">{m.fileName}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      m.text
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        </div>

        <div className="composerCard">
          <div className="composerTop">
            <button
              className="btnSm"
              onClick={() => setEvidenceOpen((v) => !v)}
              disabled={isLoading}
            >
              Add Evidence
            </button>
            {currentMode === 'demo' && (
              <button
                className="btnSm btnAccent"
                onClick={nextStepDemo}
                disabled={isLoading}
                title="Advance simulation"
              >
                {isLoading ? 'Thinking…' : 'Next Step'}
              </button>
            )}
          </div>

          {warning && <div className="warningText">{warning}</div>}

          {evidenceOpen && (
            <div className="evidenceComposer">
              <input
                className="input"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                disabled={isLoading}
              />
              <textarea
                className="input evidenceTextarea"
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                placeholder="Describe the evidence..."
                disabled={isLoading}
              />
              <button
                className="btnSm"
                onClick={onSubmitEvidence}
                disabled={!evidenceFile || !evidenceDescription.trim() || isLoading}
              >
                Submit Evidence
              </button>
            </div>
          )}

          <div className="composerRow">
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                currentMode === 'demo'
                  ? 'Demo mode: use “Next Step”'
                  : 'Type your argument…'
              }
              disabled={currentMode === 'demo' || isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSend()
              }}
            />
            <button
              className="btn btnPrimary sendBtn"
              onClick={onSend}
              disabled={currentMode === 'demo' || !draft.trim() || isLoading}
            >
              {isLoading ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
