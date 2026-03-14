const express = require('express');
const dotenv = require("dotenv");
const cors = require('cors');
const bcrypt= require('bcryptjs');
const jwt = require('jsonwebtoken');
let users=[]; //temporary storage
let chatHistories = {}; // stores conversation history per user

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
// Health check
app.get("/", (req, res) => res.redirect('/login'));
//Health check
app.get("/check",(req,res)=>{
  res.json({status:'Nanochat running smoothly'});

});
const path = require('path');
// Serve the frontend
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'Register.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'Login.html'));
});
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.post('/register',async (req,res) =>{
  const {name,password}= req.body;
  if(!name || !password){
    console.log("missing fields");
    return res.status(400).json({error:"Missing fields"});
  }
  const hashedpasswrd = await bcrypt.hash(password,10);
  if (!hashedpasswrd) {
    console.log("hashing failed");
    return res.status(402).json({error:'hashing faild'})
  }
  users.push({name, password: hashedpasswrd});
  res.send("ok");
  
});
app.post("/login",async (req,res)=>{
  const{name,password}=req.body;
  if(!name ||!password){
    return res.status(400).json({error:"Missing fields"});
  }
  const user= users.find(u =>u.name===name);
  if(!user){
    return res.status(401).json({error:"Invalid login"});
  };
  const valid= await bcrypt.compare(password,user.password);
  if(!valid){
    return res.status(401).json({error:"Invalid login"});
  }
  const token=jwt.sign({name},
  process.env.JWT_SECRET,
  {expiresIn:"48h"}
  );
  res.json({token});
});
function authorize(req,res,next){
  const AuthHeader=req.headers.authorization;
  if(!AuthHeader){
    console.log("failed authorization");
    return res.status(401).json({error:"No token"});
  }
  try {
    
  const token = AuthHeader.split(' ')[1];
  const decoded=jwt.verify(token,process.env.JWT_SECRET);
  req.user=decoded;
  next();
  } catch (err) {
    console.error('Error:', err);
    return res.status(401).json({Error:"something's wrong"});
    
  }
};


// AI endpoint
app.post("/chat", authorize ,async (req, res) => {
  try {
    const { message } = req.body;
    const username = req.user.name;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    // Initialize history for this user if it doesn't exist
    if (!chatHistories[username]) {
      chatHistories[username] = [];
    }

    // Add the new user message to their history
    chatHistories[username].push({ role: "user", content: message });

    const response = await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: chatHistories[username], // send full history
      temperature: 0.7,
      max_tokens: 500,
    }),
  }
);
    console.log("sent");
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response";

    // Add the assistant reply to history
    chatHistories[username].push({ role: "assistant", content: reply });

    res.json({ reply });
    console.log("hf-respons",data);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// Clear chat history for a user
app.post("/clear", authorize, (req, res) => {
  const username = req.user.name;
  chatHistories[username] = [];
  res.json({ status: "History cleared" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});