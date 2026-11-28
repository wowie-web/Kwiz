const KWIZ_CONFIG = {
  apiKey: "$2a$10$Ic/aZeZvv4WFS0xcic8WBeH/b3S5FKV3WH10mHlRb45c/IgMlrIVa",
  usersBinId: "6b0973441b390e1b559b4e68",
  quizzesBinId: "6b0973751b390e1b559b4eb9",
  baseUrl: "https://api.jsonbin.io/v3/b",
  sessionKey: "kwiz_active_session_v1",
  soundPrefKey: "kwiz_sound_enabled_v1",
  defaultLogo: "logo.png",
  defaultEmojiAvatar: "🧠",
  maxPoints: 100000,
  replayKeyMinPoints: 50000
};

const KWIZ_CATEGORIES = [
  "General Knowledge & Miscellaneous",
  "Entertainment & Pop Culture",
  "History & Geography",
  "Science, Math & Tech",
  "Sports & Recreation",
  "Food & Drink",
  "Language, Arts & Culture"
];

const KWIZ_RANKS = [
  { key: "rookie",      name: "Rookie",      image: "Rookie.png",      min: 0,     max: 14284,  maxReplayKeys: 0 },
  { key: "novice",      name: "Novice",      image: "Novice.png",      min: 14285, max: 28569,  maxReplayKeys: 0 },
  { key: "apprentice",  name: "Apprentice",  image: "Apprentice.png",  min: 28570, max: 42854,  maxReplayKeys: 0 },
  { key: "master",      name: "Master",      image: "Master.png",      min: 42855, max: 57139,  maxReplayKeys: 1 },
  { key: "grandmaster", name: "Grandmaster", image: "Grandmaster.png", min: 57140, max: 71424,  maxReplayKeys: 2 },
  { key: "scholar",     name: "Scholar",     image: "Scholar.png",     min: 71425, max: 85709,  maxReplayKeys: 3 },
  { key: "legend",      name: "Legend",      image: "Legend.png",      min: 85710, max: 100000, maxReplayKeys: 5 }
];

// ==================== SOUND EFFECTS (Web Audio API) ====================
let audioCtx = null;

function isSoundEnabled() {
  const saved = localStorage.getItem(KWIZ_CONFIG.soundPrefKey);
  return saved === null ? true : saved === "true";
}

function setSoundEnabled(enabled) {
  localStorage.setItem(KWIZ_CONFIG.soundPrefKey, String(Boolean(enabled)));
}

function playSound(type = "tap") {
  if (!isSoundEnabled()) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "tap") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.055);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (type === "correct") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.09); // A5
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "wrong") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(155, now + 0.22);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.09, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.23);
      });
    }
  } catch {
    // Ignore audio errors on restricted devices
  }
}

function refreshLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function normalizeEmojiAvatar(val) {
  const cleaned = String(val ?? "").trim();
  if (!cleaned) return KWIZ_CONFIG.defaultEmojiAvatar;
  if (/^https?:\/\//i.test(cleaned) || cleaned.length > 8) {
    return KWIZ_CONFIG.defaultEmojiAvatar;
  }
  return cleaned;
}

function getRankInfo(points) {
  const clamped = Math.max(0, Math.min(KWIZ_CONFIG.maxPoints, Number(points) || 0));
  const tierIndex = KWIZ_RANKS.findIndex((r, idx) =>
    idx === KWIZ_RANKS.length - 1 ? clamped >= r.min : clamped >= r.min && clamped <= r.max
  );
  const rank = KWIZ_RANKS[tierIndex >= 0 ? tierIndex : 0];
  const span = Math.max(1, rank.max - rank.min + 1);
  const progressInTier = Math.min(span - 0.0001, Math.max(0, clamped - rank.min));
  const stars = Math.min(5, Math.max(1, Math.floor((progressInTier / span) * 5) + 1));

  const qualifiesForKeys = clamped >= KWIZ_CONFIG.replayKeyMinPoints;
  const maxKeysForRank = qualifiesForKeys ? rank.maxReplayKeys : 0;

  return {
    ...rank,
    tierIndex: tierIndex >= 0 ? tierIndex : 0,
    points: clamped,
    stars,
    qualifiesForKeys,
    maxKeysForRank
  };
}

function getAvailableReplayKeys(userRecord) {
  const pts = Number(userRecord?.stats?.totalScore) || 0;
  const info = getRankInfo(pts);
  if (!info.qualifiesForKeys || info.maxReplayKeys <= 0) return 0;
  const usedKeys = Number(userRecord?.replayKeysUsed) || 0;
  return Math.max(0, info.maxReplayKeys - usedKeys);
}

function hasCompletedQuiz(userRecord, quizId) {
  const hist = Array.isArray(userRecord?.history) ? userRecord.history : [];
  return hist.some((h) => h.quizId === quizId);
}

function renderStarsText(stars) {
  const count = Math.min(5, Math.max(1, Number(stars) || 1));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

async function readBin(binId) {
  const res = await fetch(`${KWIZ_CONFIG.baseUrl}/${binId}/latest`, {
    method: "GET",
    headers: {
      "X-Master-Key": KWIZ_CONFIG.apiKey,
      "X-Bin-Meta": "false"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to read bin (${res.status})`);
  }
  return await res.json();
}

async function writeBin(binId, payload) {
  const res = await fetch(`${KWIZ_CONFIG.baseUrl}/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": KWIZ_CONFIG.apiKey
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to save to bin (${res.status})`);
  }
  return await res.json();
}

async function sha256Hex(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setSessionUser(userObj) {
  const safeSession = {
    id: userObj.id,
    fullName: userObj.fullName || userObj.username,
    username: userObj.username,
    birthdate: userObj.birthdate || "",
    role: userObj.role || (userObj.username === "admin" ? "admin" : "user"),
    avatar: normalizeEmojiAvatar(userObj.avatar),
    bio: userObj.bio || "",
    replayKeysUsed: Number(userObj.replayKeysUsed) || 0,
    stats: userObj.stats || { quizzesPlayed: 0, quizzesCreated: 0, totalScore: 0 },
    history: Array.isArray(userObj.history) ? userObj.history : [],
    loggedInAt: new Date().toISOString()
  };
  localStorage.setItem(KWIZ_CONFIG.sessionKey, JSON.stringify(safeSession));
  return safeSession;
}

function getSessionUser() {
  try {
    const raw = localStorage.getItem(KWIZ_CONFIG.sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSessionUser() {
  localStorage.removeItem(KWIZ_CONFIG.sessionKey);
}

function requireAuth() {
  const user = getSessionUser();
  if (!user || !user.id) {
    window.location.replace("auth.html");
    return null;
  }
  return user;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function applyEventBranding(logoImgElement, existingQuizzesBinData = null) {
  const fallbackLogo = KWIZ_CONFIG.defaultLogo;
  if (logoImgElement) {
    logoImgElement.src = fallbackLogo;
  }
  document.body.dataset.theme = "default";

  try {
    const binData = existingQuizzesBinData || (await readBin(KWIZ_CONFIG.quizzesBinId));
    const ev = binData && binData.activeEvent;
    if (!ev || !ev.isActive) return null;

    const now = Date.now();
    const endsAtMs = ev.endsAt ? new Date(ev.endsAt).getTime() : 0;

    if (endsAtMs && now > endsAtMs) {
      binData.activeEvent = {
        ...ev,
        isActive: false,
        theme: "default",
        logoUrl: "",
        iconUrl: ""
      };
      await writeBin(KWIZ_CONFIG.quizzesBinId, binData);
      document.body.dataset.theme = "default";
      if (logoImgElement) logoImgElement.src = fallbackLogo;
      return null;
    }

    if (ev.theme) {
      document.body.dataset.theme = ev.theme;
    }
    if (logoImgElement && ev.logoUrl) {
      logoImgElement.src = ev.logoUrl;
      logoImgElement.onerror = () => {
        logoImgElement.src = fallbackLogo;
      };
    }
    return ev;
  } catch {
    return null;
  }
}

function renderBottomNav(activePage, user, eventIconUrl = "") {
  const nav = document.getElementById("bottomNav");
  if (!nav) return;

  const isAdmin =
    Boolean(user) &&
    (user.role === "admin" || String(user.username || "").trim().toLowerCase() === "admin");

  const items = [
    { key: "home",    label: "Home",    href: "index.html",   icon: "home" },
    { key: "create",  label: "Create",  href: "quiz.html",    icon: "plus-circle" },
    { key: "rank",    label: "Rank",    href: "rank.html",    icon: "trophy" },
    { key: "profile", label: "Profile", href: "profile.html", icon: "user" }
  ];

  if (isAdmin) {
    items.push({
      key: "admin",
      label: "Admin",
      href: "admin.html",
      icon: "shield"
    });
  }

  nav.style.display = "flex";
  nav.innerHTML = items
    .map((item) => {
      const iconHtml =
        item.key === "home" && eventIconUrl
          ? `<img src="${escapeHtml(eventIconUrl)}" alt="Event" onerror="this.style.display='none'" />`
          : `<i data-lucide="${item.icon}"></i>`;
      return `
        <a href="${item.href}" class="nav-item ${activePage === item.key ? "active" : ""}" onclick="playSound('tap')">
          ${iconHtml}
          <span>${item.label}</span>
        </a>
      `;
    })
    .join("");

  refreshLucideIcons();
}
