// ─────────────────────────────────────────────────────────────
// doppelgesamtstand.js – Gesamtübersicht Doppel (Einzelwertung)
// ─────────────────────────────────────────────────────────────

import { ladeDoppelSpieltag1 } from "./doppelspieltag1.js";
import { ladeDoppelSpieltag2 } from "./doppelspieltag2.js";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("Starte Doppel-Gesamtstand...");

    // ── Spieltage laden
    const alleSpieltage = await Promise.all([
      ladeDoppelSpieltag1(),
      ladeDoppelSpieltag2(),
    ]);

    console.log("Spieltage geladen:", alleSpieltage);

    const alleGames = alleSpieltage.flat();
    console.log("Gesamt Games:", alleGames.length);

    const stats = {};

    // ── JEDE PERSON EINZELN WERTEN (wie Einzel!)
    alleGames.forEach(g => {
      if (!g.p1 || !g.p2) return;

      [g.p1, g.p2].forEach(p => {

        if (!stats[p.spielerId]) {
          stats[p.spielerId] = {
            id: p.spielerId,
            name: p.name,
            spiele: 0,
            siege: 0,
            niederlagen: 0,
            legsPlus: 0,
            legsMinus: 0,
            totalScore: 0,
            totalDarts: 0,
            avg: 0
          };
        }

        const s = stats[p.spielerId];

        s.spiele++;

        const myLegs = Number(p.legsWon) || 0;

        const oppLegs =
          (p === g.p1)
            ? (Number(g.p2.legsWon) || 0)
            : (Number(g.p1.legsWon) || 0);

        if (myLegs > oppLegs) s.siege++;
        else s.niederlagen++;

        s.legsPlus += myLegs;
        s.legsMinus += oppLegs;

        s.totalScore += p.totalScore || 0;
        s.totalDarts += p.totalDarts || 0;
      });
    });

    // ── AVG berechnen
    Object.values(stats).forEach(s => {
      s.avg = s.totalDarts > 0
        ? (s.totalScore * 3 / s.totalDarts).toFixed(2)
        : "0.00";
    });

    // ── Tabelle füllen
    const table = document.getElementById("doppelGesamtBody");
    if (!table) {
      console.warn("Tabelle doppelGesamtBody nicht gefunden");
      return;
    }

    table.innerHTML = "";

    // 👉 HIER kannst du entscheiden wie sortiert wird:

    Object.values(stats)
      // 🔥 Variante 1: nach ID
      
.sort((a, b) =>
  b.siege - a.siege ||                 // 1️⃣ mehr Siege
  (b.legsPlus - b.legsMinus) - (a.legsPlus - a.legsMinus) || // 2️⃣ bessere Legdifferenz
  b.legsPlus - a.legsPlus ||          // 3️⃣ mehr gewonnene Legs
  a.legsMinus - b.legsMinus ||        // 4️⃣ weniger verlorene Legs
  b.avg - a.avg                       // 5️⃣ höherer AVG
)


      .forEach((p, i) => {
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
        `;

        table.appendChild(tr);
      });

  } catch (err) {
    console.error("Fehler Doppel Gesamtstand:", err);

    document.body.insertAdjacentHTML("afterbegin", `
      <div style="background:#e84a4a;color:#fff;padding:12px">
        ⚠️ Doppel Gesamtstand konnte nicht geladen werden: ${err.message}
      </div>
    `);
  }
});