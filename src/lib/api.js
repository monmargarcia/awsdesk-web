const base = "";

async function req(path, opts = {}) {
  const r = await fetch(base + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  login: (username, password) =>
    req("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  accounts: () => req("/api/v1/accounts"),
  ecs: (id) => req(`/api/v1/accounts/${id}/ecs/services`),
  rds: (id) => req(`/api/v1/accounts/${id}/rds/instances`),
  alarms: (id) => req(`/api/v1/accounts/${id}/cloudwatch/alarms`),
  secrets: (id) => req(`/api/v1/accounts/${id}/secrets`),
  topology: (id) => req(`/api/v1/accounts/${id}/topology`),
  logGroups: (id) => req(`/api/v1/accounts/${id}/logs/groups`),
  logQuery: (id, body) =>
    req(`/api/v1/accounts/${id}/logs/query`, { method: "POST", body: JSON.stringify(body) }),
  logMetrics: (id, logGroupName, startTime, endTime) =>
    req(`/api/v1/accounts/${id}/logs/metrics?logGroupName=${encodeURIComponent(logGroupName)}&startTime=${startTime}&endTime=${endTime}`),
};
