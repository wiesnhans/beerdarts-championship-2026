// ─────────────────────────────────────────────────────────────
// beerdarts-db.js – Fertige Version für Spieltag 1 (2026)
// ─────────────────────────────────────────────────────────────

const DB_URL = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-01-16.db";
const SPIELTAG_NR = 1;

// Punkte
const PUNKTE_VORRUNDE = [5, 2, 0, 0]; // Platz 1–4 Vorrunde
const PUNKTE_FINAL = [10, 6, 3, 1];   // Endtabelle
const PUNKTE_HIGHSCORE = 2;
const PUNKTE_HIGHCO = 2;

// Spieltag-Datum
const SPIELTAG_DATUM = {
  1: "2026-01-09",
};

// ── sql.js Initialisierung
let SQL_READY = initSqlJs({
  locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
});

async function ladeSpiele() {
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
  let spieltagFilter = "";
  if (SPIELTAG_NR !== "all") {
    const datum = SPIELTAG_DATUM[SPIELTAG_NR];
    const start = `${datum} 00:00:00`;
    const end = new Date(`${datum}T00:00:00`);
    end.setDate(end.getDate() + 1);
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2,'0');
    const dd = String(end.getDate()).padStart(2,'0');
    const endStr = `${yyyy}-${mm}-${dd} 01:00:00`;
    spieltagFilter = `AND m.created_at >= '${start}' AND m.created_at < '${endStr}'`;
  }

  // ── Spiele aus DB laden
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
    WHERE gs.spielerId IN (2,3,4,6) ${spieltagFilter}
    GROUP BY ms.xGameMpId, gs.spielerId, sp.name, m.siegerId, m.bestOfLegs
    ORDER BY m.created_at, ms.xGameMpId, gs.spielerId
  `);

  // ── Spiele nach GameId gruppieren
  const gamesById = {};
  gameRows.forEach(g => {
    if (!gamesById[g.gameId]) gamesById[g.gameId] = { p1:null, p2:null, winner:null, bestOfLegs:g.bestOfLegs };
    const game = gamesById[g.gameId];
    if (!game.p1) game.p1 = g; else game.p2 = g;
    if (g.spielerId === g.siegerId) game.winner = g;
  });

  // ── Vorrunde / Finalspiele trennen
  const allowedPlayers = [2,3,4,6];
  let vorrundeGames = [];
  let finalGames = [];
  Object.values(gamesById).forEach(g => {
    if (!allowedPlayers.includes(g.p1?.spielerId) || !allowedPlayers.includes(g.p2?.spielerId)) return;
    if (g.bestOfLegs <= 3) vorrundeGames.push(g);
    else finalGames.push(g);
  });


   



// ── Spielerstatistiken Vorrunde (Best-of-3)
const vorrundeStats = {};
vorrundeGames.forEach(g => {
  [g.p1, g.p2].forEach(p => {
    if (!p) return; // falls Spieler nicht vorhanden

    if (!vorrundeStats[p.name]) vorrundeStats[p.name] = {
      name: p.name,
      spiele: 0,
      siege: 0,
      niederlagen: 0,
      legsPlus: 0,
      legsMinus: 0,
      totalScore:0, totalDarts:0, avg:0, 
      vorpunkte: 0,
      punkte: 0
    };

    const s = vorrundeStats[p.name];
    s.spiele += 1;

    const legsWon = Number(p.legsWon) || 0;
    const legsPlayed = Number(p.legsPlayed) || 0;

    if (p.spielerId === g.winner?.spielerId) {
      s.siege += 1;
      s.vorpunkte += 2; // 2 Punkte pro Sieg
    } else {
      s.niederlagen += 1;
    }

    s.legsPlus += legsWon;
    s.legsMinus += (legsPlayed - legsWon);
    s.totalScore += p.totalScore || 0;
      s.totalDarts += p.totalDarts || 0;
   });
});
 
Object.values(vorrundeStats).forEach(s => {
  s.avg = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
});

// ── Vorrundenplatzpunkte (für Endtabelle)
const vorrundeArray = Object.values(vorrundeStats)
  .sort((a,b) => b.vorpunkte - a.vorpunkte);



vorrundeArray.forEach((p,i) => {
  p.punkte = PUNKTE_VORRUNDE[i] || 0; // Platz 1 = 5, Platz 2 = 2, Rest 0
});
 

  // ── Gesamtstats Endtabelle (inkl. Finalrunde)
  const stats = {};
  const addStat = (g, isVorrunde = false) => {
    [g.p1, g.p2].forEach(p => {
      if (!stats[p.name]) stats[p.name] = {
        name: p.name, spiele:0, siege:0, niederlagen:0,
        legsPlus:0, legsMinus:0,
        totalScore:0, totalDarts:0, avg:0,  // <--- neu
        doppelSum:0, doppelQuot:0,
        checkoutMax:0, highscoreMax:0,
        punkte:0
      };
      const s = stats[p.name];
      s.spiele += 1;
      if (p.spielerId === g.winner?.spielerId) s.siege += 1; else s.niederlagen += 1;
      s.legsPlus += p.legsWon;
      s.legsMinus += (p.legsPlayed - p.legsWon);
      s.totalScore += p.totalScore || 0;
      s.totalDarts += p.totalDarts || 0;
      s.doppelSum += p.doppelVersuche || 0;
      s.checkoutMax = Math.max(s.checkoutMax, p.highestcheckout || 0);
      s.highscoreMax = Math.max(s.highscoreMax, p.highscore || 0);
       // ── Vorrundenpunkte hinzufügen
    if (isVorrunde && vorrundeStats[p.name]) {
      s.punkte = vorrundeStats[p.name].punkte || 0;
    }
     console.log(`DEBUG: ${p.name} -> totalScore: ${p.totalScore}, totalDarts: ${p.totalDarts}`);
    });
  };

  // ── Gesamtstats bauen
vorrundeGames.forEach(g => addStat(g, true));
finalGames.forEach(g => addStat(g));

  // ── Durchschnitt berechnen (TotalScore / TotalDarts * 3)
Object.values(stats).forEach(s => {
  s.avg = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
});

  // Doppelpunkte in Prozent
  Object.values(stats).forEach(s => {
    s.doppelQuot = s.doppelSum>0 ? ((s.legsPlus/s.doppelSum)*100).toFixed(2) : "0.00";
  });

 
 



  // Finalspiele Punkte
  if(finalGames.length>=4){
    const [hf1, hf2, spielUmPlatz3, finale] = finalGames;
    const siegerF = finale.winner.name;
    const verliererF = finale.p1.name===siegerF ? finale.p2.name : finale.p1.name;
    stats[siegerF].punkte += PUNKTE_FINAL[0];
    stats[verliererF].punkte += PUNKTE_FINAL[1];

    const siegerPl3 = spielUmPlatz3.winner.name;
    const verliererPl3 = spielUmPlatz3.p1.name===siegerPl3 ? spielUmPlatz3.p2.name : spielUmPlatz3.p1.name;
    stats[siegerPl3].punkte += PUNKTE_FINAL[2];
    stats[verliererPl3].punkte += PUNKTE_FINAL[3];
  }

  // ── Bonuspunkte (Highscore & Checkout) nur für Bestwerte
const allPlayers = Object.values(stats);

// Highscore-Bonus
const maxHighscore = Math.max(...allPlayers.map(p => p.highscoreMax || 0));
allPlayers.forEach(p => {
  if(p.highscoreMax === maxHighscore && maxHighscore > 0){
    p.punkte += PUNKTE_HIGHSCORE;
  }
});

// Checkout-Bonus
const maxCheckout = Math.max(...allPlayers.map(p => p.checkoutMax || 0));
allPlayers.forEach(p => {
  if(p.checkoutMax === maxCheckout && maxCheckout > 0){
    p.punkte += PUNKTE_HIGHCO;
  }
});



  // ── DOM: Vorrunde Tabelle
  const vorrundeTabelleBody = document.getElementById("spielerTabelleBody");
  if(vorrundeTabelleBody){
    vorrundeTabelleBody.innerHTML = "";
    vorrundeArray.forEach((p,i)=>{
     
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i+1}</td>
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
  if(vorrundeBody){
    vorrundeBody.innerHTML="";
    vorrundeGames.forEach(g=>{
      const p1won = g.winner?.spielerId===g.p1.spielerId;
      const tr = document.createElement("tr");
      tr.innerHTML=`
        <td style="${p1won?'font-weight:bold':''}">${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td>
        <td>:</td>
        <td>${g.p2.legsWon}</td>
        <td style="${!p1won?'font-weight:bold':''}">${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>
      `;
      vorrundeBody.appendChild(tr);
    });
  }

  // ── DOM: Finalrunde
  const finalBracketBody = document.getElementById("finalBracketBody");
  if(finalBracketBody && finalGames.length>=2){
    finalBracketBody.innerHTML="";
    finalGames.slice(0,2).forEach((g,idx)=>{
      const tr = document.createElement("tr");
      tr.innerHTML=`
        <td>HF${idx+1}</td>
        <td>${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td><td>:</td><td>${g.p2.legsWon}</td>
        <td>${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>`;
      finalBracketBody.appendChild(tr);
    });
  }

  const final2Body = document.getElementById("final2Body");
  if(final2Body && finalGames.length>=4){
    final2Body.innerHTML="";
    [["P3",2],["F",3]].forEach(([label,idx])=>{
      if(!finalGames[idx]) return;
      const g = finalGames[idx];
      const tr = document.createElement("tr");
      tr.innerHTML=`
        <td>${label}</td>
        <td>${g.p1.name} <small>${(+g.p1.avg).toFixed(2)}</small></td>
        <td>${g.p1.legsWon}</td><td>:</td><td>${g.p2.legsWon}</td>
        <td>${g.p2.name} <small>${(+g.p2.avg).toFixed(2)}</small></td>`;
      final2Body.appendChild(tr);
    });
  }

  // ── DOM: Endtabelle Gesamt (inkl. Finals & Bonus)
  const gesamtBody = document.getElementById("gesamtstandBody");
  if(gesamtBody){
    gesamtBody.innerHTML="";
    const gesamtArray = Object.values(stats).sort((a,b)=>b.punkte - a.punkte);
    gesamtArray.forEach((p,i)=>{
     
      const tr = document.createElement("tr");
      tr.innerHTML=`
        <td>${i+1}</td>
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

}

// ── Starten
ladeSpiele().catch(err=>{
  console.error("Fehler beim Laden der DB:", err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="background:#e84a4a;color:#fff;padding:12px;font-family:sans-serif">
      ⚠️ DB konnte nicht geladen werden: ${err.message}
    </div>`);
});