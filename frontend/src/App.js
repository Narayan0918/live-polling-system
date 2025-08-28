import React, { useState, useEffect } from 'react';
import { Users, Plus, BarChart3, Clock, Send, MessageCircle, Trash2, User } from 'lucide-react';
import io from 'socket.io-client';

const LivePollingSystem = () => {
  const [userType, setUserType] = useState('');
  const [studentName, setStudentName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const [currentPoll, setCurrentPoll] = useState(null);
  const [pollResults, setPollResults] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState([]);
  const [pastPolls, setPastPolls] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [pollTimeLimit, setPollTimeLimit] = useState(60);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));



// Inside your component, add socket connection
const LivePollingSystem = () => {
  // ... your existing state
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Connect to the backend
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // Join the session
    newSocket.emit('join-session', {
      sessionId,
      userType,
      studentName: userType === 'student' ? studentName : undefined
    });

    // Listen for session data
    newSocket.on('session-data', (sessionData) => {
      setDataStore(sessionData);
      setConnectedStudents(sessionData.students);
      setChatMessages(sessionData.messages);
      
      if (sessionData.activePoll) {
        setCurrentPoll(sessionData.activePoll);
        setTimeLeft(sessionData.activePoll.timeLimit);
        setPollResults(sessionData.pollAnswers);
        
        // Check if current user has already answered
        if (userType === 'student' && studentName) {
          const hasAnswered = sessionData.pollAnswers.some(
            a => a.studentName === studentName
          );
          setHasAnswered(hasAnswered);
        }
      }
    });

    newSocket.on('new-poll', (poll) => {
      setCurrentPoll(poll);
      setTimeLeft(poll.timeLimit);
      setHasAnswered(false);
      setShowResults(false);
      setPollResults([]);
    });

    newSocket.on('students-updated', (students) => {
      setConnectedStudents(students);
    });

    newSocket.on('answer-received', (answers) => {
      setPollResults(answers);
    });

    newSocket.on('new-message', (messages) => {
      setChatMessages(messages);
    });

    return () => newSocket.close();
  }, [sessionId, userType, studentName]);

  // Update your handlers to use socket emits
  const handleCreatePoll = () => {
    if (newPollQuestion.trim() && newPollOptions.filter(opt => opt.trim()).length >= 2) {
      const pollData = {
        question: newPollQuestion,
        options: newPollOptions.filter(opt => opt.trim()),
        timeLimit: pollTimeLimit
      };

      socket.emit('create-poll', {
        sessionId,
        pollData
      });

      setNewPollQuestion('');
      setNewPollOptions(['', '', '', '']);
    }
  };

  const handleAnswerSubmit = (optionIndex) => {
    if (!hasAnswered && currentPoll) {
      const answerData = {
        studentName,
        answer: optionIndex,
        timestamp: new Date()
      };

      socket.emit('submit-answer', {
        sessionId,
        answerData
      });

      setHasAnswered(true);
    }
  };

  const handleRemoveStudent = (studentToRemove) => {
    socket.emit('remove-student', {
      sessionId,
      studentName: studentToRemove
    });
  };

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const message = {
        sender: userType === 'teacher' ? 'Teacher' : studentName,
        message: newMessage
      };

      socket.emit('send-message', {
        sessionId,
        message
      });

      setNewMessage('');
    }
  };

  // ... rest of your component
};
  // Teacher form states
  const [newPollQuestion, setNewPollQuestion] = useState('');
  const [newPollOptions, setNewPollOptions] = useState(['', '', '', '']);

  // Simulated data store
  const [dataStore, setDataStore] = useState({
    polls: [],
    students: [],
    messages: [],
    activePoll: null,
    pollAnswers: []
  });

  // Simulate real-time updates with polling
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate fetching latest data from server
      if (userType) {
        updateRealTimeData();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [userType, sessionId]);

  // Timer for active polls
  useEffect(() => {
    let timer;
    if (currentPoll && timeLeft > 0 && !showResults) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setShowResults(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentPoll, timeLeft, showResults]);

  const updateRealTimeData = () => {
    // Simulate getting updated data from server
    setConnectedStudents(dataStore.students);
    setChatMessages(dataStore.messages);
    
    if (dataStore.activePoll && !currentPoll) {
      setCurrentPoll(dataStore.activePoll);
      setTimeLeft(dataStore.activePoll.timeLimit);
      setHasAnswered(false);
      setShowResults(false);
    }

    // Update poll results
    if (dataStore.activePoll && dataStore.pollAnswers.length > 0) {
      setPollResults(dataStore.pollAnswers);
    }

    // Check if all students answered or time is up
    if (dataStore.activePoll && 
        (dataStore.pollAnswers.length >= dataStore.students.length || timeLeft <= 0)) {
      setShowResults(true);
    }
  };

  const handleUserTypeSelection = (type) => {
    setUserType(type);
    if (type === 'teacher') {
      // Load past polls for teacher
      setPastPolls([
        { question: "What is your favorite programming language?", responses: 15, createdAt: new Date() },
        { question: "How difficult was today's lesson?", responses: 12, createdAt: new Date() },
        { question: "Which topic should we cover next?", responses: 18, createdAt: new Date() }
      ]);
    }
  };

  const handleStudentNameSubmit = () => {
    if (studentName.trim()) {
      // Check if name already exists
      if (dataStore.students.includes(studentName)) {
        alert('Name already taken. Please choose a different name.');
        return;
      }

      setIsNameSet(true);
      
      // Add student to the store
      setDataStore(prev => ({
        ...prev,
        students: [...prev.students, studentName]
      }));
    }
  };

  const handleCreatePoll = () => {
    if (newPollQuestion.trim() && newPollOptions.filter(opt => opt.trim()).length >= 2) {
      const pollData = {
        id: Date.now().toString(),
        question: newPollQuestion,
        options: newPollOptions.filter(opt => opt.trim()),
        timeLimit: pollTimeLimit,
        createdAt: new Date()
      };

      setDataStore(prev => ({
        ...prev,
        activePoll: pollData,
        pollAnswers: [],
        polls: [...prev.polls, pollData]
      }));

      setCurrentPoll(pollData);
      setTimeLeft(pollTimeLimit);
      setHasAnswered(false);
      setShowResults(false);
      setPollResults([]);

      setNewPollQuestion('');
      setNewPollOptions(['', '', '', '']);
    }
  };

  const handleAnswerSubmit = (optionIndex) => {
    if (!hasAnswered && currentPoll) {
      const answerData = {
        studentName,
        answer: optionIndex,
        timestamp: new Date()
      };

      setDataStore(prev => ({
        ...prev,
        pollAnswers: [...prev.pollAnswers, answerData]
      }));

      setHasAnswered(true);
      
      // Show results immediately for the student who answered
      setTimeout(() => {
        setPollResults(prev => [...prev, answerData]);
      }, 500);
    }
  };

  const handleRemoveStudent = (studentToRemove) => {
    setDataStore(prev => ({
      ...prev,
      students: prev.students.filter(s => s !== studentToRemove),
      pollAnswers: prev.pollAnswers.filter(a => a.studentName !== studentToRemove)
    }));
  };

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const message = {
        id: Date.now(),
        sender: userType === 'teacher' ? 'Teacher' : studentName,
        message: newMessage,
        timestamp: new Date().toLocaleTimeString()
      };

      setDataStore(prev => ({
        ...prev,
        messages: [...prev.messages.slice(-49), message] // Keep last 50 messages
      }));

      setNewMessage('');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!userType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <BarChart3 className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Live Polling System</h1>
            <p className="text-gray-600">Choose your role to continue</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => handleUserTypeSelection('teacher')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition duration-200 flex items-center justify-center gap-3"
            >
              <Users className="w-5 h-5" />
              Continue as Teacher
            </button>
            
            <button
              onClick={() => handleUserTypeSelection('student')}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition duration-200 flex items-center justify-center gap-3"
            >
              <User className="w-5 h-5" />
              Continue as Student
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (userType === 'student' && !isNameSet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <User className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Student!</h2>
            <p className="text-gray-600">Please enter your name to join</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              onKeyPress={(e) => e.key === 'Enter' && handleStudentNameSubmit()}
            />
            <button
              onClick={handleStudentNameSubmit}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
            >
              Join Polling Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-indigo-600" />
              <h1 className="text-xl font-bold text-gray-800">Live Polling System</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-600">
                {userType === 'teacher' ? 'Teacher Dashboard' : `Welcome, ${studentName}`}
              </span>
              <button
                onClick={() => setShowChat(!showChat)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition duration-200"
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {userType === 'teacher' && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Create New Poll
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
                    <input
                      type="text"
                      value={newPollQuestion}
                      onChange={(e) => setNewPollQuestion(e.target.value)}
                      placeholder="Enter your poll question"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
                    {newPollOptions.map((option, index) => (
                      <input
                        key={index}
                        type="text"
                        value={option}
                        onChange={(e) => {
                          const newOptions = [...newPollOptions];
                          newOptions[index] = e.target.value;
                          setNewPollOptions(newOptions);
                        }}
                        placeholder={`Option ${index + 1}`}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                      />
                    ))}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Time Limit (seconds)</label>
                    <input
                      type="number"
                      value={pollTimeLimit}
                      onChange={(e) => setPollTimeLimit(parseInt(e.target.value) || 60)}
                      min="10"
                      max="300"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  
                  <button
                    onClick={handleCreatePoll}
                    disabled={connectedStudents.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200"
                  >
                    Create Poll
                  </button>
                  {connectedStudents.length === 0 && (
                    <p className="text-sm text-gray-500 text-center">Waiting for students to join...</p>
                  )}
                </div>
              </div>
            )}

            {/* Current Poll */}
            {currentPoll && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Current Poll</h2>
                  {timeLeft > 0 && !showResults && (
                    <div className="flex items-center gap-2 text-orange-600">
                      <Clock className="w-5 h-5" />
                      <span className="font-semibold">{formatTime(timeLeft)}</span>
                    </div>
                  )}
                </div>
                
                <h3 className="text-lg font-medium text-gray-900 mb-4">{currentPoll.question}</h3>
                
                {!showResults && userType === 'student' && !hasAnswered && timeLeft > 0 && (
                  <div className="space-y-3">
                    {currentPoll.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => handleAnswerSubmit(index)}
                        className="w-full text-left p-4 border border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 rounded-lg transition duration-200"
                      >
                        {String.fromCharCode(65 + index)}. {option}
                      </button>
                    ))}
                  </div>
                )}
                
                {(showResults || hasAnswered || userType === 'teacher') && (
                  <div className="space-y-3">
                    {currentPoll.options.map((option, index) => {
                      const votes = pollResults.filter(r => r.answer === index).length;
                      const percentage = pollResults.length > 0 ? (votes / pollResults.length) * 100 : 0;
                      
                      return (
                        <div key={index} className="relative">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium">{String.fromCharCode(65 + index)}. {option}</span>
                            <span className="text-sm text-gray-600">{votes} votes ({percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {userType === 'student' && hasAnswered && !showResults && (
                  <div className="text-center py-4">
                    <p className="text-green-600 font-medium">Answer submitted! Waiting for results...</p>
                  </div>
                )}

                {timeLeft === 0 && (
                  <div className="text-center py-2">
                    <p className="text-red-600 font-medium">Time's up! Final results displayed.</p>
                  </div>
                )}
              </div>
            )}

            {!currentPoll && (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-800 mb-2">No Active Poll</h3>
                <p className="text-gray-600">
                  {userType === 'teacher' ? 'Create a new poll to get started' : 'Waiting for teacher to start a poll...'}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Connected Students */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Connected Students ({connectedStudents.length})
              </h3>
              <div className="space-y-2">
                {connectedStudents.length === 0 ? (
                  <p className="text-gray-500 text-sm">No students connected</p>
                ) : (
                  connectedStudents.map((student, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium">{student}</span>
                      {userType === 'teacher' && (
                        <button
                          onClick={() => handleRemoveStudent(student)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Past Polls - Teacher Only */}
            {userType === 'teacher' && pastPolls.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Past Polls</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {pastPolls.map((poll, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-800 mb-1">{poll.question}</p>
                      <p className="text-xs text-gray-600">{poll.responses} responses</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Popup */}
      {showChat && (
        <div className="fixed bottom-4 right-4 w-80 h-96 bg-white rounded-lg shadow-xl border z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Chat</h3>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-500 hover:text-gray-700 w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
          </div>
          
          <div className="h-64 p-4 overflow-y-auto">
            {chatMessages.length === 0 ? (
              <p className="text-gray-500 text-sm text-center mt-8">No messages yet...</p>
            ) : (
              chatMessages.map((msg, index) => (
                <div key={msg.id || index} className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-600">{msg.sender}</span>
                    <span className="text-xs text-gray-400">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-800 bg-gray-50 p-2 rounded">{msg.message}</p>
                </div>
              ))
            )}
          </div>
          
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-200"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LivePollingSystem;