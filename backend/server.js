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
  cors: { origin: "*", methods: ["GET", "POST"] }
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

// --- Define session schema ---
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true },
  polls: { type: Array, default: [] },
  students: { type: Array, default: [] },
  messages: { type: Array, default: [] },
  activePoll: { type: Object, default: null },
  pollAnswers: { type: Array, default: [] }
});

const Session = mongoose.model("Session", sessionSchema);

// --- Socket.io handlers ---
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("joinSession", async ({ sessionId, role, studentName }) => {
    try {
      let session = await Session.findOne({ sessionId });
      if (!session) {
        session = new Session({ sessionId });
        await session.save();
      }

      socket.join(sessionId);

      if (role === "student" && studentName) {
        if (!session.students.includes(studentName)) {
          session.students.push(studentName);
          await session.save();
        }
        io.to(sessionId).emit("studentList", session.students);
      }

      socket.emit("polls", session.polls);
      socket.emit("messages", session.messages);
      socket.emit("activePoll", session.activePoll);
    } catch (err) {
      console.error("Join error:", err);
    }
  });

  socket.on("createPoll", async ({ sessionId, poll }) => {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;
      session.polls.push(poll);
      session.activePoll = poll;
      await session.save();
      io.to(sessionId).emit("polls", session.polls);
      io.to(sessionId).emit("activePoll", poll);
    } catch (err) {
      console.error("Poll creation error:", err);
    }
  });

  socket.on("submitAnswer", async ({ sessionId, answer }) => {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;
      session.pollAnswers.push(answer);
      await session.save();
      io.to(sessionId).emit("pollAnswers", session.pollAnswers);
    } catch (err) {
      console.error("Submit answer error:", err);
    }
  });

  socket.on("sendMessage", async ({ sessionId, message }) => {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;
      session.messages.push(message);
      await session.save();
      io.to(sessionId).emit("messages", session.messages);
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
