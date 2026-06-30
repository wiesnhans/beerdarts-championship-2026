// ─────────────────────────────────────────────────────────────
// spieltag1.js – ES-Modul, Spieltag 1 (2026)
// ─────────────────────────────────────────────────────────────

import { getMasterPlayerId } from "./playermatcher.js";

const DB_URL = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-06-30.db";
const SPIELTAG_NR = 2;

const PUNKTE_VORRUNDE = [5, 2, 0, 0];
const PUNKTE_FINAL    = [10, 6, 3, 1];
const PUNKTE_HIGHSCORE = 2;
const PUNKTE_HIGHCO   = 2;

const SPIELTAG_DATUM = {
  2: "2026-06-30",
};




// sql.js nur einmal initialisieren
const SQL_READY = initSqlJs({
  locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
});





// ── Hauptfunktion – gibt spielerArray zurück (Promise)
export async function ladeSpieltagDaten() {
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
  const mm   = String(end.getMonth() + 1).padStart(2, '0');
  const dd   = String(end.getDate()).padStart(2, '0');
  const endStr = `${yyyy}-${mm}-${dd} 01:00:00`;
  const spieltagFilter = `AND m.created_at >= '${start}' AND m.created_at < '${endStr}'`;

const spielerRows = q(` 
SELECT gs.spielerId, COUNT(*) as games
FROM xGameSpieler gs
JOIN xGameMpLeg l ON gs.legId = l.id
JOIN xGameMpSet ms ON l.setId = ms.id
JOIN xGameMp m ON ms.xGameMpId = m.id
WHERE 1=1 ${spieltagFilter}
GROUP BY gs.spielerId
ORDER BY games DESC
LIMIT 4
`);

const allowedPlayers = spielerRows.map(r => r.spielerId);
const allowedList = allowedPlayers.join(",");

const gameRows = q(`
  SELECT 
    ms.xGameMpId AS gameId,
    gs.spielerId,
    sp.name,
    m.siegerId,
    m.bestOfLegs,
    SUM(gs.gesamtDarts) AS totalDarts,
    SUM(gs.gesamtScore) AS totalScore,
    ROUND(SUM(gs.gesamtScore)*3.0 / SUM(gs.gesamtDarts), 2) AS avg,
    SUM(CASE WHEN gs.spielerId = l.siegerId THEN 1 ELSE 0 END) AS legsWon,
    COUNT(DISTINCT gs.legId) AS legsPlayed,
    SUM(auf.dartsOnDouble) AS doppelVersuche,
    MAX(auf.highscore) AS highscore,
    MAX(auf.highestcheckout) AS highestcheckout
  FROM xGameSpieler gs
  JOIN xGameMpLeg l ON gs.legId = l.id
  JOIN xGameMpSet ms ON l.setId = ms.id
  JOIN xGameMp m ON ms.xGameMpId = m.id
  JOIN Spieler sp ON gs.spielerId = sp.id
  LEFT JOIN (
      SELECT 
        entityId,
        SUM(dartsOnDouble) AS dartsOnDouble,
        MAX(score) AS highscore,
        MAX(CASE WHEN checkout = 1 THEN score ELSE 0 END) AS highestcheckout
      FROM AufnahmeMp
      GROUP BY entityId
  ) auf ON auf.entityId = gs.id
  WHERE 1=1 ${spieltagFilter}

  -- 🔥 DAS IST DEIN FIX
  AND ms.xGameMpId IN (
    SELECT ms2.xGameMpId
    FROM xGameSpieler gs2
    JOIN xGameMpLeg l2 ON gs2.legId = l2.id
    JOIN xGameMpSet ms2 ON l2.setId = ms2.id
    GROUP BY ms2.xGameMpId
    HAVING 
      COUNT(DISTINCT gs2.spielerId) = 2
      AND MIN(gs2.spielerId) IN (${allowedList})
      AND MAX(gs2.spielerId) IN (${allowedList})
  )

  GROUP BY ms.xGameMpId, gs.spielerId, sp.name, m.siegerId, m.bestOfLegs
  ORDER BY m.created_at, ms.xGameMpId, gs.spielerId
`);

  // ── Nach GameId gruppieren
  const gamesById = {};
  gameRows.forEach(g => {

// ✅ NEU: Name mappen
  const mapped = getMasterPlayerId(g.name);
  g.name = mapped || g.name;


    if (!gamesById[g.gameId]) gamesById[g.gameId] = { p1: null, p2: null, winner: null, bestOfLegs: g.bestOfLegs };
    const game = gamesById[g.gameId];
    if (!game.p1) game.p1 = g; else game.p2 = g;
    if (g.spielerId === g.siegerId) game.winner = g;
  });

 const vorrundeGames = [];
const finalGames    = [];

Object.values(gamesById).forEach(g => {
  // nur vollständige Spiele berücksichtigen
  if (!g.p1 || !g.p2) return;

  if (g.bestOfLegs <= 3) vorrundeGames.push(g);
  else finalGames.push(g);
});

  // ── Vorrunden-Stats
  const vorrundeStats = {};
  vorrundeGames.forEach(g => {
    [g.p1, g.p2].forEach(p => {
      if (!p) return;
      if (!vorrundeStats[p.name]) vorrundeStats[p.name] = {
        name: p.name, spiele: 0, siege: 0, niederlagen: 0,
        legsPlus: 0, legsMinus: 0,
        totalScore: 0, totalDarts: 0, avg: 0,
        vorpunkte: 0, punkte: 0
      };
      const s = vorrundeStats[p.name];
      s.spiele += 1;
      const legsWon    = Number(p.legsWon)   || 0;
      const legsPlayed = Number(p.legsPlayed) || 0;
      if (p.spielerId === g.winner?.spielerId) {
        s.siege      += 1;
        s.vorpunkte  += 2;
      } else {
        s.niederlagen += 1;
      }
      s.legsPlus   += legsWon;
      s.legsMinus  += (legsPlayed - legsWon);
      s.totalScore += p.totalScore || 0;
      s.totalDarts += p.totalDarts || 0;
    });
  });

  Object.values(vorrundeStats).forEach(s => {
    s.avg = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
  });

  const vorrundeArray = Object.values(vorrundeStats).sort((a, b) => b.vorpunkte - a.vorpunkte);
  vorrundeArray.forEach((p, i) => { p.punkte = PUNKTE_VORRUNDE[i] || 0; });

  // ── Gesamtstats
  const stats = {};
  const addStat = (g, isVorrunde = false) => {
    [g.p1, g.p2].forEach(p => {
      if (!stats[p.name]) stats[p.name] = {
        name: p.name, spiele: 0, siege: 0, niederlagen: 0,
        legsPlus: 0, legsMinus: 0,
        totalScore: 0, totalDarts: 0, avg: 0,
        doppelSum: 0, doppelQuot: 0,
        checkoutMax: 0, highscoreMax: 0,
        punkte: 0, vorrundenSieg: 0, gesamtSieg: 0
      };
      const s = stats[p.name];
      s.spiele     += 1;
      if (p.spielerId === g.winner?.spielerId) s.siege += 1; else s.niederlagen += 1;
      s.legsPlus   += Number(p.legsWon)   || 0;
      s.legsMinus  += (Number(p.legsPlayed) || 0) - (Number(p.legsWon) || 0);
      s.totalScore += p.totalScore || 0;
      s.totalDarts += p.totalDarts || 0;
      s.doppelSum  += p.doppelVersuche || 0;
      s.checkoutMax  = Math.max(s.checkoutMax,  p.highestcheckout || 0);
      s.highscoreMax = Math.max(s.highscoreMax, p.highscore       || 0);
      if (isVorrunde && vorrundeStats[p.name]) {
        const maxVP = Math.max(...vorrundeArray.map(x => x.punkte));
        s.punkte       = vorrundeStats[p.name].punkte || 0;
        s.vorrundenSieg = vorrundeStats[p.name].punkte === maxVP ? 1 : 0;
      }
    });
  };

  vorrundeGames.forEach(g => addStat(g, true));
  finalGames.forEach(g => addStat(g));

  // Finalsieger
  if (finalGames.length >= 4) {
    const finale    = finalGames[3];
    stats[finale.winner.name].gesamtSieg = 1;
  }

  // Durchschnitt & Doppelquote
  Object.values(stats).forEach(s => {
    s.avg        = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
    s.doppelQuot = s.doppelSum  > 0 ? ((s.legsPlus / s.doppelSum) * 100).toFixed(2) : "0.00";
  });

  // Finalpunkte
  if (finalGames.length >= 4) {
    const [, , spielUmPlatz3, finale] = finalGames;
    const siegerF     = finale.winner.name;
    const verliererF  = finale.p1.name === siegerF ? finale.p2.name : finale.p1.name;
    stats[siegerF].punkte    += PUNKTE_FINAL[0];
    stats[verliererF].punkte += PUNKTE_FINAL[1];

    const siegerPl3    = spielUmPlatz3.winner.name;
    const verliererPl3 = spielUmPlatz3.p1.name === siegerPl3 ? spielUmPlatz3.p2.name : spielUmPlatz3.p1.name;
    stats[siegerPl3].punkte    += PUNKTE_FINAL[2];
    stats[verliererPl3].punkte += PUNKTE_FINAL[3];
  }

  // Bonuspunkte
  const allPlayers   = Object.values(stats);
  const maxHighscore = Math.max(...allPlayers.map(p => p.highscoreMax || 0));
  const maxCheckout  = Math.max(...allPlayers.map(p => p.checkoutMax  || 0));
  allPlayers.forEach(p => {
    if (p.highscoreMax === maxHighscore && maxHighscore > 0) p.punkte += PUNKTE_HIGHSCORE;
    if (p.checkoutMax  === maxCheckout  && maxCheckout  > 0) p.punkte += PUNKTE_HIGHCO;
  });

  // ── DOM: Vorrunden-Tabelle
  const vorrundeTabelleBody = document.getElementById("spielerTabelleBody");
  if (vorrundeTabelleBody) {
    vorrundeTabelleBody.innerHTML = "";
    vorrundeArray.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.spiele}</td>
        <td>${p.siege}</td>
        <td>${p.niederlagen}</td>
        <td>${p.legsPlus}</td>
        <td>${p.legsMinus}</td>
        <td>${p.vorpunkte}</td>
        <td>${p.avg}</td>
      `;
      vorrundeTabelleBody.appendChild(tr);
    });
  }

  // ── DOM: Vorrunde Spiele
  const vorrundeBody = document.getElementById("vorrundeSpieleBody");
  if (vorrundeBody) {
    vorrundeBody.innerHTML = "";
    vorrundeGames.forEach(g => {
      const p1won = g.winner?.spielerId === g.p1.spielerId;
      const tr    = document.createElement("tr");
      tr.innerHTML = `
        <td style="${p1won ? 'font-weight:bold' : ''}">${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td>
        <td>:</td>
        <td>${g.p2.legsWon}</td>
        <td style="${!p1won ? 'font-weight:bold' : ''}">${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>
      `;
      vorrundeBody.appendChild(tr);
    });
  }

  // ── DOM: Halbfinale
  const finalBracketBody = document.getElementById("finalBracketBody");
  if (finalBracketBody && finalGames.length >= 2) {
    finalBracketBody.innerHTML = "";
    finalGames.slice(0, 2).forEach((g, idx) => {
      const tr = document.createElement("tr");
      const p1won = g.winner?.spielerId === g.p1.spielerId;
      tr.innerHTML = `
        <td>HF${idx + 1}</td>
        <td style="${p1won ? 'font-weight:bold' : ''}">${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td><td>:</td><td>${g.p2.legsWon}</td>
        <td style="${!p1won ? 'font-weight:bold' : ''}">${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>
      `;
      finalBracketBody.appendChild(tr);
    });
  }

  // ── DOM: Platz 3 & Finale
  const final2Body = document.getElementById("final2Body");
  if (final2Body && finalGames.length >= 4) {
    final2Body.innerHTML = "";
    [["P3", 2], ["F", 3]].forEach(([label, idx]) => {
      if (!finalGames[idx]) return;
      const g  = finalGames[idx];
      const tr = document.createElement("tr");
      const p1won = g.winner?.spielerId === g.p1.spielerId;
      tr.innerHTML = `
        <td>${label}</td>
        <td style="${p1won ? 'font-weight:bold' : ''}">${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td><td>:</td><td>${g.p2.legsWon}</td>
        <td style="${!p1won ? 'font-weight:bold' : ''}">${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>
      `;
      final2Body.appendChild(tr);
    });
  }

  // ── DOM: Endtabelle Spieltag
  const gesamtBody = document.getElementById("gesamtstandBody");
  if (gesamtBody) {
    gesamtBody.innerHTML = "";
    Object.values(stats).sort((a, b) => b.punkte - a.punkte).forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.spiele}</td>
        <td>${p.siege}</td>
        <td>${p.niederlagen}</td>
        <td>${p.legsPlus}</td>
        <td>${p.legsMinus}</td>
        <td>${p.punkte}</td>
        <td>${p.avg}</td>
        <td>${p.doppelSum}</td>
        <td>${p.doppelQuot}</td>
        <td>${p.checkoutMax}</td>
        <td>${p.highscoreMax}</td>
      `;
      gesamtBody.appendChild(tr);
    });
  }

  // ── Exportformat für gesamtstand.js zurückgeben
  return Object.values(stats).map(p => ({
    spieltag:        SPIELTAG_NR,
    name:            p.name,
    spiele:          p.spiele,
    siege:           p.siege,
    niederlagen:     p.niederlagen,
    legsPlus:        p.legsPlus,
    legsMinus:       p.legsMinus,
    totalScore:      p.totalScore,
    totalDarts:      p.totalDarts,
    avg:             p.avg,
    punkte:          p.punkte,
    doppelSum:       p.doppelSum,
    doppelQuot:      p.doppelQuot,
    highscoreMax:    p.highscoreMax,
    checkoutMax:     p.checkoutMax,
    vorrundenSieger: p.vorrundenSieg,
    gesamtSieger:    p.gesamtSieg
  }));
}

// ── Automatisch starten wenn direkt als Seite geladen
// (wird von gesamtstand.js per import+await selbst aufgerufen,
//  auf spieltag1.html startet es hier automatisch)
if (document.getElementById("gesamtstandBody") || document.getElementById("spielerTabelleBody")) {
  ladeSpieltagDaten().catch(err => {
    console.error("Fehler beim Laden der DB:", err);
    document.body.insertAdjacentHTML("afterbegin", `
      <div style="background:#e84a4a;color:#fff;padding:12px;font-family:sans-serif">
        ⚠️ DB konnte nicht geladen werden: ${err.message}
      </div>
    `);
  });
}
