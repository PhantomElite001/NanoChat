const express = require('express');
const dotenv = require("dotenv");
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
// Health check
app.get("/", (req, res) => {
  res.json({ status: "NanoChat running 🚀" });
});

// AI endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const response = await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b", // example model — replace with one available on your key
      messages: [
        { role: "user", content: message }
      ],
      temperature: 0.6,
      max_tokens: 2000,
    }),
  }
);

    const data = await response.json();

    res.json({
      reply: data.choices?.[0]?.message?.content || "No response"
    });
    console.log("hf-respons",data);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});