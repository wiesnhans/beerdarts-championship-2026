// ─────────────────────────────────────────────────────────────
// doppelspieltag1.js – lädt Doppelspiele aus DB
// ─────────────────────────────────────────────────────────────

const DB_URL = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-06-30.db";

const SPIELTAG_NR = 2;

const SPIELTAG_DATUM = {
  2: "2026-06-30",
};

// Doppelspieler starten ab dieser ID
const DOPPEL_MIN_ID = 7;

// sql.js laden
const SQL_READY = initSqlJs({
  locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
});

// ── Hauptfunktion
export async function ladeDoppelSpieltag2() {

  const [SQL, dbBuffer] = await Promise.all([
    SQL_READY,
    fetch(DB_URL).then(r => {
      if (!r.ok) throw new Error(`DB nicht erreichbar: ${r.status}`);
      return r.arrayBuffer();
    })
  ]);

  const db = new SQL.Database(new Uint8Array(dbBuffer));

  function q(sql) {
    const stmt = db.prepare(sql);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  // ── Spieltagfilter
  const datum = SPIELTAG_DATUM[SPIELTAG_NR];
  const start = `${datum} 00:00:00`;

  const end = new Date(`${datum}T00:00:00`);
  end.setDate(end.getDate() + 1);

  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");

  const endStr = `${yyyy}-${mm}-${dd} 01:00:00`;

  const spieltagFilter = `
    AND m.created_at >= '${start}' 
    AND m.created_at < '${endStr}'
  `;

  // ── Doppel-Spiele laden
  const rows = q(`
    SELECT 
      ms.xGameMpId AS gameId,
      gs.spielerId,
      sp.name,
      m.siegerId,
      SUM(gs.gesamtDarts) AS totalDarts,
      SUM(gs.gesamtScore) AS totalScore,
      ROUND(SUM(gs.gesamtScore)*3.0 / SUM(gs.gesamtDarts), 2) AS avg,
      SUM(CASE WHEN gs.spielerId = l.siegerId THEN 1 ELSE 0 END) AS legsWon
    FROM xGameSpieler gs
    JOIN xGameMpLeg l ON gs.legId = l.id
    JOIN xGameMpSet ms ON l.setId = ms.id
    JOIN xGameMp m ON ms.xGameMpId = m.id
    JOIN Spieler sp ON gs.spielerId = sp.id
    WHERE 1=1 ${spieltagFilter}
      AND gs.spielerId >= ${DOPPEL_MIN_ID}
    GROUP BY ms.xGameMpId, gs.spielerId, sp.name, m.siegerId
    ORDER BY ms.xGameMpId, gs.spielerId
  `);

  // ── Spiele gruppieren
  const games = {};

  rows.forEach(g => {
    if (!games[g.gameId]) {
      games[g.gameId] = { p1: null, p2: null, winner: null };
    }

    const game = games[g.gameId];

    if (!game.p1) game.p1 = g;
    else game.p2 = g;

    // ✅ Gewinner setzen
    if (g.spielerId === g.siegerId) {
      game.winner = g;
    }
  });

  // ── Tabelle füllen (nur wenn Seite vorhanden)
  const table = document.getElementById("doppelSpieleBody2");

  if (table) {
    table.innerHTML = "";

    Object.values(games).forEach(g => {
      if (!g.p1 || !g.p2) return;

      // Sicherheitscheck
      if (
        g.p1.spielerId < DOPPEL_MIN_ID ||
        g.p2.spielerId < DOPPEL_MIN_ID
      ) return;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          <span>${g.p1.name}</span> 
          <small>${(+g.p1.avg).toFixed(2)}</small>
        </td>
        <td colspan="3" style="text-align:center">
          ${g.p1.legsWon}:${g.p2.legsWon}
        </td>
        <td>
          <span>${g.p2.name}</span> 
          <small>${(+g.p2.avg).toFixed(2)}</small>
        </td>
      `;

      table.appendChild(tr);
    });
  }

  console.log("Doppelspiele geladen:", Object.values(games).length);

  // ✅ WICHTIG: für Gesamtstand zurückgeben
  return Object.values(games);
}


// ── Auto-Start (nur für diese Seite)
if (document.getElementById("doppelSpieleBody")) {
  ladeDoppelSpieltag2().catch(err => {
    console.error("Fehler Doppel:", err);

    document.body.insertAdjacentHTML("afterbegin", `
      <div style="background:#e84a4a;color:#fff;padding:12px">
        ⚠️ Doppel konnte nicht geladen werden: ${err.message}
      </div>
    `);
  });
}