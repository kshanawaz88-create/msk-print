export const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const decodeTokenPayload = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

export const getStoredToken = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const payload = decodeTokenPayload(token);
  if (!payload || !payload.exp || payload.exp * 1000 <= Date.now()) {
    clearSession();
    return null;
  }

  return token;
};

export const getStoredUser = () => {
  try {
    if (!getStoredToken()) return null;
    const value = localStorage.getItem("user");
    return value ? JSON.parse(value) : null;
  } catch {
    clearSession();
    return null;
  }
};

export const storeSession = (token, user) => {
  const payload = typeof token === "string" ? decodeTokenPayload(token) : null;
  if (!payload?.exp || payload.exp * 1000 <= Date.now() || !user) {
    clearSession();
    throw new Error("Login response did not contain a valid session");
  }
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
};
