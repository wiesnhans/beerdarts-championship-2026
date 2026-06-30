// ─────────────────────────────────────────────────────────────
// gesamtstand.js – Gesamtübersicht über alle Spieltage
// ─────────────────────────────────────────────────────────────

import { ladeSpieltagDaten } from './spieltag1.js';
import { ladeSpieltagDaten as ladeSpieltagDaten2 } from './spieltag2.js';
// Für weitere Spieltage einfach ergänzen:
// import { ladeSpieltagDaten as ladeSpieltagDaten2 } from './spieltag2.js';

async function berechneGesamtstand() {
  const stats = {};

  // ── Alle Spieltage laden (await, da async)
  const alleSpieltage = await Promise.all([
    ladeSpieltagDaten(),
    ladeSpieltagDaten2(),  // <-- Spieltag 2 hier einkommentieren wenn fertig
  ]);

  // ── Daten zusammenführen
  alleSpieltage.forEach(spieltagArray => {
    spieltagArray.forEach(s => {
      if (!stats[s.name]) {
        stats[s.name] = {
          name:      s.name,
          punkte:    0,
          siegeV:    0,   // Vorrundensiege
          gesamtS:   0,   // Gesamtsiege (Finalsieger)
          totalScore: 0, totalDarts: 0, avg: 0,
          spieltage: 0,    // Anzahl Spieltage zur AVG-Berechnung
          legsPlus:0,
          doppelSum:0,
          doppelQuot:0
        };
      }
      stats[s.name].punkte    += s.punkte;
      stats[s.name].siegeV    += s.vorrundenSieger;
      stats[s.name].gesamtS   += s.gesamtSieger;
      stats[s.name].totalDarts    += s.totalDarts;
      stats[s.name].totalScore    += s.totalScore;
      stats[s.name].legsPlus    += s.legsPlus;
      stats[s.name].doppelSum    += s.doppelSum;
      stats[s.name].spieltage += 1;

    });
  });

  // ── Durchschnitt über alle Spieltage
  Object.values(stats).forEach(s => {
    s.avg = s.totalDarts > 0 ? (s.totalScore * 3 / s.totalDarts).toFixed(2) : "0.00";
    s.doppelQuot = s.doppelSum  > 0 ? ((s.legsPlus / s.doppelSum) * 100).toFixed(2) : "0.00";
  });

  // ── DOM: Gesamtstand-Tabelle füllen
  const tabelleBody = document.getElementById("gesamtstandBody2");
  if (!tabelleBody) {
    console.warn("Element #gesamtstandBody nicht gefunden.");
    return;
  }

  tabelleBody.innerHTML = "";
  Object.values(stats)
    .sort((a, b) => b.punkte - a.punkte)
    .forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${s.name}</td>
        <td>${s.punkte}</td>
        <td>${s.siegeV}</td>
        <td>${s.gesamtS}</td>
        <td>${s.avg}</td>
        <td>${s.doppelQuot} %</td>
      `;
      tabelleBody.appendChild(tr);
    });
}

// ── Starten & Fehler anzeigen
berechneGesamtstand().catch(err => {
  console.error("Fehler beim Laden der Gesamtstand-Daten:", err);
  document.body.insertAdjacentHTML("afterbegin", `
    <div style="background:#e84a4a;color:#fff;padding:12px;font-family:sans-serif">
      ⚠️ Gesamtstand konnte nicht geladen werden: ${err.message}
    </div>
  `);
});
