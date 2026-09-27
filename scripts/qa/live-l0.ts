import fs from "node:fs/promises";
import path from "node:path";

type Status = "PASS" | "FAIL" | "NEEDS_EVIDENCE";
type Result = { id: string; status: Status; detail: string; evidence?: unknown };

const rawBase = process.env.PESANPRO_QA_BASE_URL ?? process.argv[2];
if (!rawBase) {
  console.error("Usage: PESANPRO_QA_BASE_URL=https://example.com npm run qa:live:l0");
  process.exit(2);
}

const base = new URL(rawBase);
const results: Result[] = [];
const add = (id: string, status: Status, detail: string, evidence?: unknown) => results.push({ id, status, detail, evidence });

async function fetchText(pathname: string, init: RequestInit = {}) {
  const url = new URL(pathname, base);
  const response = await fetch(url, { redirect: "manual", ...init });
  return { response, body: await response.text(), url: url.toString() };
}

try {
  const root = await fetchText("/");
  add("L0-01", root.response.status === 200 ? "PASS" : "FAIL", `GET / -> HTTP ${root.response.status}`);

  const insecureAssets = [...root.body.matchAll(/(?:src|href)=["'](http:\/\/[^"']+)["']/gi)].map((match) => match[1]);
  if (base.protocol !== "https:") {
    add("L0-02", "FAIL", "QA base URL is not HTTPS");
  } else if (root.response.status === 200 && insecureAssets.length === 0) {
    add("L0-02", "PASS", "HTTPS request succeeded and rendered HTML has no obvious http:// src/href assets");
  } else {
    add("L0-02", "NEEDS_EVIDENCE", "TLS request completed, but browser mixed-content console still requires a controlled browser check", insecureAssets);
  }
} catch (error) {
  add("L0-01", "FAIL", "Domain could not be fetched", String(error));
  add("L0-02", "FAIL", "HTTPS/TLS request failed", String(error));
}

for (const [id, pathname] of [
  ["L0-03", "/api/health/live"],
  ["L0-04", "/api/health/ready"],
] as const) {
  try {
    const { response, body } = await fetchText(pathname);
    add(id, response.status === 200 ? "PASS" : "FAIL", `GET ${pathname} -> HTTP ${response.status}`, body.slice(0, 1000));
  } catch (error) {
    add(id, "FAIL", `GET ${pathname} failed`, String(error));
  }
}

try {
  const { response, body } = await fetchText("/api/health");
  if (response.status === 200) add("L0-05", "PASS", "GET /api/health -> HTTP 200", body.slice(0, 1000));
  else if (response.status === 401 || response.status === 403) add("L0-05", "NEEDS_EVIDENCE", `/api/health is protected (HTTP ${response.status}); rerun with an authenticated controlled probe`);
  else add("L0-05", "FAIL", `GET /api/health -> HTTP ${response.status}`, body.slice(0, 1000));
} catch (error) {
  add("L0-05", "FAIL", "GET /api/health failed", String(error));
}

for (const [id, pathname] of [["L0-13", "/terms"], ["L0-14", "/privacy"]] as const) {
  try {
    const { response } = await fetchText(pathname);
    add(id, response.status === 200 ? "PASS" : "FAIL", `GET ${pathname} -> HTTP ${response.status}`);
  } catch (error) {
    add(id, "FAIL", `GET ${pathname} failed`, String(error));
  }
}

try {
  const { response } = await fetchText(`/__chatgpt_qa_missing_${Date.now()}`);
  if (response.status === 404) add("L0-15", "PASS", "Unknown route returns HTTP 404");
  else if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) add("L0-15", "NEEDS_EVIDENCE", `Unknown route is gated before 404 (HTTP ${response.status}); verify custom 404 after authenticated navigation`);
  else add("L0-15", "FAIL", `Unknown route returned HTTP ${response.status}`);
} catch (error) {
  add("L0-15", "FAIL", "Unknown-route probe failed", String(error));
}

for (const [id, detail] of [
  ["L0-06", "Controlled application restart requires VPS/process access"],
  ["L0-07", "Controlled worker restart requires VPS/process access"],
  ["L0-08", "WhatsApp socket/session recovery requires a real connected WA session"],
  ["L0-09", "Browser console needs a real browser session"],
  ["L0-10", "Dashboard network inspection needs an authenticated browser session"],
  ["L0-11", "Dashboard refresh stability needs an authenticated browser session"],
  ["L0-12", "Direct dashboard URL checks need an authenticated browser session"],
  ["L0-16", "Error-boundary validation needs a controlled browser-side fault"],
] as const) add(id, "NEEDS_EVIDENCE", detail);

results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
for (const result of results) console.log(`${result.id} ${result.status} - ${result.detail}`);

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: base.origin,
  pass: results.filter((result) => result.status === "PASS").length,
  fail: results.filter((result) => result.status === "FAIL").length,
  needsEvidence: results.filter((result) => result.status === "NEEDS_EVIDENCE").length,
  results,
};
await fs.mkdir(path.join(process.cwd(), "artifacts", "qa"), { recursive: true });
const output = path.join(process.cwd(), "artifacts", "qa", "l0-report.json");
await fs.writeFile(output, JSON.stringify(summary, null, 2));
console.log(`Report: ${output}`);
if (summary.fail > 0) process.exitCode = 1;
