// ─────────────────────────────────────────────────────────────
// spieltag1.js – ES-Modul, Spieltag 1 (2026)
// ────
// 
// ─────────────────────────────────────────────────────────

import { getMasterPlayerId } from "./playermatcher.js";

const DB_URL = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-01-16.db";
const DB_URL2 = "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/2026-06-30.db";

const SPIELTAG_DATUM = {
  1: "2023-06-28",
  2: "2023-07-16",
  3: "2023-08-25",
  4: "2023-10-28",
  5: "2024-01-05",
  6: "2024-02-02",
  7: "2024-03-29",
  8: "2024-09-20"

};

const ARCHIV_SPIELTAGE = [
  { nr: 1, datum: SPIELTAG_DATUM[1], db: 1 },
  { nr: 2, datum: SPIELTAG_DATUM[2], db: 1 },
  { nr: 3, datum: SPIELTAG_DATUM[3], db: 1 },
  { nr: 4, datum: SPIELTAG_DATUM[4], db: 2 },
  { nr: 5, datum: SPIELTAG_DATUM[5], db: 1 },
  { nr: 6, datum: SPIELTAG_DATUM[6], db: 1 },
  { nr: 7, datum: SPIELTAG_DATUM[7], db: 1 },
  { nr: 8, datum: SPIELTAG_DATUM[8], db: 2 }
];

// sql.js nur einmal initialisieren
const SQL_READY = initSqlJs({
  locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
});

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function loadSqlRows(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];

  try {
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return rows;
}

const dbCache = new Map();


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function loadDatabase(which) {
  if (dbCache.has(which)) {
    return dbCache.get(which);
  }

  const url = which === 1 ? DB_URL : DB_URL2;

  const promise = (async () => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Datenbank ${which} konnte nicht geladen werden: HTTP ${response.status}`
      );
    }

    const buffer = await response.arrayBuffer();
    const SQL = await SQL_READY;

    return new SQL.Database(new Uint8Array(buffer));
  })();

  dbCache.set(which, promise);
  return promise;
}




function getGamesForDate(db, date) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);

  const next =
    `${nextDate.getFullYear()}-` +
    `${String(nextDate.getMonth() + 1).padStart(2, "0")}-` +
    `${String(nextDate.getDate()).padStart(2, "0")} 00:00:00`;

  const start = `${date} 00:00:00`;

  const rows = loadSqlRows(db, `
    SELECT
      ms.xGameMpId AS gameId,
      gs.spielerId,
      sp.name,
      m.siegerId,
      m.bestOfLegs,
      m.created_at AS createdAt,

      SUM(gs.gesamtDarts) AS totalDarts,
      SUM(gs.gesamtScore) AS totalScore,

      ROUND(
        SUM(gs.gesamtScore) * 3.0 /
        NULLIF(SUM(gs.gesamtDarts), 0), 2
      ) AS avg,

      SUM(
        CASE WHEN gs.spielerId = l.siegerId
        THEN 1 ELSE 0 END
      ) AS legsWon,

      COUNT(DISTINCT l.id) AS legsPlayed,

      SUM(COALESCE(auf.dartsOnDouble, 0))
        AS doppelVersuche,

      MAX(COALESCE(auf.highscore, 0))
        AS highscore,

      MAX(COALESCE(auf.highestcheckout, 0))
        AS highestcheckout

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
        MAX(
          CASE WHEN checkout = 1
          THEN score ELSE 0 END
        ) AS highestcheckout
      FROM AufnahmeMp
      GROUP BY entityId
    ) auf ON auf.entityId = gs.id

    WHERE m.created_at >= '${start}'
      AND m.created_at < '${next}'

    GROUP BY
      ms.xGameMpId,
      gs.spielerId,
      sp.name,
      m.siegerId,
      m.bestOfLegs,
      m.created_at

    ORDER BY m.created_at, ms.xGameMpId, gs.spielerId
  `);

  const byId = new Map();

  for (const row of rows) {
    row.name = getMasterPlayerId(row.name) || row.name;

    row.spielerId = Number(row.spielerId);
    row.siegerId = Number(row.siegerId);
    row.bestOfLegs = Number(row.bestOfLegs) || 0;
    row.legsWon = Number(row.legsWon) || 0;
    row.legsPlayed = Number(row.legsPlayed) || 0;
    row.totalDarts = Number(row.totalDarts) || 0;
    row.totalScore = Number(row.totalScore) || 0;
    row.avg = Number(row.avg) || 0;
    row.doppelVersuche = Number(row.doppelVersuche) || 0;
    row.highscore = Number(row.highscore) || 0;
    row.highestcheckout = Number(row.highestcheckout) || 0;

    if (!byId.has(row.gameId)) {
      byId.set(row.gameId, {
        id: row.gameId,
        createdAt: row.createdAt,
        bestOfLegs: row.bestOfLegs,
        p1: null,
        p2: null,
        winnerId: row.siegerId
      });
    }

    const game = byId.get(row.gameId);

    if (!game.p1) {
      game.p1 = row;
    } else if (!game.p2) {
      game.p2 = row;
    }
  }

  return [...byId.values()]
    .filter(g => g.p1 && g.p2)
    .map(g => ({
      ...g,
      winner:
        g.p1.spielerId === g.winnerId ? g.p1 :
        g.p2.spielerId === g.winnerId ? g.p2 :
        null
    }));
}

function classifyGames(games, spieltagNr) {
  const letzterSpieltag = spieltagNr === 8;

  const halbfinale = games.filter(g =>
    letzterSpieltag
      ? g.bestOfLegs === 9
      : g.bestOfLegs === 7
  );

  const platz3 = games.filter(g =>
    g.bestOfLegs === 9
  );

  const finale = games.filter(g =>
    g.bestOfLegs === (letzterSpieltag ? 13 : 11)
  );

  return { halbfinale, platz3, finale };
}

function scoreText(game) {
  return `${game.p1.legsWon} : ${game.p2.legsWon}`;
}

function renderMatchTable(games, title) {
  if (!games.length) {
    return `<p class="muted">Keine Spiele gefunden.</p>`;
  }

  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Spieler 1</th>
            <th>Avg.</th>
            <th>Ergebnis</th>
            <th>Avg.</th>
            <th>Spieler 2</th>
            <th>Best of</th>
          </tr>
        </thead>
        <tbody>
          ${games.map(g => `
            <tr>
              <td class="${
                g.winner?.spielerId === g.p1.spielerId ? "winner" : ""
              }">${escapeHtml(g.p1.name)}</td>
              <td>${g.p1.avg.toFixed(2)}</td>
              <td class="score">${scoreText(g)}</td>
              <td>${g.p2.avg.toFixed(2)}</td>
              <td class="${
                g.winner?.spielerId === g.p2.spielerId ? "winner" : ""
              }">${escapeHtml(g.p2.name)}</td>
              <td>${g.bestOfLegs || "–"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


function buildStats(games, spieltagNr) {
  const stats = new Map();
  const platzierung = new Map();

  const parts = classifyGames(games, spieltagNr);

  function setPlacement(game, winnerRank, loserRank) {
    if (!game || !game.p1 || !game.p2 || !game.winner) {
      return;
    }

    const winnerId = game.winner.spielerId;
    const loser = game.p1.spielerId === winnerId
      ? game.p2
      : game.p1;

    platzierung.set(winnerId, winnerRank);
    platzierung.set(loser.spielerId, loserRank);
  }

  // Platz 1 und 2 ergeben sich aus dem Finale.
  setPlacement(parts.finale[0], 1, 2);

  // Platz 3 und 4 ergeben sich aus dem Spiel um Platz 3.
  setPlacement(parts.platz3[0], 3, 4);

  // Statistiken nur aus Halbfinals, Spiel um Platz 3 und Finale.
  const relevanteSpiele = [
    ...parts.halbfinale,
    ...parts.platz3,
    ...parts.finale
  ];

  for (const game of relevanteSpiele) {
    for (const player of [game.p1, game.p2]) {
      if (!stats.has(player.spielerId)) {
        stats.set(player.spielerId, {
          spielerId: player.spielerId,
          name: player.name,
          games: 0,
          wins: 0,
          losses: 0,
          legsFor: 0,
          legsAgainst: 0,
          totalScore: 0,
          totalDarts: 0,
          highscore: 0,
          checkout: 0,
          doppelVersuche: 0,
          doppelTreffer: 0
        });
      }

      const s = stats.get(player.spielerId);

      s.games++;

      if (game.winner &&
          player.spielerId === game.winner.spielerId) {
        s.wins++;
      } else {
        s.losses++;
      }

      s.legsFor += player.legsWon;
      s.legsAgainst += Math.max(
        0,
        player.legsPlayed - player.legsWon
      );

      s.doppelVersuche += Number(player.doppelVersuche) || 0;
s.doppelTreffer += Number(player.legsWon) || 0;
      s.totalScore += player.totalScore;
      s.totalDarts += player.totalDarts;
      s.highscore = Math.max(s.highscore, player.highscore);
      s.checkout = Math.max(s.checkout, player.highestcheckout);
      
    }
  }

  return [...stats.values()]
    .map(s => ({
      ...s,
      platz: platzierung.get(s.spielerId) ?? 99,
      avg: s.totalDarts
        ? s.totalScore * 3 / s.totalDarts
        : 0,
      legDiff: s.legsFor - s.legsAgainst,
       doppelQuote: s.doppelVersuche
        ? s.doppelTreffer / s.doppelVersuche * 100
        : 0
    }))
    .sort((a, b) => a.platz - b.platz);
}


function renderStatsTable(games,spieltagNr) {
  const stats = buildStats(games,spieltagNr);

  if (!stats.length) {
    return `<p class="muted">Keine Spielerdaten vorhanden.</p>`;
  }

  return `
    <h3>Spielerstatistik / Endstand</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pl.</th><th>Spieler</th><th>Spiele</th>
            <th>Siege</th><th>Niederlagen</th>
            <th>Legs +</th><th>Legs −</th>
            <th>Leg-Diff.</th><th>3-Dart-Avg.</th>
            <th>Doppelversuche</th>
<th>Doppelquote</th>
            <th>Highscore</th><th>High Checkout</th>
          </tr>
        </thead>
        <tbody>
          ${stats.map((s, i) => `
            <tr>
              <td>${s.platz === 99 ? "–" : s.platz}</td>
              <td>${escapeHtml(s.name)}</td>
              <td>${s.games}</td>
              <td>${s.wins}</td>
              <td>${s.losses}</td>
              <td>${s.legsFor}</td>
              <td>${s.legsAgainst}</td>
              <td>${s.legDiff}</td>
              <td>${s.avg.toFixed(2)}</td>
              <td>${s.doppelVersuche}</td>
<td>${s.doppelQuote.toFixed(1)} %</td>
              <td>${s.highscore}</td>
              <td>${s.checkout}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    
  `;
}

function renderSpieltag(config, games) {
  const parts = classifyGames(games, config.nr);

  const allSorted = [...games].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)) ||
    String(a.id).localeCompare(String(b.id))
  );

  const warn = games.length === 0
    ? `<p class="empty">
         Für dieses Datum wurden keine Spiele gefunden.
         Bitte Datum und Datenbank prüfen.
       </p>`
    : "";

  return `
    <section class="spieltag" id="spieltag-${config.nr}">
      <h2>Spieltag ${config.nr}</h2>

      <p class="datum">
        ${formatDate(config.datum)} · ${games.length} Spiele
        · Datenbank ${config.db}
      </p>

      ${warn}

      ${renderMatchTable(parts.halbfinale, "Halbfinale – Best of 7")}
${renderMatchTable(parts.platz3, "Spiel um Platz 3")}
${renderMatchTable(parts.finale, "Finale – Best of 11")}

     ${renderStatsTable([
  ...parts.halbfinale,
  ...parts.platz3,
  ...parts.finale
], config.nr)}

     
    </section>
  `;
}

async function main() {

   const statusEl = document.getElementById("status");
  const archivEl = document.getElementById("archiv");

  if (!statusEl || !archivEl) {
    console.error(
      'HTML-Elemente mit id="status" und id="archiv" fehlen.'
    );
    return;
  }

  try {
    const results = [];

    for (const config of ARCHIV_SPIELTAGE) {
      const db = await loadDatabase(config.db);
      const games = getGamesForDate(db, config.datum);

      results.push(renderSpieltag(config, games));
    }

    archivEl.innerHTML = results.join("\n");

    const found = ARCHIV_SPIELTAGE.filter(config => {
      const section = archivEl.querySelector(
        `#spieltag-${config.nr}`
      );

      return section && !section.querySelector(".empty");
    }).length;

    statusEl.textContent =
      `Archiv geladen: ${ARCHIV_SPIELTAGE.length} konfigurierte Spieltage; ` +
      `bei ${found} Spieltagen wurden Spiele gefunden.`;

    if (found < ARCHIV_SPIELTAGE.length) {
      statusEl.classList.add("error");
    }
  } catch (error) {
    console.error("Fehler beim Laden des Archivs:", error);

    statusEl.classList.add("error");
    statusEl.textContent =
      `Archiv konnte nicht geladen werden: ${error.message}`;
  }
}

main();
