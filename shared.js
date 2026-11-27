const KWIZ_CONFIG = {
  apiKey: "$2a$10$Ic/aZeZvv4WFS0xcic8WBeH/b3S5FKV3WH10mHlRb45c/IgMlrIVa",
  usersBinId: "6b0973441b390e1b559b4e68",
  quizzesBinId: "6b0973751b390e1b559b4eb9",
  baseUrl: "https://api.jsonbin.io/v3/b",
  sessionKey: "kwiz_active_session_v1",
  defaultLogo: "logo.png",
  maxPoints: 100000,
  replayKeyMinPoints: 50000
};

// Ascending rank ladder from 0 to 100,000 points (each tier has 5 stars)
const KWIZ_RANKS = [
  { key: "rookie",     name: "Rookie",     image: "Rookie.png",     min: 0,     max: 14284,  maxReplayKeys: 0 },
  { key: "novice",     name: "Novice",     image: "Novice.png",     min: 14285, max: 28569,  maxReplayKeys: 0 },
  { key: "apprentice", name: "Apprentice", image: "Apprentice.png", min: 28570, max: 42854,  maxReplayKeys: 0 },
  { key: "master",     name: "Master",     image: "Master.png",     min: 42855, max: 57139,  maxReplayKeys: 1 },
  { key: "grandmaster",name: "Grandmaster",image: "Grandmaster.png",min: 57140, max: 71424,  maxReplayKeys: 2 },
  { key: "scholar",    name: "Scholar",    image: "Scholar.png",    min: 71425, max: 85709,  maxReplayKeys: 3 },
  { key: "legend",     name: "Legend",     image: "Legend.png",     min: 85710, max: 100000, maxReplayKeys: 5 }
];

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
  if (!info.qualifiesForKeys || info.maxKeysForRank <= 0) return 0;
  const usedKeys = Number(userRecord?.replayKeysUsed) || 0;
  return Math.max(0, info.maxKeysForRank - usedKeys);
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
    avatar: userObj.avatar || "🧠",
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

  const isAdmin = user && (user.role === "admin" || (user.username || "").toLowerCase() === "admin");

  const items = [
    {
      key: "home",
      label: "Home",
      href: "index.html",
      svg: `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`
    },
    {
      key: "create",
      label: "Create",
      href: "quiz.html",
      svg: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`
    },
    {
      key: "rank",
      label: "Rank",
      href: "rank.html",
      svg: `<svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`
    },
    {
      key: "profile",
      label: "Profile",
      href: "profile.html",
      svg: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    }
  ];

  if (isAdmin) {
    items.push({
      key: "admin",
      label: "Admin",
      href: "admin.html",
      svg: `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
    });
  }

  nav.innerHTML = items
    .map((item) => {
      const iconMarkup =
        item.key === "home" && eventIconUrl
          ? `<img src="${escapeHtml(eventIconUrl)}" alt="" onerror="this.style.display='none'" />`
          : item.svg;
      return `
        <a href="${item.href}" class="nav-item ${activePage === item.key ? "active" : ""}">
          ${iconMarkup}
          <span>${item.label}</span>
        </a>
      `;
    })
    .join("");
}
