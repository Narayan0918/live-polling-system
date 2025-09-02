// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

app.use(cors());
app.use(express.json());

// --- PRODUCTION: Serve static frontend files ---
// This will serve the built React app from the 'frontend/build' directory
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// --- MongoDB connection ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB error:", err));

// --- Schemas (No changes) ---
const MessageSchema = new mongoose.Schema({ name: { type: String, default: "User" }, text: String, timestamp: { type: Date, default: Date.now } }, { _id: false });
const AnswerSchema = new mongoose.Schema({ studentName: String, optionIndex: Number }, { _id: false });
const PollSchema = new mongoose.Schema({ question: String, options: [String], counts: { type: [Number], default: [] }, answers: { type: [AnswerSchema], default: [] }, createdAt: { type: Date, default: Date.now }, durationSeconds: { type: Number, default: 60 }, status: { type: String, default: 'active' } });
const sessionSchema = new mongoose.Schema({ sessionId: { type: String, unique: true }, polls: { type: [PollSchema], default: [] }, students: { type: [String], default: [] }, messages: { type: [MessageSchema], default: [] }, activePollId: { type: mongoose.Schema.Types.ObjectId, default: null },});
const Session = mongoose.model("Session", sessionSchema);

const DEFAULT_SESSION = "default";

// --- Helpers ---
async function getSession(sessionId = DEFAULT_SESSION) {
  let session = await Session.findOne({ sessionId });
  if (!session) {
    session = new Session({ sessionId });
    await session.save();
  }
  return session;
}

function pollIsTimedOut(poll) {
  if (!poll) return false;
  const end = new Date(poll.createdAt).getTime() + (poll.durationSeconds * 1000);
  return Date.now() >= end;
}

function recomputeCounts(poll) {
  const counts = Array(poll.options.length).fill(0);
  for (const a of poll.answers) {
    if (a.optionIndex >= 0 && a.optionIndex < counts.length) counts[a.optionIndex]++;
  }
  poll.counts = counts;
}

function broadcast(session) {
  // Ensure we are broadcasting a clean, simple array of student names
  const state = {
    students: session.students,
    polls: session.polls,
    activePollId: session.activePollId,
    messages: session.messages
  };
  io.to(session.sessionId || DEFAULT_SESSION).emit("state", state);
}

// --- Socket.io Listeners ---
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  
  socket.on("joinSession", async ({ sessionId = DEFAULT_SESSION }) => {
    socket.join(sessionId);
    const session = await getSession(sessionId);
    // When a user joins, send them the current state immediately
    socket.emit("state", {
      students: session.students,
      polls: session.polls,
      activePollId: session.activePollId,
      messages: session.messages
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// --- Server-side Poll Timer ---
// This timer reliably closes polls and broadcasts updates
setInterval(async () => {
  const session = await getSession();
  if (!session.activePollId) return;

  const poll = session.polls.id(session.activePollId);
  if (poll && poll.status === 'active') {
    const allAnswered = session.students.length > 0 && poll.answers.length >= session.students.length;
    if (pollIsTimedOut(poll) || allAnswered) {
      poll.status = 'closed';
      session.activePollId = null;
      await session.save();
      broadcast(session);
      console.log(`Poll "${poll.question}" closed automatically.`);
    }
  }
}, 2000); // Check every 2 seconds

// -------------------- REST API --------------------
// All API routes now automatically broadcast changes, no other changes needed here.
// Note: The '/api/state' endpoint is no longer used by the frontend for polling,
// but it's kept as it can be useful for debugging.

app.post('/api/students', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });
    const session = await getSession();
    if (!session.students.includes(name)) {
      session.students.push(name);
      await session.save();
      broadcast(session);
    }
    res.json({ name });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/kick', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const session = await getSession();
    session.students = session.students.filter(n => n !== name);
    await session.save();
    broadcast(session);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { name = "User", text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text required" });
    const session = await getSession();
    const msg = { name, text, timestamp: new Date() };
    session.messages.push(msg);
    await session.save();
    broadcast(session);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/polls', async (req, res) => {
  try {
    const { question, options, durationSeconds = 60 } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "Question and at least 2 options required" });
    }
    const session = await getSession();
    if (session.activePollId) {
      const active = session.polls.id(session.activePollId);
      if (active && active.status === 'active' && !pollIsTimedOut(active)) {
        return res.status(409).json({ error: "An active poll is already running." });
      }
    }
    const poll = { question, options, counts: Array(options.length).fill(0), answers: [], createdAt: new Date(), durationSeconds, status: 'active' };
    session.polls.push(poll);
    const created = session.polls[session.polls.length - 1];
    session.activePollId = created._id;
    await session.save();
    broadcast(session);
    res.status(201).json(created);
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});

app.post('/api/answers', async (req, res) => {
  try {
    const { pollId, optionIndex, studentName } = req.body;
    if (!pollId || typeof optionIndex !== 'number' || optionIndex < 0) {
      return res.status(400).json({ error: "pollId and optionIndex required" });
    }
    const session = await getSession();
    const poll = session.polls.id(pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (poll.status !== 'active' || pollIsTimedOut(poll)) {
      return res.status(409).json({ error: "This poll is closed." });
    }
    if (studentName && poll.answers.some(a => a.studentName === studentName)) {
      return res.status(409).json({ error: "You have already answered this poll." });
    }
    poll.answers.push({ studentName: studentName || 'User', optionIndex });
    recomputeCounts(poll);
    await session.save();
    broadcast(session);
    res.json(poll);
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});

// --- PRODUCTION: Catch-all to serve index.html ---
// This makes sure that navigating directly to /student or /teacher in the browser works.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));