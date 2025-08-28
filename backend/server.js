const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/live-polling-system';
let db;

MongoClient.connect(MONGODB_URI)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db();
  })
  .catch(error => console.error('MongoDB connection error:', error));

// In-memory storage (for real-time features)
let connectedStudents = new Map(); // socketId -> studentName
let currentPoll = null;
let pollResults = [];
let pollTimer = null;
let chatMessages = [];

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Teacher joins
  socket.on('join-as-teacher', () => {
    socket.join('teachers');
    socket.emit('students-update', Array.from(connectedStudents.values()));
    
    if (currentPoll) {
      socket.emit('poll-created', currentPoll);
      socket.emit('poll-results', pollResults);
    }
    
    socket.emit('chat-message', ...chatMessages);
    console.log('Teacher joined');
  });

  // Student joins
  socket.on('join-as-student', (studentName) => {
    // Check if name already exists
    const existingNames = Array.from(connectedStudents.values());
    if (existingNames.includes(studentName)) {
      socket.emit('name-taken');
      return;
    }

    connectedStudents.set(socket.id, studentName);
    socket.join('students');
    
    // Update all clients about connected students
    io.emit('students-update', Array.from(connectedStudents.values()));
    
    if (currentPoll) {
      socket.emit('poll-created', currentPoll);
    }
    
    socket.emit('chat-message', ...chatMessages);
    console.log('Student joined:', studentName);
  });

  // Create poll
  socket.on('create-poll', async (pollData) => {
    // Check if teacher can create new poll
    const studentsCount = connectedStudents.size;
    const answeredCount = pollResults.length;
    
    if (currentPoll && answeredCount < studentsCount) {
      socket.emit('error', 'Cannot create new poll. Wait for all students to answer or poll to end.');
      return;
    }

    // Clear previous poll timer
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    // Create new poll
    currentPoll = {
      id: new ObjectId().toString(),
      question: pollData.question,
      options: pollData.options,
      timeLimit: pollData.timeLimit,
      createdAt: new Date(),
      timeLeft: pollData.timeLimit
    };

    pollResults = [];
    
    // Save poll to database
    try {
      await db.collection('polls').insertOne({
        ...currentPoll,
        responses: [],
        status: 'active'
      });
    } catch (error) {
      console.error('Error saving poll to database:', error);
    }

    // Broadcast poll to all clients
    io.emit('poll-created', currentPoll);

    // Start timer
    let timeLeft = pollData.timeLimit;
    pollTimer = setInterval(() => {
      timeLeft--;
      currentPoll.timeLeft = timeLeft;
      io.emit('time-update', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(pollTimer);
        pollTimer = null;
        endPoll();
      }
    }, 1000);

    console.log('Poll created:', pollData.question);
  });

  // Submit answer
  socket.on('submit-answer', async (data) => {
    if (!currentPoll || currentPoll.id !== data.pollId) {
      socket.emit('error', 'Invalid poll');
      return;
    }

    const studentName = connectedStudents.get(socket.id);
    if (!studentName) {
      socket.emit('error', 'Student not found');
      return;
    }

    // Check if student already answered
    const existingAnswer = pollResults.find(r => r.studentName === studentName);
    if (existingAnswer) {
      socket.emit('error', 'Already answered');
      return;
    }

    // Add answer
    const answerData = {
      studentName,
      answer: data.answer,
      timestamp: new Date()
    };

    pollResults.push(answerData);

    // Update database
    try {
      await db.collection('polls').updateOne(
        { _id: new ObjectId(currentPoll.id) },
        { $push: { responses: answerData } }
      );
    } catch (error) {
      console.error('Error updating poll in database:', error);
    }

    // Broadcast results to all clients
    io.emit('poll-results', pollResults);

    // Check if all students answered
    if (pollResults.length >= connectedStudents.size) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      endPoll();
    }

    console.log('Answer submitted:', studentName, data.answer);
  });

  // Get past polls
  socket.on('get-past-polls', async () => {
    try {
      const pastPolls = await db.collection('polls')
        .find({ status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const formattedPolls = pastPolls.map(poll => ({
        question: poll.question,
        responses: poll.responses ? poll.responses.length : 0,
        createdAt: poll.createdAt
      }));

      socket.emit('past-polls', formattedPolls);
    } catch (error) {
      console.error('Error fetching past polls:', error);
    }
  });

  // Remove student
  socket.on('remove-student', (studentName) => {
    // Find socket ID for student
    let studentSocketId = null;
    for (const [socketId, name] of connectedStudents.entries()) {
      if (name === studentName) {
        studentSocketId = socketId;
        break;
      }
    }

    if (studentSocketId) {
      connectedStudents.delete(studentSocketId);
      io.to(studentSocketId).emit('removed-by-teacher');
      io.to(studentSocketId).disconnect();
      
      // Update connected students
      io.emit('students-update', Array.from(connectedStudents.values()));
      console.log('Student removed:', studentName);
    }
  });

  // Chat messages
  socket.on('send-message', (message) => {
    chatMessages.push(message);
    
    // Keep only last 50 messages
    if (chatMessages.length > 50) {
      chatMessages = chatMessages.slice(-50);
    }
    
    io.emit('chat-message', message);
    console.log('Chat message:', message.sender, message.message);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const studentName = connectedStudents.get(socket.id);
    if (studentName) {
      connectedStudents.delete(socket.id);
      io.emit('students-update', Array.from(connectedStudents.values()));
      console.log('Student disconnected:', studentName);
    } else {
      console.log('Teacher disconnected:', socket.id);
    }
  });
});

// Helper function to end poll
async function endPoll() {
  if (currentPoll) {
    try {
      await db.collection('polls').updateOne(
        { _id: new ObjectId(currentPoll.id) },
        { $set: { status: 'completed', endedAt: new Date() } }
      );
    } catch (error) {
      console.error('Error updating poll status:', error);
    }

    io.emit('poll-ended');
    io.emit('poll-results', pollResults);
    
    console.log('Poll ended:', currentPoll.question);
  }
}

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.get('/api/polls', async (req, res) => {
  try {
    const polls = await db.collection('polls')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(polls);
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/polls/:id', async (req, res) => {
  try {
    const poll = await db.collection('polls')
      .findOne({ _id: new ObjectId(req.params.id) });
    
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    
    res.json(poll);
  } catch (error) {
    console.error('Error fetching poll:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend should connect to: http://localhost:${PORT}`);
});