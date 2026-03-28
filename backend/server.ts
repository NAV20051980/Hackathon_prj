import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'

dotenv.config()
console.log('✅ GROQ KEY EXISTS:', !!process.env.GROQ_API_KEY)

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

const app = express()
app.use(cors())
app.use(express.json())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, 'uploads')

type CourtRole = 'prosecution' | 'defence' | 'judge'
type ChatRole = 'prosecutor' | 'defense'

app.use('/uploads', express.static(uploadsDir))

type EvidenceSummary = { description: string; fileType: string }

function formatCaseWithEvidence(caseText: string, evidence: EvidenceSummary[]): string {
  if (evidence.length === 0) return caseText
  const block = evidence
    .flatMap((e) => [
      `* Description: ${String(e.description ?? '').slice(0, 600)}`,
      `  File type: ${String(e.fileType ?? '').slice(0, 120)}`,
    ])
    .join('\n')
  return `${caseText}\n\nEvidence:\n${block}\n\nConsider the following evidence while responding.`
}

type HistoryTurn = { role: string; text: string }

function validationReplyContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  return String(content)
}

async function generateResponse(
  role: string,
  history: { role: string; text: string }[] = [],
  caseString = '',
  input = '',
): Promise<string> {
  if (input) {
    const cleanedInput = input.trim().toLowerCase();
    const invalidInputs = ["hi", "hello", "hey", "ok", "okay", "yo", "hii"];
    if (invalidInputs.includes(cleanedInput) || cleanedInput.length < 5) {
      return "Please provide a meaningful argument related to the case.";
    }
  }

  const fullPrompt = `You are acting as a ${role} in a courtroom.

Case: ${caseString || "Not provided"}

Rules:
- Accept user arguments even if imperfect
- Interpret the intent instead of rejecting
- Ignore casual or irrelevant inputs like greetings
- Focus only on meaningful legal arguments
- If argument is weak, challenge it instead of calling it invalid
- If multiple arguments are present, respond to the most important ones
- NEVER say 'invalid argument' unless completely irrelevant

Latest Input:
${input}

Respond logically in 2-3 lines.`;

  // Create messages array - Groq works best with simple user/assistant pattern
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.map((h) => ({
      role: (h.role === 'assistant' ? 'assistant' : 'user') as const,
      content: h.text,
    })),
    { role: 'user', content: fullPrompt },
  ]

  try {
    console.log(`\n📨 [${role.toUpperCase()}] Generating response...`)
    console.log(`   Input: ${input?.slice(0, 50)}...`)

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: messages,
      max_tokens: 300,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content

    if (!response) {
      console.error(`❌ [${role}] Empty response from Groq`)
      return 'I cannot provide a response at this moment. Please try again.'
    }

    console.log(`✅ [${role}] Response: ${response.slice(0, 80)}...`)
    return response.trim()
  } catch (error) {
    console.error(`\n❌ GROQ ERROR for ${role}:`)
    if (error instanceof Error) {
      console.error(`   ${error.message}`)
      if ('status' in error) console.error(`   Status: ${(error as any).status}`)
      if ('error' in error) console.error(`   Details: ${JSON.stringify((error as any).error)}`)
    } else {
      console.error(error)
    }

    return 'I apologize, but I encountered an error processing your request. Please try again.'
  }
}

async function validateStatementWithLLM(statement: string): Promise<boolean> {
  const prompt = [
    'Check if the following statement is a valid legal argument or relevant to a courtroom case.',
    '',
    `Statement: "${statement}"`,
    '',
    'Respond ONLY with: VALID or INVALID',
  ].join('\n')

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0.3,
    })
    const raw = validationReplyContent(completion?.choices?.[0]?.message?.content)
    const normalized = raw.toUpperCase()
    if (normalized.startsWith('VALID')) return true
    if (normalized.startsWith('INVALID')) return false
  } catch {
    // fall through
  }

  return statement.trim().length >= 10
}

app.post('/api/validate', async (req, res) => {
  const statement = String(req.body?.statement ?? '')
  try {
    const valid = await validateStatementWithLLM(statement)
    res.json({ valid })
  } catch (err) {
    console.error('Validation error', err)
    res.status(500).json({ valid: statement.trim().length >= 10 })
  }
})

app.post('/api/respond', async (req, res) => {
  const role = String(req.body?.role ?? '') as CourtRole
  const caseText = String(req.body?.caseText ?? '')
  const lastArgument = String(req.body?.lastArgument ?? '')
  const evidenceRaw = Array.isArray(req.body?.evidence) ? req.body.evidence : []
  const evidence: EvidenceSummary[] = evidenceRaw
    .map((e: unknown) => {
      const rec = (e ?? {}) as Record<string, unknown>
      return {
        description: String(rec.description ?? ''),
        fileType: String(rec.fileType ?? ''),
      }
    })
    .filter((e) => e.description.trim().length > 0 || e.fileType.trim().length > 0)

  if (!['prosecution', 'defence', 'judge'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const caseString = formatCaseWithEvidence(caseText, evidence)
  const historyRaw = req.body?.history
  const history = normalizeHistoryPayload(historyRaw)

  try {
    const text = await generateResponse(role, history, caseString, lastArgument)
    res.json({ text })
  } catch (err) {
    console.error('LLM error', err)
    res.status(500).json({ error: 'Failed to generate response' })
  }
})

function normalizeHistoryPayload(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const rec = (item ?? {}) as Record<string, unknown>
    return {
      role: String(rec.role ?? ''),
      text: String(rec.text ?? rec.content ?? ''),
    }
  })
}

app.post('/generate', async (req, res) => {
  const body = req.body ?? {}
  const { mode, input: inputRaw, history: historyRaw = [], caseString: caseRaw } = body as {
    mode?: string
    input?: string
    history?: unknown[]
    caseString?: string
  }

  const input = String(inputRaw ?? '')
  const caseString = String(caseRaw ?? '')
  const history = normalizeHistoryPayload(historyRaw)

  try {
    let replies: { role: string; text: string }[] = []

    if (mode === 'prosecution') {
      const updatedHistory = [
        ...history,
        { role: mode === 'prosecution' ? 'prosecution' : 'defence', text: input },
      ]

      const defence = await generateResponse('defence', updatedHistory, caseString, input)
      const judge = await generateResponse('judge', updatedHistory, caseString, input)

      replies = [
        { role: 'defence', text: defence.trim() },
        { role: 'judge', text: judge.trim() },
      ]
    } else if (mode === 'defence') {
      const prosecution = await generateResponse('prosecution', history, caseString, '')

      replies = [{ role: 'prosecution', text: prosecution.trim() }]
    } else if (mode === 'demo') {
      const prosecution = await generateResponse('prosecution', history, caseString, '')
      const defence = await generateResponse('defence', history, caseString, '')
      const judge = await generateResponse('judge', history, caseString, '')

      replies = [
        { role: 'prosecution', text: prosecution.trim() },
        { role: 'defence', text: defence.trim() },
        { role: 'judge', text: judge.trim() },
      ]
    } else {
      return res.status(400).json({ error: 'Invalid mode', replies: [] })
    }

    res.json({ replies })
  } catch (err) {
    console.error('Endpoint ERROR:', err)
    res.status(500).json({ error: 'Server error', replies: [] })
  }
})

app.post('/chat', async (req, res) => {
  const message = String(req.body?.message ?? '').trim()
  const role = String(req.body?.role ?? '') as ChatRole
  const historyRaw = Array.isArray(req.body?.history) ? req.body.history : []
  const history = historyRaw
    .map((item: unknown) => {
      const rec = (item ?? {}) as Record<string, unknown>
      const hRole = String(rec.role ?? 'user').trim() || 'user'
      const hText = String(rec.content ?? '').trim()
      return { role: hRole, content: hText }
    })
    .filter((item) => item.content.length > 0)

  if (!message) return res.status(400).json({ error: 'message is required' })
  if (!['prosecutor', 'defense'].includes(role)) {
    return res.status(400).json({ error: 'role must be prosecutor or defense' })
  }

  const courtRole = role === 'prosecutor' ? 'prosecution' : 'defence'
  const historyPayload = history.map((h) => ({
    role: h.role,
    text: h.content,
  }))

  try {
    const reply = await generateResponse(courtRole, historyPayload, '', message)
    const safe = reply.trim().length > 0 ? reply.trim() : 'Error: AI failed to respond'
    return res.json({ reply: safe })
  } catch (err) {
    console.error('Groq chat error', err)
    return res.json({ reply: 'Error: AI failed to respond' })
  }
})

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true })
      cb(null, uploadsDir)
    } catch (err) {
      cb(err as Error, uploadsDir)
    }
  },
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const ext = path.extname(safeOriginal)
    const base = path.basename(safeOriginal, ext).slice(0, 80) || 'evidence'
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`
    cb(null, `${base}_${unique}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])
    const isImage = file.mimetype.startsWith('image/')
    const ok = isImage || allowedMime.has(file.mimetype)
    if (ok) {
      cb(null, true)
      return
    }
    cb(new Error('Unsupported file type'))
  },
})

app.post('/upload-evidence', upload.single('file'), (req, res) => {
  const description = String(req.body?.description ?? '')
  const file = req.file
  if (!file) return res.status(400).json({ error: 'Missing file' })
  if (!description.trim()) return res.status(400).json({ error: 'Missing description' })

  const fileUrl = `/uploads/${file.filename}`
  res.json({
    fileUrl,
    description,
    fileName: file.originalname,
    fileType: file.mimetype || 'application/octet-stream',
  })
})

app.get('/test-ai', async (_req, res) => {
  try {
    console.log('📩 /test-ai request received')
    const reply = await generateResponse('defence', [], 'Theft case', 'The accused was seen at the scene')
    console.log('📤 Sending response:', reply)
    res.json({ reply, status: 'success' })
  } catch (err) {
    console.error('Test AI error:', err)
    res.status(500).json({ reply: 'Error', status: 'error', error: String(err) })
  }
})

app.get('/debug', async (_req, res) => {
  try {
    console.log('📩 /debug request received')
    const reply = await generateResponse('defence', [], 'Test case', 'Test argument')
    console.log('📤 Sending debug response:', reply)
    res.json({ reply, status: 'success' })
  } catch (err) {
    console.error('Debug error:', err)
    res.status(500).json({ reply: 'Error', status: 'error', error: String(err) })
  }
})

const PORT = process.env.PORT || 3000

try {
  app.listen(PORT, () => {
    console.log(`\n✅ Courtroom Backend Server Running`)
    console.log(`📍 http://localhost:${PORT}`)
    console.log(`🧪 Test: http://localhost:${PORT}/test-ai\n`)
  })
} catch (err) {
  console.error('❌ Failed to start server:', err)
  process.exit(1)
}

