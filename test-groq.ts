import dotenv from 'dotenv'
import Groq from 'groq-sdk'

dotenv.config()

console.log('API Key:', process.env.GROQ_API_KEY ? '✅ Exists' : '❌ Missing')

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

async function test() {
  try {
    console.log('📨 Sending test request to Groq...')
    
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'user',
          content: 'You are a defense attorney. Respond in 1-2 sentences about why the defendant should be acquitted.',
        },
      ],
      max_tokens: 100,
      temperature: 0.5,
    })

    console.log('✅ Success!')
    console.log('Response:', completion.choices[0]?.message?.content)
  } catch (error) {
    console.error('❌ Error:')
    console.error(error)
  }
}

test()
