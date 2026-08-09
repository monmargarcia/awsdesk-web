import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api.js";
import { C, mono } from "./lib/theme.js";
import LogsPage from "./pages/Logs.jsx";

const Dot = ({ ok }) => (
  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: ok ? C.green : C.red, flexShrink: 0,
    boxShadow: `0 0 6px ${ok ? "rgba(0,200,150,.5)" : "rgba(245,69,92,.5)"}` }} />
);

function Login({ onDone }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    try {
      await api.login(u, p);
      onDone();
    } catch (e) {
      setErr(e.message === "unauthorized" ? "Invalid credentials" : `Couldn't reach the server: ${e.message}`);
    }
  };
  const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 6, color: C.text, padding: "10px 12px", fontSize: 14, marginBottom: 10, outline: "none" };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg }}>
      <div style={{ width: 320, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: C.green, display: "grid",
            placeItems: "center", color: "#04120d", fontWeight: 800, fontSize: 13 }}>◆</div>
          <span style={{ color: C.text, fontWeight: 600, fontSize: 16 }}>AWSDesk</span>
        </div>
        <input style={inp} placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} />
        <input style={inp} placeholder="Password" type="password" value={p}
          onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button onClick={submit} style={{ width: "100%", background: C.green, color: "#04120d", border: "none",
          borderRadius: 6, padding: 10, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Sign in</button>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState(null);
  const [tab, setTab] = useState("ECS");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acctError, setAcctError] = useState("");

  useEffect(() => {
    if (!authed) return;
    setAcctError("");
    api.accounts().then((r) => {
      setAccounts(r.accounts);
      if (r.accounts[0]) setAccount(r.accounts[0]);
    }).catch((e) => {
      if (e.message === "unauthorized") { setAuthed(false); return; }
      setAcctError(e.message);
    });
  }, [authed]);

  const load = useCallback(async () => {
    if (!account || tab === "Logs") return;
    setLoading(true); setError(""); setData(null);
    try {
      const fn = { ECS: api.ecs, RDS: api.rds, CloudWatch: api.alarms, Secrets: api.secrets, Topology: api.topology }[tab];
      setData(await fn(account.id));
    } catch (e) { setError(String(e.message)); }
    setLoading(false);
  }, [account, tab]);

  useEffect(() => { load(); }, [load]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const rows =
    tab === "ECS" ? (data?.services ?? []).map((s) => ({ ok: s.running === s.desired, name: s.name, sub: `${s.running}/${s.desired} tasks · ${s.cluster} · ${s.launchType ?? ""}` }))
    : tab === "RDS" ? (data?.instances ?? []).map((d) => ({ ok: d.status === "available", name: d.name, sub: `${d.engine} · ${d.class} · ${d.storageGb} GB` }))
    : tab === "CloudWatch" ? (data?.alarms ?? []).map((a) => ({ ok: a.state === "OK", name: a.name, sub: `${a.namespace}/${a.metric} · ${a.state}` }))
    : tab === "Secrets" ? (data?.secrets ?? []).map((s) => ({ ok: true, name: s.name, sub: s.lastRotated ? `rotated ${new Date(s.lastRotated).toLocaleDateString()}` : "never rotated" }))
    : [];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter,-apple-system,sans-serif", fontSize: 14 }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", height: 54, gap: 14, maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: C.green, display: "grid", placeItems: "center", color: "#04120d", fontWeight: 800, fontSize: 12 }}>◆</div>
            <span style={{ fontWeight: 600, fontSize: 15 }}>AWSDesk</span>
          </div>
          <span style={{ color: "#2a3648" }}>/</span>
          <select value={account?.id ?? ""} onChange={(e) => setAccount(accounts.find((a) => a.id === e.target.value))}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 13 }}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={load} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>↻ Refresh</button>
        </div>
        <div style={{ display: "flex", maxWidth: 1100, margin: "0 auto" }}>
          {["ECS", "RDS", "CloudWatch", "Logs", "Secrets", "Topology"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", padding: "10px 2px",
              marginRight: 24, cursor: "pointer", fontSize: 13,
              color: tab === t ? C.text : C.dim, fontWeight: tab === t ? 500 : 400,
              borderBottom: tab === t ? `2px solid ${C.green}` : "2px solid transparent" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {acctError && (
          <div style={{ color: C.red, fontSize: 13, border: `1px solid ${C.red}66`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
            Couldn't load accounts: {acctError}
          </div>
        )}
        {!acctError && loading && <div style={{ color: C.faint }}>Loading {tab} from {account?.name}…</div>}
        {!acctError && error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}

        {!acctError && !loading && !error && tab !== "Topology" && tab !== "Logs" && (
          rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 0", color: C.faint }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⬡</div>
              Nothing here in {account?.name}
            </div>
          ) : rows.map((r, i) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
              border: `1px solid ${C.border}`, borderBottom: i === rows.length - 1 ? `1px solid ${C.border}` : "none",
              borderRadius: i === 0 ? "8px 8px 0 0" : i === rows.length - 1 ? "0 0 8px 8px" : 0 }}>
              <Dot ok={r.ok} />
              <span style={{ ...mono, fontSize: 13, fontWeight: 500 }}>{r.name}</span>
              <span style={{ fontSize: 12, color: C.faint }}>{r.sub}</span>
            </div>
          ))
        )}

        {!acctError && !loading && !error && tab === "Topology" && data?.nodes && (
          <TopologyView nodes={data.nodes} />
        )}

        {!acctError && tab === "Logs" && account && <LogsPage accountId={account.id} />}

        {tab === "Secrets" && !loading && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.faint }}>
            🔒 Values are never retrievable — the role has no GetSecretValue permission.
          </div>
        )}
      </div>
    </div>
  );
}

function TopologyView({ nodes }) {
  const vpcs = nodes.filter((n) => n.type === "vpc");
  return (
    <div>
      {vpcs.map((vpc) => {
        const subnets = nodes.filter((n) => n.type === "subnet" && n.parentId === vpc.id);
        return (
          <div key={vpc.id} style={{ border: "1px dashed #2a3648", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ ...mono, fontSize: 12, color: C.dim, marginBottom: 12 }}>
              {vpc.label} · {vpc.meta.cidr}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
              {subnets.map((s) => {
                const pub = s.meta.visibility === "public";
                const children = nodes.filter((n) => n.parentId === s.id);
                return (
                  <div key={s.id} style={{ border: `1px solid ${pub ? "#00C89633" : "#4f9cf933"}`,
                    background: pub ? "#00C8960d" : "#4f9cf90d", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11, color: pub ? C.green : C.blue, marginBottom: 4 }}>
                      {pub ? "Public" : "Private"} · {s.meta.cidr}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>{s.meta.az}</div>
                    {children.map((c) => (
                      <div key={c.id} style={{ ...mono, fontSize: 11, background: C.bg,
                        border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 8px",
                        marginBottom: 6, color: "#c8d0dc" }}>⬡ {c.label}</div>
                    ))}
                    {children.length === 0 && <div style={{ fontSize: 11, color: "#2a3648" }}>empty</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {vpcs.length === 0 && <div style={{ color: C.faint }}>No VPCs found in this account.</div>}
    </div>
  );
}
