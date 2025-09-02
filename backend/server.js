// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

app.use(cors());
app.use(express.json());

// --- MongoDB connection ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB error:", err));

// --- Sub-schemas ---
const MessageSchema = new mongoose.Schema({
  name: { type: String, default: "User" },
  text: String,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const AnswerSchema = new mongoose.Schema({
  studentName: String,
  optionIndex: Number
}, { _id: false });

const PollSchema = new mongoose.Schema({
  question: String,
  options: [String],
  counts: { type: [Number], default: [] },         // derived but stored for speed
  answers: { type: [AnswerSchema], default: [] },  // {studentName, optionIndex}
  createdAt: { type: Date, default: Date.now },
  durationSeconds: { type: Number, default: 60 },
  status: { type: String, default: 'active' }      // 'active' | 'closed'
});

// --- Session schema ---
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true },
  polls: { type: [PollSchema], default: [] },
  students: { type: [String], default: [] },       // list of names
  messages: { type: [MessageSchema], default: [] },
  activePollId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

const Session = mongoose.model("Session", sessionSchema);

const DEFAULT_SESSION = "default";

// --- Helpers ---
async function getSession(sessionId = DEFAULT_SESSION) {
  let session = await Session.findOne({ sessionId });
  if (!session) {
    session = new Session({ sessionId, polls: [], students: [], messages: [], activePollId: null });
    await session.save();
  }
  return session;
}

function pollIsTimedOut(poll) {
  const end = new Date(poll.createdAt).getTime() + (poll.durationSeconds * 1000);
  return Date.now() >= end;
}

function closePollIfDone(session, poll) {
  // close if time elapsed OR every student has answered
  const allAnswered = session.students.length > 0 &&
    poll.answers.length >= session.students.length;

  if (poll.status === 'active' && (pollIsTimedOut(poll) || allAnswered)) {
    poll.status = 'closed';
    session.activePollId = null;
  }
}

function recomputeCounts(poll) {
  const counts = Array(poll.options.length).fill(0);
  for (const a of poll.answers) {
    if (a.optionIndex >= 0 && a.optionIndex < counts.length) counts[a.optionIndex]++;
  }
  poll.counts = counts;
}

// --- Socket.io (kept, emits on changes) ---
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.on("joinSession", async ({ sessionId }) => {
    const session = await getSession(sessionId);
    socket.join(sessionId || DEFAULT_SESSION);
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

function broadcast(session) {
  io.to(session.sessionId).emit("state", {
    students: session.students,
    polls: session.polls,
    activePollId: session.activePollId,
    messages: session.messages
  });
}

// -------------------- REST API --------------------

// Get current state (students, polls, activePoll, messages)
app.get('/api/state', async (req, res) => {
  try {
    const session = await getSession();
    // auto-close active poll if timed out
    if (session.activePollId) {
      const poll = session.polls.id(session.activePollId);
      if (poll) {
        closePollIfDone(session, poll);
        recomputeCounts(poll);
        await session.save();
      }
    }
    res.json({
      students: session.students,
      polls: session.polls,
      activePollId: session.activePollId,
      messages: session.messages
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Students ----------
app.get('/api/students', async (req, res) => {
  try {
    const session = await getSession();
    res.json(session.students.map(name => ({ name })));
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

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
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.delete('/api/students/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const session = await getSession();
    session.students = session.students.filter(n => n !== name);
    await session.save();
    broadcast(session);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Kick (alias)
app.post('/api/kick', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const session = await getSession();
    session.students = session.students.filter(n => n !== name);
    await session.save();
    broadcast(session);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Messages ----------
app.get('/api/messages', async (req, res) => {
  try {
    const session = await getSession();
    res.json(session.messages);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
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
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Polls ----------
app.get('/api/polls', async (req, res) => {
  try {
    const session = await getSession();
    // auto-close if needed
    if (session.activePollId) {
      const poll = session.polls.id(session.activePollId);
      if (poll) {
        closePollIfDone(session, poll);
        recomputeCounts(poll);
        await session.save();
      }
    }
    res.json(session.polls);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/api/polls/:id', async (req, res) => {
  try {
    const session = await getSession();
    const poll = session.polls.id(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    // refresh status/counts
    closePollIfDone(session, poll);
    recomputeCounts(poll);
    await session.save();
    res.json(poll);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create poll (Teacher)
app.post('/api/polls', async (req, res) => {
  try {
    const { question, options, durationSeconds = 60 } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "Question and at least 2 options required" });
    }

    const session = await getSession();
    if (session.activePollId) {
      const active = session.polls.id(session.activePollId);
      if (active && active.status === 'active' && !pollIsTimedOut(active) && active.answers.length < session.students.length) {
        return res.status(409).json({ error: "Cannot create new poll until the current one is complete (time or all students answered)." });
      }
    }

    const poll = {
      question,
      options,
      counts: Array(options.length).fill(0),
      answers: [],
      createdAt: new Date(),
      durationSeconds,
      status: 'active'
    };

    session.polls.push(poll);
    const created = session.polls[session.polls.length - 1];
    session.activePollId = created._id;
    await session.save();

    broadcast(session);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Submit answer (Student)
app.post('/api/answers', async (req, res) => {
  try {
    const { pollId, option, optionIndex, studentName } = req.body;
    const idx = (typeof optionIndex === 'number') ? optionIndex : option;
    if (!pollId || typeof idx !== 'number' || idx < 0) {
      return res.status(400).json({ error: "pollId and optionIndex required" });
    }
    const session = await getSession();
    const poll = session.polls.id(pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (poll.status !== 'active') return res.status(409).json({ error: "Poll is closed" });
    if (pollIsTimedOut(poll)) {
      poll.status = 'closed';
      session.activePollId = null;
      await session.save();
      broadcast(session);
      return res.status(409).json({ error: "Time over" });
    }

    // prevent duplicate from same student
    if (studentName && poll.answers.some(a => a.studentName === studentName)) {
      return res.status(409).json({ error: "You already answered this poll" });
    }

    poll.answers.push({ studentName: studentName || 'User', optionIndex: idx });
    recomputeCounts(poll);
    closePollIfDone(session, poll);
    await session.save();

    broadcast(session);
    res.json(poll);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- Start server --------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
