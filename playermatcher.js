export const players = {
  Wiesnhans60: ["hans", "wiesnhans60"],
  Juju1337: ["juju", "hans juju1337", "julian"],
  Hase4: ["hase", "hase4"],
  Herminator9247: ["hermann", "herminator9247"]
};

export function normalize(name) {
  return name.toLowerCase().replace(/[^\w\s]/g, "");
}

export function getMasterPlayerId(name) {
  const n = normalize(name);

  for (const [master, variants] of Object.entries(players)) {
    for (const v of variants) {
      if (n.includes(v) || v.includes(n)) {
        return master;
      }
    }
  }

  return null;
}