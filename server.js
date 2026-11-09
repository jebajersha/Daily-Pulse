require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const Parser = require("rss-parser");

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser({ timeout: 12000 });
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "digests.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readDigests() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function writeDigests(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items.slice(0, 100), null, 2));
}

const feeds = [
  { category: "Technology", url: "https://feeds.feedburner.com/TechCrunch/" },
  { category: "Artificial Intelligence", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { category: "Science", url: "https://www.sciencedaily.com/rss/top/science.xml" },
  { category: "Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { category: "World News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { category: "Education", url: "https://www.theguardian.com/education/rss" }
];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "DAILY PULSE", aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

app.get("/api/news", async (_req, res) => {
  const results = await Promise.allSettled(feeds.map(async feed => {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 7).map(item => ({
      title: item.title || "Untitled story",
      summary: (item.contentSnippet || item.content || "").replace(/<[^>]*>/g, "").slice(0, 240),
      link: item.link || "",
      source: parsed.title || feed.category,
      category: feed.category,
      date: item.isoDate || item.pubDate || null,
      image: item.enclosure && item.enclosure.url ? item.enclosure.url : ""
    }));
  }));
  const articles = results.filter(r => r.status === "fulfilled").flatMap(r => r.value);
  if (!articles.length) return res.status(503).json({ error: "Live news feeds are temporarily unavailable." });
  res.json({ articles });
});

app.get("/api/weather", async (req, res) => {
  const city = String(req.query.city || "Madurai").slice(0, 80);
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error("Location lookup failed");
    const geo = await geoRes.json();
    if (!geo.results || !geo.results.length) return res.status(404).json({ error: "Location not found." });
    const place = geo.results[0];
    const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`);
    if (!wxRes.ok) throw new Error("Weather service unavailable");
    const wx = await wxRes.json();
    res.json({ location: `${place.name}${place.admin1 ? ", " + place.admin1 : ""}`, current: wx.current, daily: wx.daily });
  } catch (e) { res.status(502).json({ error: e.message || "Weather is unavailable right now." }); }
});

app.get("/api/digests", (_req, res) => res.json({ digests: readDigests() }));

app.post("/api/digests", (req, res) => {
  const { title, content } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "Digest content is required." });
  const items = readDigests();
  const item = { id: Date.now().toString(), title: String(title || "Daily briefing").slice(0, 100), content: content.slice(0, 12000), createdAt: new Date().toISOString() };
  items.unshift(item);
  writeDigests(items);
  res.status(201).json({ digest: item });
});

app.delete("/api/digests/:id", (req, res) => {
  writeDigests(readDigests().filter(d => d.id !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/assistant", async (req, res) => {
  const question = String(req.body.question || "").trim().slice(0, 1500);
  const context = String(req.body.context || "").slice(0, 5000);
  if (!question) return res.status(400).json({ error: "Please enter a question." });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      mode: "demo",
      answer: demoAnswer(question, context)
    });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Daily Pulse, a concise and helpful personal productivity assistant. Use only the user context provided for personal tasks. If data is missing, say so. Do not invent weather, news, calendar events, or tasks." },
          { role: "user", content: `User context:\n${context}\n\nQuestion: ${question}` }
        ],
        temperature: 0.5
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI provider request failed.");
    res.json({ mode: "live", answer: data.choices?.[0]?.message?.content || "I couldn't create a response." });
  } catch (e) { res.status(502).json({ error: e.message || "AI assistant is unavailable." }); }
});

function demoAnswer(question, context) {
  const q = question.toLowerCase();
  if (q.includes("task") || q.includes("focus") || q.includes("plan")) {
    return "Here’s a simple plan: 1) Choose your most important task and work on it for 25 minutes. 2) Handle quick tasks together. 3) Take a short break and review what remains. Add your tasks in the Tasks section so I can use your saved list. (Demo mode: add an AI API key for personalized AI responses.)";
  }
  if (q.includes("news") || q.includes("headline")) return "Open the News section to load current headlines from connected RSS feeds. I won't invent breaking news. (Demo mode: add an AI API key for AI-powered summaries.)";
  if (q.includes("event") || q.includes("calendar")) return "Your upcoming events are shown in the Calendar section. Add an event there and I can help you plan around it. (Demo mode: add an AI API key for personalized responses.)";
  return "I’m your Daily Pulse assistant. I can help organize your day, prioritize tasks, and explain your digest. Add your tasks and events to the dashboard for better context. (Demo mode: configure OPENAI_API_KEY on the server to enable live AI responses.)";
}

async function scheduledDigest() {
  const now = new Date();
  const title = `Daily Pulse — ${now.toLocaleDateString("en-IN")}`;
  const content = `Good morning! Here is your scheduled Daily Pulse reminder for ${now.toLocaleDateString("en-IN")}. Open your dashboard to review your tasks, news, weather and calendar.`;
  const items = readDigests();
  items.unshift({ id: Date.now().toString(), title, content, createdAt: now.toISOString(), scheduled: true });
  writeDigests(items);
  console.log("Scheduled Daily Pulse digest saved.");
}
const digestTime = process.env.DIGEST_TIME || "08:00";
if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(digestTime)) {
  const [hour, minute] = digestTime.split(":");
  cron.schedule(`${minute} ${hour} * * *`, scheduledDigest, {
    timezone: process.env.APP_TIMEZONE || "Asia/Kolkata"
  });
}

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`DAILY PULSE is running at http://localhost:${PORT}`));
