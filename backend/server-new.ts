import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Groq from 'groq-sdk'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

console.log('✅ GROQ KEY LOADED:', !!process.env.GROQ_API_KEY)

// Simple health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', server: 'Courtroom AI Backend' })
})

// Test endpoint
app.get('/test', async (_req, res) => {
  try {
    console.log('🔄 Processing /test request...')
    
    const message = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'user',
          content: 'You are a defense attorney. Respond in 1-2 sentences about why the defendant should be acquitted in a theft case where the only evidence is eyewitness testimony.',
        },
      ],
      max_tokens: 200,
    })

    const reply = message.choices[0]?.message?.content || 'No response'
    console.log('✅ Got response, sending back...')
    res.json({ reply, status: 'success' })
  } catch (error) {
    console.error('❌ Error:', error)
    res.status(500).json({ error: String(error), reply: 'Error occurred' })
  }
})

// Main chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, role } = req.body
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' })
    }

    const rolePrompt = role === 'prosecutor' 
      ? 'You are a prosecutor. Make a compelling legal argument.'
      : 'You are a defense attorney. Make a compelling legal argument.'

    const prompt = `${rolePrompt}\n\nArgument: ${message}`

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
    })

    const reply = response.choices[0]?.message?.content || 'Unable to generate response'
    res.json({ reply })
  } catch (error) {
    console.error('❌ Chat error:', error)
    res.status(500).json({ error: String(error) })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`\n✅ Courtroom Backend Running`)
  console.log(`📍 http://localhost:${PORT}`)
  console.log(`🔗 GET  http://localhost:${PORT}`)
  console.log(`🧪 GET  http://localhost:${PORT}/test`)
  console.log(`💬 POST http://localhost:${PORT}/chat\n`)
})
