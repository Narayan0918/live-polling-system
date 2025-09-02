// frontend/src/App.js
import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import io from "socket.io-client";
import API_URL from "./config";
import "./App.css";

// Establish a single, persistent WebSocket connection
const socket = io(API_URL);

// ====================================================================
// ✅ HELPER & PAGE COMPONENTS MOVED OUTSIDE OF THE 'App' COMPONENT
// ====================================================================

/* Navbar */
function Navbar({ name, role }) {
  const signOut = () => {
    localStorage.clear();
    window.location.href = '/';
  };
  return (
    <nav className="navbar">
      <div className="nav-left">
        <h2 className="nav-logo">Intervue Poll</h2>
        <div className="nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/student" className="nav-link">Student</Link>
          <Link to="/teacher" className="nav-link">Teacher</Link>
        </div>
      </div>
      <div className="nav-right">
        {name && (
          <div className="user-info">
            Signed in as <span className="user-name">{name}</span> ({role})
            <button type="button" className="ghost" onClick={signOut} style={{marginLeft: '10px', color: 'white', borderColor: 'white'}}>Sign Out</button>
          </div>
        )}
      </div>
    </nav>
  );
}

/* Footer */
function Footer() {
  return (
    <footer className="footer">
      <p>Intervue Poll &copy; {new Date().getFullYear()} - Real-time polling for education</p>
    </footer>
  );
}

/* ResultBars Helper */
function ResultBars({ poll }) {
  const total = (poll.counts || []).reduce((a, b) => a + b, 0);
  return (
    <div className="results">
      {poll.options.map((opt, i) => {
        const count = poll.counts?.[i] || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <div key={i} className="result-row">
            <div className="result-label">{i + 1}. {opt}</div>
            <div className="bar-wrap"><div className="bar" style={{ width: `${pct}%` }} /></div>
            <div className="pct">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

/* ChatPanel Helper */
function ChatPanel({ messages, chatText, setChatText, sendChat }) {
  return (
    <div className="chat">
      <div className="chat-list">
        {messages.map((m, i) => <div key={i} className="chat-item"><b>{m.name}:</b> {m.text}</div>)}
      </div>
      <div className="chat-input">
        <input
          type="text" className="input" value={chatText}
          onChange={e => setChatText(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && sendChat()}
          placeholder="Type a message…"
        />
        <button type="button" className="primary" onClick={sendChat}>Send</button>
      </div>
    </div>
  );
}

/* HomePage */
function HomePage() {
  return (
    <div className="landing">
      <h1>Welcome to Intervue Poll</h1>
      <p className="muted">Use the navigation bar above to join as a student or manage polls as a teacher.</p>
    </div>
  );
}

/* StudentPage */
function StudentPage({ name, role, activePoll, secondsLeft, userHasAnsweredActive, vote, joinAsStudent, chatProps }) {
  const [tempName, setTempName] = useState("");
  if (!name || role !== 'student') {
    return (
      <div className="panel center-panel">
        <h2>Enter your name to join</h2>
        <input type="text" className="input" value={tempName} onChange={e => setTempName(e.target.value)} placeholder="e.g. Rahul Bajaj" />
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="primary" onClick={() => joinAsStudent(tempName)}>Continue as Student</button>
        </div>
      </div>
    );
  }
  if (!activePoll) return <div className="panel"><p className="muted">Waiting for the teacher to start a poll…</p><ChatPanel {...chatProps} /></div>;
  const disabled = userHasAnsweredActive || secondsLeft <= 0 || activePoll.status !== "active";
  return (
    <div className="panel">
      <div className="poll-head">
        <h3>{activePoll.question}</h3>
        <span className="timer">{secondsLeft}s</span>
      </div>
      <div className="options">
        {activePoll.options.map((opt, i) => (
          <button type="button" key={i} className="option" disabled={disabled} onClick={() => vote(activePoll._id, i)}>{opt}</button>
        ))}
      </div>
      {disabled && <ResultBars poll={activePoll} />}
      <ChatPanel {...chatProps} />
    </div>
  );
}

/* TeacherPage */
function TeacherPage({ role, setRole, setName, students, polls, activePoll, qText, setQText, options, setOptions, duration, setDuration, createPoll, kick, chatProps }) {
  if (role !== 'teacher') {
    return (
      <div className="panel center-panel">
        <h2>Teacher Access</h2>
        <p className="muted">This will grant you control over the session polls and participants.</p>
        <button type="button" className="primary" onClick={() => {
          localStorage.setItem("role", "teacher");
          localStorage.setItem("name", "Teacher");
          setRole("teacher");
          setName("Teacher");
        }}>
          Become the Teacher
        </button>
      </div>
    );
  }
  return (
    <div className="teacher">
      <div className="panel">
        <h3>Create Poll</h3>
        <textarea className="textarea" value={qText} onChange={e => setQText(e.target.value)} placeholder="Enter your question" />
        {options.map((opt, i) => (
          <input key={i} type="text" className="input" value={opt} onChange={e => { const arr = [...options]; arr[i] = e.target.value; setOptions(arr); }} placeholder={`Option ${i + 1}`} />
        ))}
        <div className="row">
          <button type="button" className="ghost" onClick={() => setOptions(prev => [...prev, ""])}>+ Add option</button>
          <select className="select" value={duration} onChange={e => setDuration(Number(e.target.value))}>
            <option value={30}>30s</option> <option value={60}>60s</option> <option value={90}>90s</option>
          </select>
          <button type="button" className="primary" onClick={createPoll}>Ask Question</button>
        </div>
      </div>
      <div className="panel">
        <h3>Live Results</h3>
        {activePoll ? <ResultBars poll={activePoll} /> : <p className="muted">No active poll</p>}
      </div>
      <div className="panel">
        <h3>Participants ({students.length})</h3>
        <ul className="participants-list">
          {students.map(s => (
            <li key={s} className="participant-row">
              <div>{s}</div>
              <div><button type="button" className="ghost" onClick={() => kick(s)}>Kick</button></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel"> <h3>Chat</h3> <ChatPanel {...chatProps} /> </div>
      <div className="panel">
        <h3>Poll History</h3>
        {polls.filter(p => p.status !== "active").length === 0 && <div className="muted">No poll history yet</div>}
        {polls.slice().reverse().filter(p => p.status !== "active").map((p) => (
          <div key={p._id} className="history">
            <b>{p.question}</b>
            <ResultBars poll={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===============================================
// ✅ MAIN 'App' COMPONENT
// ===============================================

export default function App() {
  /* local persisted user info */
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [name, setName] = useState(localStorage.getItem("name") || "");

  /* server-driven state */
  const [students, setStudents] = useState([]);
  const [polls, setPolls] = useState([]);
  const [activePollId, setActivePollId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [time, setTime] = useState(Date.now());

  /* local input states */
  const [qText, setQText] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(60);
  const [chatText, setChatText] = useState("");

  /* WebSocket Listener */
  useEffect(() => {
    socket.emit("joinSession", { sessionId: "default" });
    socket.on("state", (data) => {
      setStudents(data.students || []);
      setPolls(data.polls || []);
      setActivePollId(data.activePollId || null);
      setMessages(data.messages || []);
      if (role === 'student' && name && !data.students.includes(name)) {
        localStorage.clear();
        setRole("");
        setName("");
        alert("You have been removed from the session by the teacher.");
      }
    });
    const timerId = setInterval(() => setTime(Date.now()), 1000);
    return () => {
      socket.off("state");
      clearInterval(timerId);
    };
  }, [name, role]);

  /* derived state */
  const activePoll = useMemo(() => polls.find(p => String(p._id) === String(activePollId)) || null, [polls, activePollId]);
  const userHasAnsweredActive = useMemo(() => !(!activePoll || !name) && !!(activePoll.answers || []).find(a => a.studentName === name), [activePoll, name]);
  const secondsLeft = useMemo(() => {
    if (!activePoll) return 0;
    const end = new Date(activePoll.createdAt).getTime() + (Number(activePoll.durationSeconds) || 0) * 1000;
    return Math.max(0, Math.ceil((end - time) / 1000));
  }, [activePoll, time]);

  /* actions */
  async function joinAsStudent(studentName) {
    if (!studentName.trim()) return alert("Enter your name");
    try {
      await fetch(`${API_URL}/api/students`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: studentName.trim() }) });
      localStorage.setItem("role", "student");
      localStorage.setItem("name", studentName.trim());
      setRole("student");
      setName(studentName.trim());
    } catch (e) { console.warn("join error", e); }
  }
  async function createPoll() {
    const clean = options.map(o => o.trim()).filter(Boolean);
    if (!qText.trim() || clean.length < 2) return alert("Enter a question and at least 2 options");
    try {
      await fetch(`${API_URL}/api/polls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: qText.trim(), options: clean, durationSeconds: duration }) });
      setQText("");
      setOptions(["", ""]);
      setDuration(60);
    } catch (e) { console.warn("createPoll error", e); }
  }
  async function vote(pollId, optionIndex) {
    try {
      await fetch(`${API_URL}/api/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pollId, optionIndex, studentName: name }) });
    } catch (e) { console.warn("vote error", e); }
  }
  async function kick(n) {
    try {
      await fetch(`${API_URL}/api/kick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    } catch (e) { console.warn("kick error", e); }
  }
  async function sendChat() {
    if (!chatText.trim()) return;
    try {
      await fetch(`${API_URL}/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name || role, text: chatText.trim() }) });
      setChatText("");
    } catch (e) { console.warn("chat error", e); }
  }

  // Group props for cleaner passing
  const chatProps = { messages, chatText, setChatText, sendChat };

  return (
    <Router>
      <Navbar name={name} role={role} />
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route 
            path="/student" 
            element={<StudentPage 
              name={name} 
              role={role} 
              activePoll={activePoll} 
              secondsLeft={secondsLeft} 
              userHasAnsweredActive={userHasAnsweredActive} 
              vote={vote} 
              joinAsStudent={joinAsStudent}
              chatProps={chatProps} 
            />} 
          />
          <Route 
            path="/teacher" 
            element={<TeacherPage 
              role={role}
              setRole={setRole}
              setName={setName}
              students={students} 
              polls={polls} 
              activePoll={activePoll} 
              qText={qText} 
              setQText={setQText} 
              options={options} 
              setOptions={setOptions} 
              duration={duration} 
              setDuration={setDuration} 
              createPoll={createPoll} 
              kick={kick}
              chatProps={chatProps}
            />} 
          />
        </Routes>
      </div>
      <Footer />
    </Router>
  );
}