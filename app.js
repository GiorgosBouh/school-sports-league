import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SPORTS = {
  basketball: "Καλαθοσφαίριση",
  volleyball: "Πετοσφαίριση",
  handball: "Χειροσφαίριση",
  badminton: "Αντιπτέριση",
  football: "Ποδόσφαιρο"
};
const PLACEMENT_POINTS = [10, 7, 5, 3];
const $id = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

let data = { season: "2026–2027", teams: [], matches: [] };
let activeSport = "basketball";
let supabase = null;
let currentUser = null;
const config = window.SSL_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") && !String(config.supabaseAnonKey || "").startsWith("YOUR_");

if (configured) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
} else {
  $id("setupBanner").hidden = false;
}

const teamById = (id) => data.teams.find((team) => team.id === id);

async function loadDemoData() {
  try {
    const response = await fetch("data/league-data.json", { cache: "no-store" });
    const demo = await response.json();
    data = { season: demo.season || data.season, teams: demo.teams || [], matches: demo.matches || [] };
  } catch (error) {
    console.warn("Δεν ήταν δυνατή η φόρτωση των ενδεικτικών δεδομένων.", error);
  }
}

async function fetchOnlineData(showError = true) {
  if (!supabase) { await loadDemoData(); renderAll(); return; }
  const [{ data: teams, error: teamsError }, { data: matches, error: matchesError }] = await Promise.all([
    supabase.from("teams").select("id,name,color,created_at").order("created_at"),
    supabase.from("matches").select("id,sport,match_date,match_time,home,away,home_score,away_score,status,created_at").order("match_date").order("match_time")
  ]);
  if (teamsError || matchesError) {
    console.error(teamsError || matchesError);
    if (showError) showToast("Δεν ήταν δυνατή η φόρτωση της online βάσης.");
    return;
  }
  data.teams = teams || [];
  data.matches = (matches || []).map((match) => ({
    id: match.id, sport: match.sport, date: match.match_date,
    time: String(match.match_time || "").slice(0, 5), home: match.home, away: match.away,
    homeScore: match.home_score, awayScore: match.away_score, status: match.status
  }));
  renderAll();
}

async function initialize() {
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    currentUser = sessionData.session?.user || null;
    supabase.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; });
  }
  await fetchOnlineData(false);
  registerWebMcpTools();
}

function standingsFor(sport) {
  const rows = data.teams.map((team) => ({ team, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, diff: 0, points: 0 }));
  const map = Object.fromEntries(rows.map((row) => [row.team.id, row]));
  data.matches.filter((match) => match.sport === sport && match.status === "completed").forEach((match) => {
    const home = map[match.home]; const away = map[match.away];
    if (!home || !away || match.homeScore === null || match.awayScore === null) return;
    const hs = Number(match.homeScore); const as = Number(match.awayScore);
    home.played++; away.played++; home.for += hs; home.against += as; away.for += as; away.against += hs;
    if (hs > as) { home.won++; away.lost++; home.points += 3; }
    else if (hs < as) { away.won++; home.lost++; away.points += 3; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  });
  rows.forEach((row) => { row.diff = row.for - row.against; });
  return rows.sort((a, b) => b.points - a.points || b.diff - a.diff || b.for - a.for || a.team.name.localeCompare(b.team.name, "el"));
}

function overallStandings() {
  const totals = data.teams.map((team) => ({ team, sports: {}, total: 0 }));
  const byTeam = Object.fromEntries(totals.map((row) => [row.team.id, row]));
  Object.keys(SPORTS).forEach((sport) => {
    const ranking = standingsFor(sport);
    const hasResults = data.matches.some((match) => match.sport === sport && match.status === "completed");
    ranking.forEach((row, index) => {
      const points = hasResults ? (PLACEMENT_POINTS[index] ?? 0) : null;
      byTeam[row.team.id].sports[sport] = points;
      byTeam[row.team.id].total += points ?? 0;
    });
  });
  return totals.sort((a, b) => b.total - a.total || a.team.name.localeCompare(b.team.name, "el"));
}

function renderOverall() {
  $id("overallBody").innerHTML = overallStandings().map((row, index) => `<tr><td><span class="position">${index + 1}</span></td><td><span class="team-name"><i class="team-dot" style="background:${escapeHtml(row.team.color)}"></i>${escapeHtml(row.team.name)}</span></td>${Object.keys(SPORTS).map((sport) => `<td class="${row.sports[sport] === null ? "no-points" : ""}">${row.sports[sport] ?? "—"}</td>`).join("")}<td class="total-points">${row.total}</td></tr>`).join("");
}

function renderSportTable() {
  $id("sportTableTitle").textContent = SPORTS[activeSport];
  $id("sportBody").innerHTML = standingsFor(activeSport).map((row, index) => `<tr><td><span class="position">${index + 1}</span></td><td><span class="team-name"><i class="team-dot" style="background:${escapeHtml(row.team.color)}"></i>${escapeHtml(row.team.name)}</span></td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.for}</td><td>${row.against}</td><td>${row.diff > 0 ? "+" : ""}${row.diff}</td><td class="total-points">${row.points}</td></tr>`).join("");
}

function renderSportSelector() {
  $id("sportSelector").innerHTML = Object.entries(SPORTS).map(([id, name]) => `<button class="sport-tab" type="button" role="tab" data-sport="${id}" aria-selected="${activeSport === id}">${name}</button>`).join("");
}

function formatDate(value) {
  if (!value) return "Χωρίς ημερομηνία";
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function renderMatches() {
  const filter = $id("matchFilter").value || "all";
  const matches = [...data.matches].filter((match) => filter === "all" || match.sport === filter).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  $id("matchEmpty").hidden = matches.length > 0;
  $id("matchList").innerHTML = matches.map((match) => {
    const home = teamById(match.home); const away = teamById(match.away); const complete = match.status === "completed";
    return `<article class="match-card" style="border-left-color:${escapeHtml(home?.color || "#1f6a4b")}"><div class="match-meta"><strong>${escapeHtml(SPORTS[match.sport])}</strong><span>${escapeHtml(formatDate(match.date))} · ${escapeHtml(match.time)}</span></div><div class="match-teams"><span>${escapeHtml(home?.name || "Άγνωστη ομάδα")}</span><span class="match-score">${complete ? `${match.homeScore} – ${match.awayScore}` : "—"}</span><span>${escapeHtml(away?.name || "Άγνωστη ομάδα")}</span></div><span class="match-status ${complete ? "" : "scheduled"}">${complete ? "Τελικό" : "Προσεχώς"}</span></article>`;
  }).join("");
}

function optionMarkup(includeAll = false) {
  return `${includeAll ? '<option value="all">Όλα τα αθλήματα</option>' : ""}${Object.entries(SPORTS).map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}`;
}

function renderForms() {
  const selectedFilter = $id("matchFilter").value || "all";
  $id("matchFilter").innerHTML = optionMarkup(true); $id("matchFilter").value = selectedFilter;
  if (!$id("matchFilter").value) $id("matchFilter").value = "all";
  const selectedSport = $id("matchSport").value || "basketball";
  $id("matchSport").innerHTML = optionMarkup(); $id("matchSport").value = selectedSport;
  const options = data.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join("");
  const home = $id("matchHome").value; const away = $id("matchAway").value;
  $id("matchHome").innerHTML = `<option value="">Επιλογή</option>${options}`;
  $id("matchAway").innerHTML = `<option value="">Επιλογή</option>${options}`;
  $id("matchHome").value = home; $id("matchAway").value = away;
}

function renderAdmin() {
  $id("teamAdminList").innerHTML = data.teams.map((team) => `<div class="admin-list-row"><span><i class="mini-dot" style="background:${escapeHtml(team.color)}"></i>${escapeHtml(team.name)}</span><button class="small-action" type="button" data-delete-team="${escapeHtml(team.id)}">Διαγραφή</button></div>`).join("");
  $id("adminMatchList").innerHTML = [...data.matches].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).map((match) => `<div class="admin-match-row"><span><strong>${escapeHtml(SPORTS[match.sport])}</strong> · ${escapeHtml(match.date)} ${escapeHtml(match.time)} · ${escapeHtml(teamById(match.home)?.name || "—")} – ${escapeHtml(teamById(match.away)?.name || "—")} ${match.status === "completed" ? `(${match.homeScore}–${match.awayScore})` : ""}</span><div class="admin-match-actions"><button class="small-action edit-action" type="button" data-edit-match="${match.id}">Επεξεργασία</button><button class="small-action" type="button" data-delete-match="${match.id}">Διαγραφή</button></div></div>`).join("") || "<p class='field-help'>Δεν υπάρχουν αγώνες.</p>";
}

function renderAll() {
  $id("seasonLabel").textContent = data.season;
  renderForms(); renderOverall(); renderSportSelector(); renderSportTable(); renderMatches(); renderAdmin();
}

function showToast(message) {
  const toast = $id("toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function resetMatchForm() {
  $id("matchForm").reset(); $id("matchId").value = ""; $id("matchTime").value = "14:15";
  $id("matchFormTitle").textContent = "Νέος αγώνας"; $id("matchCancel").hidden = true; renderForms();
}

async function verifyAdmin(user) {
  if (!user || !supabase) return false;
  const { data: role, error } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !error && Boolean(role);
}

async function openAdmin() {
  if (!supabase) { showToast("Πρέπει πρώτα να συνδεθεί η ιστοσελίδα με το Supabase."); return; }
  const { data: sessionData } = await supabase.auth.getSession();
  currentUser = sessionData.session?.user || null;
  if (await verifyAdmin(currentUser)) $id("adminDialog").showModal();
  else { if (currentUser) await supabase.auth.signOut(); $id("loginDialog").showModal(); }
}

$id("sportSelector").addEventListener("click", (event) => { const button = event.target.closest("[data-sport]"); if (!button) return; activeSport = button.dataset.sport; renderSportSelector(); renderSportTable(); });
$id("matchFilter").addEventListener("change", renderMatches);
$id("adminOpen").addEventListener("click", openAdmin);
$id("adminClose").addEventListener("click", () => $id("adminDialog").close());
$id("loginClose").addEventListener("click", () => $id("loginDialog").close());
$id("adminDialog").addEventListener("click", (event) => { if (event.target === $id("adminDialog")) $id("adminDialog").close(); });
$id("loginDialog").addEventListener("click", (event) => { if (event.target === $id("loginDialog")) $id("loginDialog").close(); });

$id("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $id("loginButton"); const errorBox = $id("loginError");
  button.disabled = true; button.textContent = "Σύνδεση…"; errorBox.textContent = "";
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email: $id("loginEmail").value.trim(), password: $id("loginPassword").value });
  if (error || !(await verifyAdmin(authData?.user))) {
    if (authData?.user) await supabase.auth.signOut();
    errorBox.textContent = "Λάθος στοιχεία ή ο λογαριασμός δεν έχει δικαιώματα διαχειριστή.";
  } else {
    currentUser = authData.user; $id("loginForm").reset(); $id("loginDialog").close();
    await fetchOnlineData(); $id("adminDialog").showModal();
  }
  button.disabled = false; button.textContent = "Σύνδεση";
});

$id("logoutButton").addEventListener("click", async () => { await supabase.auth.signOut(); currentUser = null; $id("adminDialog").close(); showToast("Έγινε αποσύνδεση."); });

$id("teamForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $id("teamName").value.trim();
  if (data.teams.some((team) => team.name.toLocaleLowerCase("el") === name.toLocaleLowerCase("el"))) return showToast("Υπάρχει ήδη ομάδα με αυτό το όνομα.");
  const { error } = await supabase.from("teams").insert({ name, color: $id("teamColor").value });
  if (error) return showToast(`Δεν αποθηκεύτηκε η ομάδα: ${error.message}`);
  event.target.reset(); $id("teamColor").value = "#e55c2b"; await fetchOnlineData(); showToast("Η ομάδα δημοσιεύτηκε.");
});

$id("matchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const home = $id("matchHome").value; const away = $id("matchAway").value; const status = $id("matchStatus").value;
  if (home === away) return showToast("Επίλεξε δύο διαφορετικές ομάδες.");
  const homeScore = $id("homeScore").value; const awayScore = $id("awayScore").value;
  if (status === "completed" && (homeScore === "" || awayScore === "")) return showToast("Συμπλήρωσε και τα δύο σκορ.");
  const sport = $id("matchSport").value;
  if (status === "completed" && ["basketball", "volleyball", "badminton"].includes(sport) && Number(homeScore) === Number(awayScore)) return showToast("Σε αυτό το άθλημα δεν επιτρέπεται ισοπαλία.");
  const record = { sport, match_date: $id("matchDate").value, match_time: $id("matchTime").value, home, away, home_score: status === "completed" ? Number(homeScore) : null, away_score: status === "completed" ? Number(awayScore) : null, status };
  const id = $id("matchId").value;
  const result = id ? await supabase.from("matches").update(record).eq("id", id) : await supabase.from("matches").insert(record);
  if (result.error) return showToast(`Δεν αποθηκεύτηκε ο αγώνας: ${result.error.message}`);
  resetMatchForm(); await fetchOnlineData(); showToast(id ? "Ο αγώνας ενημερώθηκε online." : "Ο αγώνας δημοσιεύτηκε.");
});

$id("matchCancel").addEventListener("click", resetMatchForm);
$id("teamAdminList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-team]"); if (!button) return;
  if (data.matches.some((match) => match.home === button.dataset.deleteTeam || match.away === button.dataset.deleteTeam)) return showToast("Διέγραψε πρώτα τους αγώνες αυτής της ομάδας.");
  if (!confirm("Να διαγραφεί η ομάδα από την online βάση;")) return;
  const { error } = await supabase.from("teams").delete().eq("id", button.dataset.deleteTeam);
  if (error) return showToast(`Δεν διαγράφηκε η ομάδα: ${error.message}`);
  await fetchOnlineData(); showToast("Η ομάδα διαγράφηκε.");
});

$id("adminMatchList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-match]"); const remove = event.target.closest("[data-delete-match]");
  if (edit) {
    const match = data.matches.find((item) => item.id === edit.dataset.editMatch);
    if (!match) return;
    $id("matchId").value = match.id; $id("matchSport").value = match.sport; $id("matchStatus").value = match.status; $id("matchDate").value = match.date; $id("matchTime").value = match.time; $id("matchHome").value = match.home; $id("matchAway").value = match.away; $id("homeScore").value = match.homeScore ?? ""; $id("awayScore").value = match.awayScore ?? "";
    $id("matchFormTitle").textContent = "Επεξεργασία αγώνα"; $id("matchCancel").hidden = false; $id("matchForm").scrollIntoView({ behavior: "smooth" });
  }
  if (remove && confirm("Να διαγραφεί ο αγώνας από την online βάση;")) {
    const { error } = await supabase.from("matches").delete().eq("id", remove.dataset.deleteMatch);
    if (error) return showToast(`Δεν διαγράφηκε ο αγώνας: ${error.message}`);
    await fetchOnlineData(); showToast("Ο αγώνας διαγράφηκε.");
  }
});

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({ name: "read_league_summary", title: "Προβολή σύνοψης λίγκας", description: "Επιστρέφει τις ομάδες, τη συνολική βαθμολογία και τους προσεχείς αγώνες.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ teams: overallStandings().map((row, index) => ({ position: index + 1, team: row.team.name, points: row.total })), upcoming: data.matches.filter((match) => match.status === "scheduled").slice(0, 10) }) });
}

initialize();
