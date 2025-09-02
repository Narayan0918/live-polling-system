import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom";
import API_URL from "./config";
import "./App.css";

// polling hook
function useInterval(callback, delay) {
  const savedRef = useRef();
  useEffect(() => { savedRef.current = callback; }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// Navbar component
function Navbar() {
  return (
    <nav className="navbar">
      <h2 className="nav-logo">Intervue Poll</h2>
      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/student">Student</Link>
        <Link to="/teacher">Teacher</Link>
      </div>
    </nav>
  );
}

export default function App() {
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [name, setName] = useState(localStorage.getItem("name") || "");
  const [students, setStudents] = useState([]);
  const [polls, setPolls] = useState([]);
  const [activePollId, setActivePollId] = useState(null);
  const [messages, setMessages] = useState([]);

  // teacher inputs
  const [qText, setQText] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(60);

  // chat
  const [chatText, setChatText] = useState("");

  // derive active poll
  const activePoll = useMemo(
    () => polls.find(p => String(p._id) === String(activePollId)) || null,
    [polls, activePollId]
  );

  const userHasAnsweredActive = useMemo(() => {
    if (!activePoll || !name) return false;
    return !!(activePoll.answers || []).find(a => a.studentName === name);
  }, [activePoll, name]);

  const secondsLeft = useMemo(() => {
    if (!activePoll) return 0;
    const end = new Date(activePoll.createdAt).getTime() + (Number(activePoll.durationSeconds) || 0) * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / 1000));
  }, [activePoll]);

  // fetch state from server
  async function loadState() {
    try {
      const res = await fetch(`${API_URL}/api/state`);
      if (!res.ok) return;
      const data = await res.json();
      setStudents(data.students || []);
      setPolls(data.polls || []);
      setActivePollId(data.activePollId || null);
      setMessages(data.messages || []);
    } catch (e) {
      console.warn("loadState error", e);
    }
  }
  useEffect(() => { loadState(); }, []);
  useInterval(loadState, 1500);

  // actions
  async function joinAsStudent() {
    if (!name.trim()) return alert("Enter your name");
    await fetch(`${API_URL}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() })
    });
    localStorage.setItem("role", "student");
    localStorage.setItem("name", name.trim());
    setRole("student");
  }

  async function createPoll() {
    const clean = options.map(o => o.trim()).filter(Boolean);
    if (!qText.trim() || clean.length < 2) return alert("Enter a question and 2+ options");
    await fetch(`${API_URL}/api/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: qText.trim(), options: clean, durationSeconds: duration })
    });
    setQText(""); setOptions(["", ""]); setDuration(60);
  }

  async function vote(pollId, optionIndex) {
    await fetch(`${API_URL}/api/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pollId, optionIndex, studentName: name })
    });
  }

  async function kick(n) {
    await fetch(`${API_URL}/api/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n })
    });
  }

  async function sendChat() {
    if (!chatText.trim()) return;
    await fetch(`${API_URL}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || role, text: chatText.trim() })
    });
    setChatText("");
  }

  // helpers
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

  function ChatPanel() {
    return (
      <div className="chat">
        <div className="chat-list">
          {messages.map((m, i) => (
            <div key={i} className="chat-item"><b>{m.name}:</b> {m.text}</div>
          ))}
        </div>
        <div className="chat-input">
          <input
            type="text"
            className="input"
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            placeholder="Type a message…"
          />
          <button type="button" className="primary" onClick={sendChat}>Send</button>
        </div>
      </div>
    );
  }

  // pages
  function HomePage() {
    return (
      <div className="landing">
        <h1>Intervue Poll</h1>
        <p className="muted">Navigate using the top bar</p>
      </div>
    );
  }

  function StudentPage() {
    if (!name) {
      return (
        <div className="panel center-panel">
          <h2>Enter your name</h2>
          <input
            type="text"
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Rahul Bajaj"
          />
          <button type="button" className="primary" onClick={joinAsStudent}>Continue</button>
        </div>
      );
    }

    if (!activePoll) return <p className="muted">Wait for the teacher to start a poll…</p>;
    const disabled = userHasAnsweredActive || secondsLeft <= 0 || activePoll.status !== "active";
    return (
      <div className="panel">
        <div className="poll-head">
          <h3>{activePoll.question}</h3>
          <span className="timer">{secondsLeft}s</span>
        </div>
        <div className="options">
          {activePoll.options.map((opt, i) => (
            <button
              type="button"
              key={i}
              className="option"
              disabled={disabled}
              onClick={() => vote(activePoll._id, i)}
            >
              {opt}
            </button>
          ))}
        </div>
        {disabled && <ResultBars poll={activePoll} />}
        <ChatPanel />
      </div>
    );
  }

  function TeacherPage() {
    return (
      <div className="teacher">
        <div className="panel">
          <h3>Create Poll</h3>
          <textarea
            className="textarea"
            value={qText}
            onChange={e => setQText(e.target.value)}
            placeholder="Enter your question"
          />
          {options.map((opt, i) => (
            <input
              key={i}
              type="text"
              className="input"
              value={opt}
              onChange={e => {
                const arr = [...options]; arr[i] = e.target.value; setOptions(arr);
              }}
              placeholder={`Option ${i + 1}`}
            />
          ))}
          <button type="button" className="ghost" onClick={() => setOptions([...options, ""])}>+ Add option</button>
          <select className="select" value={duration} onChange={e => setDuration(Number(e.target.value))}>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={90}>90s</option>
          </select>
          <button type="button" className="primary" onClick={createPoll}>Ask Question</button>
        </div>

        <div className="panel">
          <h3>Live Results</h3>
          {activePoll ? <ResultBars poll={activePoll} /> : <p className="muted">No active poll</p>}
        </div>

        <div className="panel">
          <h3>Participants</h3>
          <ul>
            {students.map(s => (
              <li key={s}>
                {s} <button type="button" className="ghost" onClick={() => kick(s)}>Kick</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h3>Chat</h3>
          <ChatPanel />
        </div>

        <div className="panel">
          <h3>Poll History</h3>
          {polls.filter(p => p.status !== "active").map((p, i) => (
            <div key={p._id} className="history">
              <b>Q{i + 1}:</b> {p.question}
              <ResultBars poll={p} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // render
  return (
    <Router>
      <Navbar />
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/teacher" element={<TeacherPage />} />
        </Routes>
      </div>
    </Router>
  );
}
