// ─────────────────────────────────────────────────────────────
// sonderspieltag.js – 3 Spieler, jeder gegen jeden 2x, Best of 4
// Kein Punkte­system – nur Stats & Ergebnisse
// ─────────────────────────────────────────────────────────────

const DB_URL = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-04-02.db";

// ⚠️ Datum des Sonderspieltags hier eintragen:
const SPIELTAG_DATUM = "2026-04-02";

// Spieler-IDs der 3 Teilnehmer (anpassen falls nötig)
const SPIELER_IDS = [2, 3, 4];

const SQL_READY = initSqlJs({
  locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
});

export async function ladeSonderspieltag() {
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

  // ── Datumsfilter
  const start  = `${SPIELTAG_DATUM} 00:00:00`;
  const endDt  = new Date(`${SPIELTAG_DATUM}T00:00:00`);
  endDt.setDate(endDt.getDate() + 1);
  const endStr = `${endDt.getFullYear()}-${String(endDt.getMonth()+1).padStart(2,'0')}-${String(endDt.getDate()).padStart(2,'0')} 01:00:00`;
  const filter = `AND m.created_at >= '${start}' AND m.created_at < '${endStr}'`;

  const ids = SPIELER_IDS.join(",");

  // ── Spiele laden
  const gameRows = q(`
    SELECT
      ms.xGameMpId AS gameId,
      gs.spielerId,
      sp.name,
      m.siegerId,
      m.bestOfLegs,
      SUM(gs.gesamtDarts)  AS totalDarts,
      SUM(gs.gesamtScore)  AS totalScore,
      SUM(CASE WHEN gs.spielerId = l.siegerId THEN 1 ELSE 0 END) AS legsWon,
      COUNT(DISTINCT gs.legId) AS legsPlayed,
      SUM(auf.dartsOnDouble)   AS doppelVersuche,
      MAX(auf.highscore)       AS highscore,
      MAX(auf.highestcheckout) AS highestcheckout
    FROM xGameSpieler gs
    JOIN xGameMpLeg l  ON gs.legId  = l.id
    JOIN xGameMpSet ms ON l.setId   = ms.id
    JOIN xGameMp m     ON ms.xGameMpId = m.id
    JOIN Spieler sp    ON gs.spielerId = sp.id
    LEFT JOIN (
      SELECT entityId,
        SUM(dartsOnDouble) AS dartsOnDouble,
        MAX(score)         AS highscore,
        MAX(CASE WHEN checkout = 1 THEN score ELSE 0 END) AS highestcheckout
      FROM AufnahmeMp
      GROUP BY entityId
    ) auf ON auf.entityId = gs.id
    WHERE gs.spielerId IN (${ids}) ${filter}
    GROUP BY ms.xGameMpId, gs.spielerId, sp.name, m.siegerId, m.bestOfLegs
    ORDER BY m.created_at, ms.xGameMpId, gs.spielerId
  `);

  // ── Nach GameId gruppieren
  const gamesById = {};
  gameRows.forEach(g => {
    if (!gamesById[g.gameId]) gamesById[g.gameId] = { p1: null, p2: null, winner: null, bestOfLegs: g.bestOfLegs };
    const game = gamesById[g.gameId];
    if (!game.p1) game.p1 = g; else game.p2 = g;
    if (g.spielerId === g.siegerId) game.winner = g;
  });

  // ── Vorrunde (Best of 4) vs. Finalspiele trennen
  // Vorrunde = bestOfLegs <= 4, Final = bestOfLegs > 4
  const vorrundeGames = [];
  const finalGames    = [];
  Object.values(gamesById).forEach(g => {
    if (!g.p1 || !g.p2) return;
    if (!SPIELER_IDS.includes(g.p1.spielerId) || !SPIELER_IDS.includes(g.p2.spielerId)) return;
    if (g.bestOfLegs <= 4) vorrundeGames.push(g);
    else finalGames.push(g);
  });

  // ── Vorrunden-Stats (Siege/Unentschieden/Niederlagen/Punkte/Legs/AVG)
  const vorrundeStats = {};
  vorrundeGames.forEach(g => {
    const istUnentschieden = !g.winner;
    [g.p1, g.p2].forEach(p => {
      if (!p) return;
      if (!vorrundeStats[p.name]) vorrundeStats[p.name] = {
        name: p.name, spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0,
        punkte: 0, legsPlus: 0, legsMinus: 0, totalScore: 0, totalDarts: 0
      };
      const s = vorrundeStats[p.name];
      s.spiele++;
      if (istUnentschieden) {
        s.unentschieden++;
        s.punkte += 1;
      } else if (p.spielerId === g.winner?.spielerId) {
        s.siege++;
        s.punkte += 2;
      } else {
        s.niederlagen++;
      }
      s.legsPlus   += Number(p.legsWon)    || 0;
      s.legsMinus  += (Number(p.legsPlayed) || 0) - (Number(p.legsWon) || 0);
      s.totalScore += Number(p.totalScore)  || 0;
      s.totalDarts += Number(p.totalDarts)  || 0;
    });
  });

  Object.values(vorrundeStats).forEach(s => {
    s.avg = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
  });

  // Vorrundentabelle sortieren: Punkte → Legdifferenz → AVG
  const vorrundeArray = Object.values(vorrundeStats).sort((a, b) => {
    if (b.punkte !== a.punkte) return b.punkte - a.punkte;
    const diffA = a.legsPlus - a.legsMinus;
    const diffB = b.legsPlus - b.legsMinus;
    if (diffB !== diffA) return diffB - diffA;
    return parseFloat(b.avg) - parseFloat(a.avg);
  });

  // ── Gesamtstats (Vorrunde + Finale)
  const stats = {};
  const addStat = (g) => {
    [g.p1, g.p2].forEach(p => {
      if (!p) return;
      if (!stats[p.name]) stats[p.name] = {
        name: p.name, spiele: 0, siege: 0, niederlagen: 0,
        legsPlus: 0, legsMinus: 0,
        totalScore: 0, totalDarts: 0, avg: "0.00",
        doppelSum: 0, doppelQuot: "0.00",
        checkoutMax: 0, highscoreMax: 0
      };
      const s = stats[p.name];
      s.spiele++;
      if (p.spielerId === g.winner?.spielerId) s.siege++;
      else s.niederlagen++;
      s.legsPlus    += Number(p.legsWon)    || 0;
      s.legsMinus   += (Number(p.legsPlayed) || 0) - (Number(p.legsWon) || 0);
      s.totalScore  += Number(p.totalScore)  || 0;
      s.totalDarts  += Number(p.totalDarts)  || 0;
      s.doppelSum   += Number(p.doppelVersuche) || 0;
      s.checkoutMax  = Math.max(s.checkoutMax,  Number(p.highestcheckout) || 0);
      s.highscoreMax = Math.max(s.highscoreMax, Number(p.highscore)       || 0);
    });
  };

  vorrundeGames.forEach(g => addStat(g));
  finalGames.forEach(g => addStat(g));

  Object.values(stats).forEach(s => {
    s.avg        = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
    s.doppelQuot = s.doppelSum  > 0 ? ((s.legsPlus / s.doppelSum) * 100).toFixed(2) : "0.00";
  });

  // ── Abschlusstabelle: Platz nach Finalergebnis
  // Platz 1 = Finalsieger, Platz 2 = Finalverlierer, Platz 3 = Halbfinalverlierer
  let abschlussArray = [];
  if (finalGames.length >= 2) {
    // finalGames[0] = Halbfinale (2 vs 3), finalGames[1] = Finale (1 vs HF-Sieger)
    const halbfinale = finalGames[0];
    const finale     = finalGames[1];
    const pl1 = finale.winner?.name;
    const pl2 = finale.p1.name === pl1 ? finale.p2.name : finale.p1.name;
    const pl3 = halbfinale.p1.name === halbfinale.winner?.name ? halbfinale.p2.name : halbfinale.p1.name;
    abschlussArray = [pl1, pl2, pl3].filter(Boolean).map(n => stats[n]).filter(Boolean);
    // Rest (falls jemand fehlt)
    Object.values(stats).forEach(s => { if (!abschlussArray.find(x => x.name === s.name)) abschlussArray.push(s); });
  } else {
    // Noch kein Finale gespielt – nach Siegen sortieren
    abschlussArray = Object.values(stats).sort((a, b) => b.siege - a.siege);
  }

  // ── DOM: Vorrunde Spiele
  const vorrundeBody = document.getElementById("vorrundeSpieleBody");
  if (vorrundeBody) {
    vorrundeBody.innerHTML = "";
    vorrundeGames.forEach(g => {
      const p1won = g.winner?.spielerId === g.p1.spielerId;
      const tr    = document.createElement("tr");
      tr.innerHTML = `
        <td style="${p1won ? 'font-weight:bold' : ''}">${g.p1.name} <small>${g.p1.totalDarts > 0 ? ((g.p1.totalScore * 3 / g.p1.totalDarts).toFixed(2)) : "0.00"}</small></td>
        <td>${g.p1.legsWon}</td>
        <td>:</td>
        <td>${g.p2.legsWon}</td>
        <td style="${!p1won ? 'font-weight:bold' : ''}">${g.p2.name} <small>${g.p2.totalDarts > 0 ? ((g.p2.totalScore * 3 / g.p2.totalDarts).toFixed(2)) : "0.00"}</small></td>
      `;
      vorrundeBody.appendChild(tr);
    });
  }

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
        <td>${p.unentschieden}</td>
        <td>${p.niederlagen}</td>
        <td>${p.legsPlus}</td>
        <td>${p.legsMinus}</td>
        <td>${p.punkte}</td>
        <td>${p.avg}</td>
      `;
      vorrundeTabelleBody.appendChild(tr);
    });
  }

  // ── DOM: Finalspiele
  const finalBody = document.getElementById("finalBody");
  if (finalBody) {
    finalBody.innerHTML = "";
    const labels = ["HF", "Finale"];
    finalGames.forEach((g, idx) => {
      if (!g.p1 || !g.p2) return;
      const p1won = g.winner?.spielerId === g.p1.spielerId;
      const tr    = document.createElement("tr");
      tr.innerHTML = `
        <td>${labels[idx] || `Spiel ${idx+1}`}</td>
        <td style="${p1won ? 'font-weight:bold' : ''}">${g.p1.name} <small>${g.p1.totalDarts > 0 ? ((g.p1.totalScore * 3 / g.p1.totalDarts).toFixed(2)) : "0.00"}</small></td>
        <td>${g.p1.legsWon}</td>
        <td>:</td>
        <td>${g.p2.legsWon}</td>
        <td style="${!p1won ? 'font-weight:bold' : ''}">${g.p2.name} <small>${g.p2.totalDarts > 0 ? ((g.p2.totalScore * 3 / g.p2.totalDarts).toFixed(2)) : "0.00"}</small></td>
      `;
      finalBody.appendChild(tr);
    });
  }

  // ── DOM: Abschlusstabelle
  const abschlussBody = document.getElementById("abschlussBody");
  if (abschlussBody) {
    abschlussBody.innerHTML = "";
    abschlussArray.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td>${p.spiele}</td>
        <td>${p.siege}</td>
        <td>${p.niederlagen}</td>
        <td>${p.legsPlus}</td>
        <td>${p.legsMinus}</td>
        <td>${p.avg}</td>
        <td>${p.doppelSum}</td>
        <td>${p.doppelQuot}</td>
        <td>${p.checkoutMax}</td>
        <td>${p.highscoreMax}</td>
      `;
      abschlussBody.appendChild(tr);
    });
  }
}

// ── Automatisch starten wenn Seite geladen
if (document.getElementById("abschlussBody") || document.getElementById("spielerTabelleBody")) {
  ladeSonderspieltag().catch(err => {
    console.error("Fehler:", err);
    document.body.insertAdjacentHTML("afterbegin", `
      <div style="background:#e84a4a;color:#fff;padding:12px;font-family:sans-serif">
        ⚠️ DB konnte nicht geladen werden: ${err.message}
      </div>
    `);
  });
}
