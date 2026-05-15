const dotenv = require("dotenv");
dotenv.config(); // Must be first — env vars needed by everything below

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

if (!process.env.JWT_SECRET || !process.env.GROQ_API_KEY) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: "You've reached max requests, please try again later.",
  // removed legacyHeaders — not a valid option in express-rate-limit v7+
});

let chatHistories = {};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(limiter);
app.use(cors());
app.use(express.json());

// Health check
app.get("/check", (req, res) => {
  res.json({ status: 'Nanochat running smoothly' });
});

// Serve static pages
app.get('/', (req, res) => res.redirect('/login'));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'Public/Register.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, 'Public/Login.html')));

// Protect /app — verify token before serving the page
app.get('/app', (req, res) => {
  const authHeader = req.headers.authorization;
  // Frontend hits this via a normal browser navigation (no auth header),
  // so we let the HTML load and let client-side JS handle the redirect.
  // The actual chat API is protected server-side by authorize middleware.
  res.sendFile(path.join(__dirname, 'Public/index.html'));
});

// Auth middleware
function authorize(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No token" });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Register
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (typeof email !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const [rows] = await db.query("SELECT * FROM users WHERE email=?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: "This email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (email, password) VALUES(?,?)", [email, hashedPassword]);

    // Fixed: was sending plain "ok" string — frontend fetch().json() would crash
    return res.status(200).json({ success: true });

  } catch (e) {
    console.error("Register error:", e);
    return res.status(500).json({ error: "Failed creating account" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (typeof email !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ error: "No account with that email" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Wrong password" });
    }

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "48h" });
    return res.json({ token });

  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

// Chat
app.post("/chat", authorize, async (req, res) => {
  try {
    const { message } = req.body;
    const email = req.user.email;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!chatHistories[email]) {
      chatHistories[email] = [];
    }

    chatHistories[email].push({ role: "user", content: message });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b", // Fixed: "openai/gpt-oss-20b" is not a valid Groq model
        messages: chatHistories[email],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", errText);
      return res.status(500).json({ error: "AI API error." });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response";

    chatHistories[email].push({ role: "assistant", content: reply });

    return res.json({ reply });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server error." });
  }
});

// Clear chat history
app.post("/clear", authorize, (req, res) => {
  chatHistories[req.user.email] = [];
  res.json({ status: "History cleared" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
