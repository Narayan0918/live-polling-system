// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage (replace with database in production)
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (data) => {
    const { sessionId, userType, studentName } = data;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        polls: [],
        students: [],
        messages: [],
        activePoll: null,
        pollAnswers: []
      });
    }

    const session = sessions.get(sessionId);
    socket.join(sessionId);

    if (userType === 'student' && studentName && !session.students.includes(studentName)) {
      session.students.push(studentName);
    }

    // Send current session state to the new user
    socket.emit('session-data', session);
    
    // Notify others about the updated student list
    io.to(sessionId).emit('students-updated', session.students);
  });

  socket.on('create-poll', (data) => {
    const { sessionId, pollData } = data;
    const session = sessions.get(sessionId);
    
    if (session) {
      session.activePoll = {
        ...pollData,
        createdAt: new Date(),
        id: Date.now().toString()
      };
      session.pollAnswers = [];
      
      io.to(sessionId).emit('new-poll', session.activePoll);
    }
  });

  socket.on('submit-answer', (data) => {
    const { sessionId, answerData } = data;
    const session = sessions.get(sessionId);
    
    if (session && session.activePoll) {
      // Check if student already answered
      const existingAnswerIndex = session.pollAnswers.findIndex(
        a => a.studentName === answerData.studentName
      );
      
      if (existingAnswerIndex === -1) {
        session.pollAnswers.push(answerData);
        io.to(sessionId).emit('answer-received', session.pollAnswers);
      }
    }
  });

  socket.on('send-message', (data) => {
    const { sessionId, message } = data;
    const session = sessions.get(sessionId);
    
    if (session) {
      session.messages.push({
        ...message,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString()
      });
      
      // Keep only last 50 messages
      if (session.messages.length > 50) {
        session.messages = session.messages.slice(-50);
      }
      
      io.to(sessionId).emit('new-message', session.messages);
    }
  });

  socket.on('remove-student', (data) => {
    const { sessionId, studentName } = data;
    const session = sessions.get(sessionId);
    
    if (session) {
      session.students = session.students.filter(s => s !== studentName);
      session.pollAnswers = session.pollAnswers.filter(a => a.studentName !== studentName);
      
      io.to(sessionId).emit('students-updated', session.students);
      io.to(sessionId).emit('answer-received', session.pollAnswers);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});