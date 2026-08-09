import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import { C, mono } from "../lib/theme.js";
import Spark from "../components/Spark.jsx";

const LEVEL_COLOR = { INFO: C.green, WARN: C.amber, ERROR: C.red, DEBUG: C.faint };
const RANGE_PRESETS = [
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "3h", ms: 3 * 60 * 60_000 },
  { label: "24h", ms: 24 * 60 * 60_000 },
];

export default function LogsPage({ accountId }) {
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState("");
  const [group, setGroup] = useState("");
  const [subTab, setSubTab] = useState("tail");

  useEffect(() => {
    setGroups([]); setGroup(""); setGroupsError("");
    api.logGroups(accountId)
      .then((r) => { setGroups(r.groups); if (r.groups[0]) setGroup(r.groups[0].name); })
      .catch((e) => setGroupsError(e.message));
  }, [accountId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <select value={group} onChange={(e) => setGroup(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
            padding: "7px 10px", fontSize: 13, ...mono, minWidth: 240 }}>
          {groups.length === 0 && <option value="">No log groups</option>}
          {groups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[["tail", "Live tail"], ["search", "Search"]].map(([key, label]) => (
            <button key={key} onClick={() => setSubTab(key)} style={{
              background: subTab === key ? C.card : "none",
              border: `1px solid ${subTab === key ? C.border : "transparent"}`,
              borderRadius: 6, color: subTab === key ? C.text : C.dim, padding: "6px 12px",
              fontSize: 13, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {groupsError && <div style={{ color: C.red, fontSize: 13 }}>Couldn't load log groups: {groupsError}</div>}
      {!groupsError && groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "70px 0", color: C.faint }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⬡</div>
          No log groups in this account
        </div>
      )}

      {!groupsError && group && subTab === "tail" && <LiveTail accountId={accountId} group={group} />}
      {!groupsError && group && subTab === "search" && <Search accountId={accountId} group={group} />}
    </div>
  );
}

function LiveTail({ accountId, group }) {
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const boxRef = useRef(null);

  // Reset history only when the user actually changes what they're tailing —
  // not on every reconnect (see effect below).
  useEffect(() => {
    setLines([]);
    setReconnectNonce(0);
  }, [accountId, group, filter]);

  useEffect(() => {
    setConnected(false);
    const url = `/api/v1/accounts/${accountId}/logs/tail?logGroupName=${encodeURIComponent(group)}` +
      (filter ? `&filter=${encodeURIComponent(filter)}` : "");
    const es = new EventSource(url, { withCredentials: true });
    let cleanedUp = false;
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setLines((prev) => [...prev.slice(-499), event]);
    };
    es.onerror = () => {
      // Vercel serverless functions have a hard execution time limit, so this stream
      // gets force-closed periodically — that's expected, not a real failure, so we
      // transparently reconnect instead of surfacing a dead-end error.
      setConnected(false);
      es.close();
      if (!cleanedUp) setTimeout(() => setReconnectNonce((n) => n + 1), 1000);
    };
    return () => { cleanedUp = true; es.close(); };
  }, [accountId, group, filter, reconnectNonce]);

  useEffect(() => {
    if (paused || !boxRef.current) return;
    boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines, paused]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <input placeholder="Filter (plain text)" value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
            padding: "8px 10px", fontSize: 13, outline: "none", ...mono }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: connected ? C.green : C.faint }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? C.green : C.faint }} />
          {connected ? "live" : "connecting…"}
        </span>
      </div>
      <div ref={boxRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        style={{ height: 520, overflowY: "auto", background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 14px" }}>
        {lines.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>Waiting for log events…</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 12, ...mono,
            borderBottom: `1px solid ${C.border}22` }}>
            <span style={{ color: C.faint, flexShrink: 0 }}>{l.timestamp?.slice(11, 23) ?? ""}</span>
            <span style={{ color: LEVEL_COLOR[l.level] ?? C.dim, flexShrink: 0, width: 44 }}>{l.level}</span>
            <span style={{ color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Search({ accountId, group }) {
  const [range, setRange] = useState("1h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [level, setLevel] = useState("ALL");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const timeBounds = useCallback(() => {
    if (range === "custom") {
      return {
        startTime: customStart ? new Date(customStart).getTime() : Date.now() - 3600_000,
        endTime: customEnd ? new Date(customEnd).getTime() : Date.now(),
      };
    }
    const preset = RANGE_PRESETS.find((p) => p.label === range) ?? RANGE_PRESETS[1];
    return { startTime: Date.now() - preset.ms, endTime: Date.now() };
  }, [range, customStart, customEnd]);

  const run = useCallback(async () => {
    setLoading(true); setError("");
    const { startTime, endTime } = timeBounds();
    try {
      const [q, m] = await Promise.all([
        api.logQuery(accountId, { logGroupName: group, startTime, endTime, search: search || undefined, level }),
        api.logMetrics(accountId, group, startTime, endTime),
      ]);
      setRows(q.rows);
      setSeries(m.series);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [accountId, group, search, level, timeBounds]);

  // intentionally scoped to account/group only — search runs on button click / Enter, not on every keystroke
  useEffect(() => { run(); }, [accountId, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const errorSeries = series.map((s) => s.errors);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[...RANGE_PRESETS.map((p) => p.label), "custom"].map((r) => (
            <button key={r} onClick={() => setRange(r)} style={{
              background: range === r ? C.card : "none", border: `1px solid ${range === r ? C.border : "transparent"}`,
              borderRadius: 6, color: range === r ? C.text : C.dim, padding: "6px 10px", fontSize: 12, cursor: "pointer",
            }}>{r}</button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 8px", fontSize: 12 }} />
            <span style={{ color: C.faint }}>→</span>
            <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 8px", fontSize: 12 }} />
          </>
        )}
        <select value={level} onChange={(e) => setLevel(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 12 }}>
          {["ALL", "INFO", "WARN", "ERROR"].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input placeholder="Search text…" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          style={{ flex: 1, minWidth: 160, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.text, padding: "7px 10px", fontSize: 13, outline: "none" }} />
        <button onClick={run} style={{ background: C.green, color: "#04120d", border: "none", borderRadius: 6,
          padding: "7px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Search</button>
      </div>

      {series.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>Error rate</div>
          <Spark data={errorSeries} color={C.red} height={36} />
        </div>
      )}

      {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {loading && <div style={{ color: C.faint, fontSize: 13 }}>Searching…</div>}

      {!loading && !error && (
        rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: C.faint }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⬡</div>
            No log events match
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "8px 14px", fontSize: 12, ...mono,
                borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.border}` }}>
                <span style={{ color: C.faint, flexShrink: 0, width: 150 }}>{r.timestamp}</span>
                <span style={{ color: LEVEL_COLOR[r.level] ?? C.dim, flexShrink: 0, width: 44 }}>{r.level}</span>
                <span style={{ color: C.text, flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.message}</span>
                {r.requestId && <span style={{ color: C.faint, flexShrink: 0 }}>{r.requestId}</span>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
