// config.js
const API_URL = 
  process.env.NODE_ENV === "production"
    ? "https://live-polling-system-qjpn.onrender.com"
    : "http://localhost:3001";  // local dev server

export default API_URL;
