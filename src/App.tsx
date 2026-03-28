import { useEffect, useMemo, useRef, useState } from 'react'
import Spline from '@splinetool/react-spline'
import './index.css'

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
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('legal_consent_given')
    if (!consent) {
      setShowDisclaimer(true)
    }
  }, [])

  function handleAgree() {
    localStorage.setItem('legal_consent_given', 'true')
    setShowDisclaimer(false)
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
      if (!res.ok) throw new Error('Upload failed')

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

  function DisclaimerModal() {
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
          <button className="btn btnPrimary modalBtn" onClick={handleAgree}>
            I Agree
          </button>
        </div>
      </div>
    );
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
    return (
      <div className={`appShell ${showDisclaimer ? 'modalActive' : ''}`}>
        <DisclaimerModal />
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
      <DisclaimerModal />
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

          <button className="btnSm" onClick={() => resetSession(currentMode)}>
            Reset
          </button>
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
