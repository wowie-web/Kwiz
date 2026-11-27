const KWIZ_CONFIG = {
  apiKey: "$2a$10$Ic/aZeZvv4WFS0xcic8WBeH/b3S5FKV3WH10mHlRb45c/IgMlrIVa",
  usersBinId: "6b0973441b390e1b559b4e68",
  quizzesBinId: "6b0973751b390e1b559b4eb9",
  baseUrl: "https://api.jsonbin.io/v3/b",
  sessionKey: "kwiz_active_session_v1",
  defaultLogo: "logo.png"
};

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
    stats: userObj.stats || { quizzesPlayed: 0, quizzesCreated: 0, totalScore: 0 },
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

// Applies event branding if an event is active and hasn't expired; resets if expired
async function applyEventBranding(logoImgElement) {
  const fallbackLogo = KWIZ_CONFIG.defaultLogo;
  if (logoImgElement) {
    logoImgElement.src = fallbackLogo;
  }
  document.body.dataset.theme = "default";

  try {
    const binData = await readBin(KWIZ_CONFIG.quizzesBinId);
    const ev = binData && binData.activeEvent;
    if (!ev || !ev.isActive) return;

    const now = Date.now();
    const endsAtMs = ev.endsAt ? new Date(ev.endsAt).getTime() : 0;

    if (endsAtMs && now > endsAtMs) {
      // Event expired -> reset back to default automatically
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
      return;
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
  } catch {
    // Keep default theme and local logo.png if offline or bin not yet populated
  }
}
