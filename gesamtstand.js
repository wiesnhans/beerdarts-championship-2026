// gesamtstand.js

// URLs für alle Spieltage
const spieltagUrls = [
  {
    v: "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/vorrundespieltag1.csv",
    f: "https://raw.githubusercontent.com/wiesnhans/beerdarts-championship-2026/refs/heads/main/finalsspieltag1.csv"
  }
  // weitere Spieltage hier ergänzen:
  // {
  //   v: "https://raw.githubusercontent.com/wiesnhans/.../vorrundespieltag2.csv",
  //   f: "https://raw.githubusercontent.com/wiesnhans/.../finalspieltag2.csv"
  // }
];

const stats = {}; // Gesamtstatistik pro Spieler

async function ladeGesamtstand() {

  for (const urls of spieltagUrls) {
    // CSVs laden
    const [vText, fText] = await Promise.all([urls.v, urls.f].map(u => fetch(u).then(r => r.text())));
    const vLines = vText.split("\n").filter(l => l.trim() !== "").slice(1);
    const fLines = fText.split("\n").filter(l => l.trim() !== "").slice(1);

    // Temporäre Spieltag-Stats
    const tempStats = {};
    const vArray = [];

    // Funktion um Spieler-Stats zu aktualisieren
    function addStats(cols) {
      const s1 = cols[2], s2 = cols[3];
      const legs1 = parseInt(cols[4]), legs2 = parseInt(cols[5]);
      const avg1 = parseFloat(cols[6].replace(",", ".")), avg2 = parseFloat(cols[7].replace(",", "."));
      const co1 = parseInt(cols[14] || 0), co2 = parseInt(cols[15] || 0);
      const hs1 = parseInt(cols[12] || 0), hs2 = parseInt(cols[13] || 0);

      [[s1, legs1, legs2, avg1, co1, hs1], [s2, legs2, legs1, avg2, co2, hs2]].forEach(([name, lp, lm, av, co, hs]) => {
        if (!tempStats[name]) tempStats[name] = {spiele:0,siege:0,niederlagen:0,legsPlus:0,legsMinus:0,avgSum:0,checkoutMax:0,highscoreMax:0};
        const d = tempStats[name];
        d.spiele++;
        d.legsPlus += lp;
        d.legsMinus += lm;
        d.avgSum += av;
        d.checkoutMax = Math.max(d.checkoutMax, co);
        d.highscoreMax = Math.max(d.highscoreMax, hs);
        if (lp > lm) d.siege++; 
        else if (lp < lm) d.niederlagen++;
      });
    }

    // Vorrunde auswerten
    vLines.forEach(l => addStats(l.split(",")));

    // Vorrundentabelle für Rangliste
    Object.keys(tempStats).forEach(n => {
      const d = tempStats[n];
      d.avg = d.spiele>0 ? d.avgSum/d.spiele : 0;
      vArray.push({name: n, legsPlus: d.legsPlus, legsMinus: d.legsMinus, avg: d.avg});
    });
    vArray.sort((a,b) => (b.legsPlus-b.legsMinus)-(a.legsPlus-a.legsMinus) || b.avg-a.avg);

    // Finalrunde auswerten
    fLines.forEach(l => addStats(l.split(",")));

    // Maxwerte für Bonuspunkte
    const maxCheckout = Math.max(...Object.values(tempStats).map(d => d.checkoutMax));
    const maxHighscore = Math.max(...Object.values(tempStats).map(d => d.highscoreMax));

    // Gewinner/Verlierer Halbfinale, Platz 3, Finale
    const [hf1,hf2,sp3,finale] = fLines.slice(0,4).map(l => l.split(","));
    const winnerFinal = parseInt(finale[4]) > parseInt(finale[5]) ? finale[2] : finale[3];
    const loserFinal  = winnerFinal===finale[2] ? finale[3] : finale[2];
    const winner3     = parseInt(sp3[4]) > parseInt(sp3[5]) ? sp3[2] : sp3[3];
    const loser3      = winner3===sp3[2] ? sp3[3] : sp3[2];

    const finalSorted = [winnerFinal, loserFinal, winner3, loser3];

    // Punkteberechnung und Gesamt-Stats aktualisieren
    finalSorted.forEach((n,i) => {
      const d = tempStats[n];
      let punkte = 0;

      // Vorrundenpunkte
      const vRank = vArray.findIndex(v => v.name === n);
      if (vRank===0) punkte += 5;
      else if (vRank===1) punkte += 2;

      // Finalpunkte
      if (i===0) punkte += 10; // Gesamtsieger
      else if (i===1) punkte += 6;
      else if (i===2) punkte += 3;
      else if (i===3) punkte += 1;

      // Bonuspunkte
      if(d.checkoutMax === maxCheckout) punkte += 2;
      if(d.highscoreMax === maxHighscore) punkte += 2;

      // Gesamtstatistik aktualisieren
      if (!stats[n]) stats[n] = {punkte:0, siegeV:0, gesamtS:0, avgSum:0, spiele:0};
      stats[n].punkte += punkte;

      // Siege zählen
      stats[n].siegeV += (vRank===0 ? 1 : 0);  // Tagessieg Vorrunde
      stats[n].gesamtS += (i===0 ? 1 : 0);    // Gesamtsieg Finalrunde

      // AVG summieren
      stats[n].avgSum += d.avgSum;
      stats[n].spiele += d.spiele;
    });
  } // Ende Spieltag-Loop

  // Tabelle füllen
  const tabelle = document.getElementById("gesamtstand");
  const spielerArray = Object.entries(stats)
    .map(([name,s]) => ({
      name,
      punkte: s.punkte,
      siegeV: s.siegeV,
      gesamtS: s.gesamtS,
      avg: s.spiele>0 ? (s.avgSum/s.spiele).toFixed(2) : "0.00"
    }))
    .sort((a,b) => b.punkte - a.punkte);

  spielerArray.forEach((s,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i+1}</td><td>${s.name}</td><td>${s.punkte}</td>
                    <td>${s.siegeV}</td><td>${s.gesamtS}</td><td>${s.avg}</td>`;
    tabelle.appendChild(tr);
  });
}

// Aufruf
ladeGesamtstand();
