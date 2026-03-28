const express = require("express");
const cors = require("cors");
require("dotenv").config();

const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// ✅ CHECK API KEY
console.log("GROQ KEY EXISTS:", !!process.env.GROQ_API_KEY);

// ✅ INIT GROQ
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ✅ WORKING AI FUNCTION
async function generateResponse(role) {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: `You are a ${role} in a courtroom. Respond in 2 lines.`
        }
      ]
    });

    console.log("RAW RESPONSE:", completion);

    const reply = completion?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("Empty reply:", completion);
      return "Error: Empty AI response";
    }

    return reply.trim();

  } catch (error) {
    console.error("GROQ ERROR:", error);
    return "Error: AI failed to respond";
  }
}

// ✅ TEST ROUTE (VERY IMPORTANT)
app.get("/test", async (req, res) => {
  const reply = await generateResponse("defence");

  res.json({
    reply
  });
});

// ✅ MAIN ENDPOINT (SIMPLIFIED)
app.post("/generate", async (req, res) => {
  const reply = await generateResponse("defence");

  res.json({
    replies: [
      { role: "defence", text: reply }
    ]
  });
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});