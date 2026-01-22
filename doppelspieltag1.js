fetch('doppelspieltag1.csv')
  .then(r => r.text())
  .then(csvText => {
    const lines = csvText.trim().split('\n');
    const table = document.getElementById('vorrundeSpiele');

    // Header überspringen
    lines.slice(1).forEach(line => {
      const [uid, modus, spieler1, spieler2, leg1, leg2, avg1, avg2] = line.split(',');

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td><span>${spieler1}</span> <small>${parseFloat(avg1).toFixed(2)}</small></td>
        <td colspan="3" style="text-align:center">${leg1}:${leg2}</td>
        <td><span>${spieler2}</span> <small>${parseFloat(avg2).toFixed(2)}</small></td>
      `;

      table.appendChild(tr);
    });
  });
