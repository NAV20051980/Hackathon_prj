export async function getAIResponse({ messages, role, caseName, context }) {
  try {
    // Determine AI role (opposite side)
    let aiRole = "prosecutor";
    if (role === "prosecutor") aiRole = "defence";
    else if (role === "defence") aiRole = "prosecutor";

    const systemPrompt =
      aiRole === "defence"
        ? `You are a criminal defense lawyer.

Give a concise courtroom argument defending the accused.
- 3 to 4 sentences only
- Create doubt, highlight lack of evidence
- Use phrases like "Your Honor", "The defense asserts"`
        : `You are a public prosecutor.

Give a concise courtroom argument proving guilt.
- 3 to 4 sentences only
- Be confident and logical
- Use phrases like "Your Honor", "The prosecution establishes"`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192", // free + fast
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${context}\n${messages.at(-1)?.content || ""}` }
        ],
        max_tokens: 150,
        temperature: 0.6,
      }),
    });

    const data = await response.json();

    console.log("AI RAW RESPONSE:", data); // DEBUG

    if (!data.choices || !data.choices.length) {
      return "AI failed to respond.";
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error("AI ERROR:", error);
    return "AI error occurred.";
  }
}