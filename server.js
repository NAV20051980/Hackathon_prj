import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { getAIResponse } from './ai.js'
import { retrieveContext } from './rag.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.send('Server is running')
})

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, 'uploads'))
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`)
  },
})

const upload = multer({ storage })

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.post('/upload-evidence', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  res.json({
    fileUrl: `http://localhost:5000/uploads/${req.file.filename}`,
    description: req.body?.description ?? '',
  })
})

app.post('/chat', async (req, res) => {
  try {
    const { messages = [], role = 'judge', case: caseName = '' } = req.body ?? {}

    const lastMessage = messages[messages.length - 1]?.content || ''
    const ragContext = retrieveContext(lastMessage)

    const evidenceText = messages
      .filter((m) => m.role === 'evidence')
      .map((m) => m.content)
      .join('\n')

    const fullContext = `${ragContext}\n${evidenceText}`.trim()

    const reply = await getAIResponse({
      messages,
      role,
      caseName,
      context: fullContext,
    })

    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Chat failed' })
  }
})

const PORT = Number(process.env.PORT || 5000)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
