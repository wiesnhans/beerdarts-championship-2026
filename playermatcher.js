export const players = {
  Wiesnhans60: ["hans", "wiesnhans60"],
  Juju1337: ["juju", "juju1337", "julian"],
  Hase4: ["hase", "hase4"],
  Herminator9247: ["hermann", "herminator9247"],
    WiesnJu: [
    "wiesnju",
    "wiesn ju",
    "hans julian",
    "julian hans"
  ],

  WiesNator: [
    "wiesnator",
    "wiesn nator",
    "hans hermann",
    "hermann hans"
  ],

  Hasinator: [
    "hasinator",
    "hase nator",
    "hase hermann",
    "hermann hase"
  ],

  WiesnHase: [
    "wiesnhase",
    "wiesn hase",
    "hans hase",
    "hase hans"
  ],

  JuNator: [
    "junator",
    "ju nator",
    "julian hermann",
    "hermann julian"
  ],

  JuHase: [
    "juhase",
    "ju hase",
    "julian hase",
    "hase julian"
  ]


};

export function normalize(name) {
  return name.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

export function getMasterPlayerId(name) {
  const n = normalize(name);

  for (const [master, variants] of Object.entries(players)) {
    for (const v of variants) {
      if (n === normalize(v)) {
        return master;
      }
    }
  }

  return null;
}