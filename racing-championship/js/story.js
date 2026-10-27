/* ============================================================
   STORY.JS — Narrative text for intros, outros, championship beats
   ============================================================ */

const STORY = {
  prologue: `Three years of junior categories. Two heartbreaking near-misses. One phone call that changed everything.
You are Charles Dumont, newly promoted to Falcon Racing's senior team for the biggest season of your career. Your teammate,
Lewis Baron, is a proven race-winner — fast, consistent, and not about to hand you anything. Across the paddock, Viktor
Kessler of Titan GP has made no secret of his plan to end your rookie title charge before it starts.

Five races. Five circuits that test every skill a driver has. The championship starts now.`,

  raceIntros: {
    sepang: `ROUND 1 — SEPANG, MALAYSIA\n\nThe air is thick enough to drink. Under the floodlit grandstands, heat shimmers off the tarmac as the grid forms up. Somewhere beyond the tree line, dark clouds are already building — Sepang has a habit of turning a routine afternoon into chaos with almost no warning. Lewis gives you a nod on the way to his car: "Whatever happens today, happens fast. Stay sharp."`,
    singapore: `ROUND 2 — MARINA BAY, SINGAPORE\n\nThe lights of the city skyline bounce off the harbour as the cars roll out under the floodlights. Marina Bay is unforgiving — concrete walls inches from your front wing for nineteen corners, bumps that will shake your fillings loose, and a near-certainty that somewhere tonight, someone's race ends in the barriers. Viktor's Titan GP car sits two rows ahead on the grid. He doesn't look back.`,
    monza: `ROUND 3 — MONZA, ITALY\n\nThe Temple of Speed. Low wings, long straights, and a crowd that lives and breathes for this sport like nowhere else. It's the kind of track where mistakes are rare but unforgiving — and where a single bold strategy call can swing an entire afternoon. The tifosi roar as the formation lap begins.`,
    spa: `ROUND 4 — SPA-FRANCORCHAMPS, BELGIUM\n\nThe Ardennes forest stretches out under a sky that can't decide what it wants to do. It might be bone dry through Eau Rouge and pouring at Pouhon — the locals just shrug and call it "Spa weather." Lewis is ahead of you in the championship fight for the team, Viktor is breathing down both your necks, and the forecast is giving no one any comfort.`,
    silverstone: `ROUND 5 — SILVERSTONE, UNITED KINGDOM — THE FINALE\n\nIt comes down to this. Wherever the standings sit heading into this weekend, Silverstone will have the final word. The British crowd is deafening, the sky is doing its usual impression of indecision, and every driver on the grid knows that whatever happens over the next ninety minutes can't be undone. Lights out for the title.`,
  },

  weatherFlavor: {
    sepang: 'Heat haze shimmers off the pit lane — this heat chews through tires fast.',
    singapore: 'The walls of Marina Bay never forgive a mistake.',
    monza: 'Low drag, high speed — Monza rewards bravery on the brakes.',
    spa: 'The Ardennes forest makes its own rules about the weather.',
    silverstone: 'Silverstone\'s wide, fast corners punish anyone who isn\'t precise.',
  },

  resultLine(position, trackName) {
    if (position === 1) return `You take the chequered flag first at ${trackName}! A superb victory.`;
    if (position === 2) return `You cross the line in P2 at ${trackName} — so close to the win.`;
    if (position === 3) return `A podium finish at ${trackName}! Solid points in the bag.`;
    if (position <= 10) return `You bring the car home in P${position} at ${trackName} — points on the board.`;
    return `A tough day — you finish outside the points at ${trackName}.`;
  },

  dnfLine(trackName) {
    return `Your race at ${trackName} ends early. A hard one to take, but the championship marches on.`;
  },

  standingsBlurb(standings, playerId, roundIndex, totalRounds) {
    const playerPos = standings.findIndex(s => s.id === playerId) + 1;
    const leader = standings[0];
    if (roundIndex === totalRounds) {
      if (leader.id === playerId) {
        return `It's done. You've won the championship! Lewis and the rest of the paddock know it too — Falcon Racing's new number one has arrived.`;
      }
      return `The championship goes to ${leader.name}. It stings, but the season has given you a foundation to build on — and a rivalry that isn't going away.`;
    }
    if (leader.id === playerId) {
      return `You head to the next round leading the championship by ${leader.points - (standings[1]?.points || 0)} points. Keep your head down.`;
    }
    const gap = leader.points - (standings.find(s => s.id === playerId)?.points || 0);
    return `You sit P${playerPos} in the standings, ${gap} points off ${leader.name} at the top. Everything is still in play.`;
  },
};

if (typeof module !== 'undefined') {
  module.exports = { STORY };
}
