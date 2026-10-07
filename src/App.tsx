import React, { useState, useEffect, useMemo } from 'react';

export type RideStatus = 'OPEN' | 'TEMPORARILY_CLOSED' | 'REFURBISHMENT' | 'CLOSED_FOR_DAY';

export interface ScheduleEvent {
  type: string;
  label: string;
  desc?: string;
  hours: string;
  activeNow: boolean;
  openingTime?: string;
  closingTime?: string;
}

export interface ParkInfo {
  name: string;
  hours: string;
  isOpen: boolean;
  isExtraEventActive: boolean;
  activeEventName?: string;
  events: ScheduleEvent[];
  openingTime?: string;
  closingTime?: string;
}

export interface RideItem {
  id: string;
  name: string;
  park: string;
  wait: number;
  status: RideStatus;
  statusText: string;
}

export interface DowntimeIncident {
  downAt: string;
  upAt?: string;
  durationMinutes?: number;
}

export interface RideDowntimeHistory {
  ride_name: string;
  park_name: string;
  isCurrentlyDown: boolean;
  currentDownSince?: string;
  currentDownMinutes: number;
  incidentsToday: DowntimeIncident[];
  totalDowntimesToday: number;
  avgRecoveryMinutesToday?: number;
  lastRecoveryMinutes?: number;
  // Disk Audit Log Fields
  logFilePath?: string;
  logFileName?: string;
  allTimeIncidentsTotal?: number;
  allTimeAvgRecoveryMinutes?: number;
  allTimeMedianRecoveryMinutes?: number;
  shortestRecoveryMinutes?: number;
  longestRecoveryMinutes?: number;
  reliabilityScore?: number;
  recentLogLines?: string[];
  lastDownTimeStr?: string;
  lastUpTimeStr?: string;
}

export interface WaitData {
  playlist: RideItem[];
  top_5: RideItem[];
  hours: Record<string, string>;
  park_info: Record<string, ParkInfo>;
  ai_tips: string[];
  last_updated: string;
  delayed_rides: RideItem[];
  any_park_active?: boolean;
  downtime_history?: Record<string, RideDowntimeHistory>;
}

const DEFAULT_HOURS: Record<string, string> = {
  "Magic Kingdom": "8:00 AM - 6:00 PM",
  "EPCOT": "9:00 AM - 9:00 PM",
  "Hollywood Studios": "9:00 AM - 9:00 PM",
  "Animal Kingdom": "8:00 AM - 7:00 PM",
  "Universal Studios Florida": "9:00 AM - 5:00 PM",
  "Islands of Adventure": "9:00 AM - 8:00 PM",
  "Epic Universe": "10:00 AM - 8:00 PM",
};

const PARK_NAMES = [
  "Magic Kingdom",
  "EPCOT",
  "Hollywood Studios",
  "Animal Kingdom",
  "Universal Studios Florida",
  "Islands of Adventure",
  "Epic Universe",
];

// Major tier-1 headliner attractions for algorithmic prioritization
const HEADLINERS: Record<string, string[]> = {
  "Magic Kingdom": [
    "Seven Dwarfs Mine Train",
    "TRON Lightcycle / Run",
    "Space Mountain",
    "Big Thunder Mountain Railroad",
    "Haunted Mansion",
    "Peter Pan's Flight",
    "Pirates of the Caribbean"
  ],
  "EPCOT": [
    "Guardians of the Galaxy: Cosmic Rewind",
    "Test Track",
    "Frozen Ever After",
    "Soarin' Around the World",
    "Remy's Ratatouille Adventure"
  ],
  "Hollywood Studios": [
    "Star Wars: Rise of the Resistance",
    "Slinky Dog Dash",
    "The Twilight Zone Tower of Terror™",
    "Millennium Falcon: Smugglers Run",
    "Mickey & Minnie's Runaway Railway",
    "Rock ’n’ Roller Coaster"
  ],
  "Animal Kingdom": [
    "Avatar Flight of Passage",
    "Expedition Everest - Legend of the Forbidden Mountain",
    "Kilimanjaro Safaris",
    "Na'vi River Journey",
    "DINOSAUR"
  ],
  "Universal Studios Florida": [
    "Harry Potter and the Escape from Gringotts™",
    "Revenge of the Mummy",
    "Hollywood Rip Ride Rockit",
    "MEN IN BLACK™ Alien Attack!™",
    "TRANSFORMERS: The Ride-3D"
  ],
  "Islands of Adventure": [
    "Jurassic World VelociCoaster",
    "Hagrid's Magical Creatures Motorbike Adventure™",
    "The Incredible Hulk Coaster®",
    "Harry Potter and the Forbidden Journey™",
    "Dudley Do-Right's Ripsaw Falls®"
  ],
  "Epic Universe": [
    "Stardust Racers",
    "Monsters Unchained: The Frankenstein Experiment",
    "Curse of the Werewolf",
    "Constellation Carousel"
  ]
};

export interface RopeDropTarget {
  target: string;
  timing: string;
  expectedWait: string;
  rationale: string;
  backupIfDown: string;
}

const ROPE_DROP_PLANS: Record<string, RopeDropTarget[]> = {
  "Magic Kingdom": [
    {
      target: "Seven Dwarfs Mine Train (Fantasyland)",
      timing: "Early Entry (8:30 AM)",
      expectedWait: "15–25 min (surges to 85m by 9:45 AM)",
      rationale: "Highest sustained queue in the park. Riding during Early Entry saves 60+ minutes of midday Florida sun standby.",
      backupIfDown: "Immediately pivot to Peter Pan's Flight or Space Mountain."
    },
    {
      target: "Peter Pan's Flight or Space Mountain",
      timing: "Regular Park Open (9:00 AM)",
      expectedWait: "10–20 min",
      rationale: "Peter Pan has a slow-moving queue; knocking it out right at 9:00 AM clears Fantasyland before general admission floods in.",
      backupIfDown: "Head to Big Thunder Mountain Railroad in Frontierland."
    },
    {
      target: "Big Thunder Mountain & Pirates of the Caribbean",
      timing: "Mid-Morning (9:45 AM – 10:30 AM)",
      expectedWait: "15–25 min",
      rationale: "Frontierland and Adventureland wake up slower than Tomorrowland and Fantasyland. You can often walk straight onto Pirates and Big Thunder.",
      backupIfDown: "Haunted Mansion in Liberty Square."
    },
    {
      target: "TRON Lightcycle / Run & Tiana's Bayou Adventure",
      timing: "Virtual Queue / Late Afternoon Drop (1:00 PM)",
      expectedWait: "Virtual Queue Return Time",
      rationale: "Utilize the 1:00 PM in-park drop or single rider options to minimize queue time.",
      backupIfDown: "Buzz Lightyear's Space Ranger Spin."
    }
  ],
  "EPCOT": [
    {
      target: "Remy's Ratatouille Adventure (France Pavilion)",
      timing: "Early Entry via International Gateway (8:30 AM)",
      expectedWait: "15–25 min (surges to 80m+ by 10 AM)",
      rationale: "If entering from the Skyliner/Crescent Lake Resorts (International Gateway), Remy is a 2-minute walk. Rush it before front-gate crowds arrive.",
      backupIfDown: "Pivot across World Showcase lagoon to Frozen Ever After (Norway)."
    },
    {
      target: "Frozen Ever After (Norway Pavilion)",
      timing: "Early Entry via Main Entrance (8:30 AM)",
      expectedWait: "20–30 min",
      rationale: "If entering from the Front Monorail Entrance, Frozen is closer than France. Knock it out before World Showcase fully opens at 11:00 AM.",
      backupIfDown: "Soarin' Around the World in The Land Pavilion."
    },
    {
      target: "Test Track / Soarin' Around the World",
      timing: "Regular Open (9:00 AM – 10:00 AM)",
      expectedWait: "15–25 min",
      rationale: "The Land Pavilion has high dispatch capacity. Soarin' queues move fast early in the morning.",
      backupIfDown: "Mission: SPACE or Spaceship Earth."
    },
    {
      target: "Guardians of the Galaxy: Cosmic Rewind",
      timing: "Virtual Queue (7:00 AM or 1:00 PM)",
      expectedWait: "Boarding Group",
      rationale: "Secure your boarding group through My Disney Experience; monitor standby single rider if available.",
      backupIfDown: "Living with the Land."
    }
  ],
  "Hollywood Studios": [
    {
      target: "Star Wars: Rise of the Resistance (Galaxy's Edge)",
      timing: "Early Entry (8:00 AM / 8:30 AM)",
      expectedWait: "25–35 min (surges to 110m+ by 9:45 AM)",
      rationale: "The undisputed mega-headliner of Walt Disney World. Riding first thing saves almost two hours of Florida heat standby.",
      backupIfDown: "DO NOT WAIT OUTSIDE A BROKEN DOOR! Immediately pivot to Slinky Dog Dash or Mickey & Minnie's Runaway Railway."
    },
    {
      target: "Slinky Dog Dash (Toy Story Land)",
      timing: "Early Entry Alternative (8:00 AM)",
      expectedWait: "20–30 min (surges to 90m)",
      rationale: "Low capacity coaster with high family demand. If you don't care about Star Wars, this is the #1 Early Entry sprint target.",
      backupIfDown: "Toy Story Mania (walk-on first 30 mins) or Runaway Railway."
    },
    {
      target: "The Twilight Zone Tower of Terror™",
      timing: "Mid-Morning (9:30 AM – 10:30 AM)",
      expectedWait: "25–35 min",
      rationale: "Sunset Boulevard is relatively quiet during early entry because 80% of crowds rush to Galaxy's Edge and Toy Story Land.",
      backupIfDown: "Rock 'n' Roller Coaster Starring Aerosmith."
    },
    {
      target: "Millennium Falcon: Smugglers Run",
      timing: "Afternoon (1:00 PM – 3:00 PM)",
      expectedWait: "Single Rider (15 min) or Standby during showtimes",
      rationale: "Use the dedicated Single Rider line to experience Smugglers Run in under 15 minutes even during peak hours.",
      backupIfDown: "Star Tours – The Adventures Continue."
    }
  ],
  "Animal Kingdom": [
    {
      target: "Avatar Flight of Passage (Pandora)",
      timing: "Early Entry (7:30 AM / 8:00 AM)",
      expectedWait: "25–35 min (surges to 120m by 9:30 AM)",
      rationale: "The longest queue at Animal Kingdom. Being at the turnstiles 45 minutes before Early Entry lets you walk directly into the bioluminescent caves.",
      backupIfDown: "Immediately walk on to Na'vi River Journey next door."
    },
    {
      target: "Kilimanjaro Safaris (Africa)",
      timing: "Park Open (8:30 AM – 9:30 AM)",
      expectedWait: "10–20 min",
      rationale: "Animals are the most active and visible during the cool morning hours! Midday heat causes lions, rhinos, and elephants to sleep in shaded brush.",
      backupIfDown: "Expedition Everest in Asia."
    },
    {
      target: "Expedition Everest - Legend of the Forbidden Mountain",
      timing: "Mid-Morning (10:00 AM – 11:30 AM)",
      expectedWait: "15–20 min (Single Rider: 5 min)",
      rationale: "Dual loading platforms and high train dispatch rate keep Everest queues manageable until midday.",
      backupIfDown: "DINOSAUR in DinoLand U.S.A."
    },
    {
      target: "Festival of the Lion King & Feathered Friends in Flight",
      timing: "Afternoon (1:00 PM – 3:00 PM)",
      expectedWait: "Next Show Cycle",
      rationale: "Air-conditioned indoor seating during peak Florida sun.",
      backupIfDown: "Kali River Rapids."
    }
  ],
  "Universal Studios Florida": [
    {
      target: "Harry Potter and the Escape from Gringotts™ (Diagon Alley)",
      timing: "Early Park Admission (8:00 AM)",
      expectedWait: "15–25 min (surges to 75m+)",
      rationale: "Diagon Alley is deeply atmospheric in the morning before crowds arrive. Gringotts queue moves quickly early.",
      backupIfDown: "Revenge of the Mummy."
    },
    {
      target: "Revenge of the Mummy (New York)",
      timing: "Regular Open (9:00 AM)",
      expectedWait: "10–20 min",
      rationale: "Fast dispatches and high indoor capacity make Mummy the best morning coaster run in the park.",
      backupIfDown: "TRANSFORMERS: The Ride-3D."
    },
    {
      target: "Hollywood Rip Ride Rockit & Transformers",
      timing: "Mid-Morning (10:00 AM – 11:30 AM)",
      expectedWait: "20–30 min",
      rationale: "Hit front-of-park coasters while guests are exploring Wizarding World in the back.",
      backupIfDown: "MEN IN BLACK™ Alien Attack!™"
    },
    {
      target: "Hogwarts™ Express (King's Cross Station)",
      timing: "Park Hop Window (11:30 AM – 1:00 PM)",
      expectedWait: "25–35 min",
      rationale: "Take the train over to Islands of Adventure before peak afternoon transfer crowds.",
      backupIfDown: "E.T. Adventure."
    }
  ],
  "Islands of Adventure": [
    {
      target: "Hagrid's Magical Creatures Motorbike Adventure™",
      timing: "Early Park Admission (8:00 AM)",
      expectedWait: "35–45 min (surges to 120m+ midday)",
      rationale: "The most popular ride in Universal Orlando. Does NOT use Universal Express Pass, so morning standby is the premier strategy.",
      backupIfDown: "DO NOT WAIT IN RAIN OR DOWN! Immediately sprint to Jurassic World VelociCoaster."
    },
    {
      target: "Jurassic World VelociCoaster",
      timing: "Post-Hagrid's (8:45 AM – 9:30 AM)",
      expectedWait: "20–35 min",
      rationale: "VelociCoaster dispatches four trains simultaneously. Hitting it before 10:00 AM avoids the 75+ min peak queue.",
      backupIfDown: "Harry Potter and the Forbidden Journey™ in Hogsmeade."
    },
    {
      target: "The Incredible Hulk Coaster® & Spider-Man",
      timing: "Late Morning (10:30 AM – 12:00 PM)",
      expectedWait: "20–30 min",
      rationale: "Marvel Super Hero Island has high capacity and short early lines as most crowds stay in Hogsmeade and Jurassic Park.",
      backupIfDown: "The Amazing Adventures of Spider-Man."
    },
    {
      target: "Popeye & Blount's Bilge-Rat Barges / Dudley Do-Right",
      timing: "Mid-Afternoon (1:30 PM – 3:30 PM)",
      expectedWait: "25–35 min",
      rationale: "Ride when Florida heat peaks! You WILL get soaked from head to toe.",
      backupIfDown: "Skull Island: Reign of Kong."
    }
  ],
  "Epic Universe": [
    {
      target: "Stardust Racers (Celestial Park)",
      timing: "Park Opening (9:00 AM)",
      expectedWait: "25–35 min",
      rationale: "Dual-launch racing coaster with inverted crossover maneuver. High capacity dispatch.",
      backupIfDown: "Monsters Unchained: The Frankenstein Experiment in Dark Universe."
    },
    {
      target: "Monsters Unchained: The Frankenstein Experiment",
      timing: "Morning (9:45 AM – 10:30 AM)",
      expectedWait: "30–40 min",
      rationale: "Next-gen robotic dark ride with intense creature animatronics in Darkmoor.",
      backupIfDown: "Mine-Cart Madness™ in Donkey Kong Country."
    },
    {
      target: "Harry Potter & the Battle at the Ministry™",
      timing: "Mid-Day / Early Afternoon",
      expectedWait: "45–60 min",
      rationale: "Explore Place Cachée in 1920s Paris and the British Ministry of Magic.",
      backupIfDown: "Mario Kart™: Bowser's Challenge."
    },
    {
      target: "Mario Kart™: Bowser's Challenge & Yoshi's Adventure",
      timing: "Late Afternoon / Evening",
      expectedWait: "35–50 min",
      rationale: "Super Nintendo World evening lighting is spectacular and wait times soften as families with young children head to dinner.",
      backupIfDown: "Constellation Carousel."
    }
  ]
};

function getRideCategory(name: string) {
  const lower = name.toLowerCase();
  const isCoaster = /coaster|mountain|hulk|velocicoaster|hagrid|stardust|flight of passage|mummy|rockit|tron|slinky|everest|guardians/i.test(lower);
  const isWater = /falls|river|splash|barge|bilge|raft|flume|water|typhoon|blizzard|bay|seuss/i.test(lower);
  const isIndoor = /space|mansion|pirates|peter pan|mickey|buzz|transit|carousel|tiki|small world|philharmagic|soarin|test track|remy|nemo|frozen|tower of terror|smugglers run|rise of the resistance|runaway railway|dinosaur|safaris|gringotts|transformers|men in black|spider-man|villain-con|hall of presidents/i.test(lower) || (!isWater && !/roller|coasting|outdoor|train/i.test(lower));
  const isFamily = !isCoaster || /seven dwarfs|slinky|barnstormer|flight of the hippogriff/i.test(lower);
  return { isCoaster, isWater, isIndoor, isFamily };
}

function playMagicFanfare() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.09);
      osc.stop(ctx.currentTime + idx * 0.09 + 0.38);
    });
  } catch {
    // audio context blocked until user gesture
  }
}

interface MOWDPrediction {
  category: string;
  expectedMinutes: number;
  elapsedMinutes: number;
  totalCycleMinutes: number;
  predictedTimeString: string;
  confidence: number;
  cause: string;
  reopenAdvantage: 'MASSIVE WALK-ON' | 'HIGH ADVANTAGE' | 'MODERATE';
  historyNote: string;
  totalDowntimesToday: number;
  pastDurations: number[];
  avgPastRecovery?: number;
  extendedDelay: boolean;
  // Audit log metadata
  allTimeCount?: number;
  allTimeAvg?: number;
  reliabilityScore?: number;
  logFileName?: string;
  logFilePath?: string;
}

function computeMOWDUptime(rideName: string, history?: RideDowntimeHistory): MOWDPrediction {
  const name = rideName.toLowerCase();
  let baseMinutes = 24;
  let confidence = 73.2;
  let category = 'Mechanical System';
  let cause = 'Ride control diagnostics & track verification';
  let reopenAdvantage: 'MASSIVE WALK-ON' | 'HIGH ADVANTAGE' | 'MODERATE' = 'HIGH ADVANTAGE';

  if (
    name.includes('coaster') || name.includes('mountain') || name.includes('slinky') || 
    name.includes('mine train') || name.includes('tron') || name.includes('velocicoaster') || 
    name.includes('hagrid') || name.includes('hulk') || name.includes('rip ride') || 
    name.includes('mummy') || name.includes('gringotts') || name.includes('stardust') ||
    name.includes('everest') || name.includes('barnstormer')
  ) {
    category = 'Block-Zone Coaster';
    baseMinutes = 28;
    confidence = 74.8;
    cause = 'Block zone sensor reset & empty test train dispatch';
    reopenAdvantage = 'MASSIVE WALK-ON';
  } else if (name.includes('rise of the resistance') || name.includes('ratatouille') || name.includes('runaway railway')) {
    category = 'Trackless LPS System';
    baseMinutes = 44;
    confidence = 69.2;
    cause = 'LPS localization fault & vehicle dispatch re-sync';
    reopenAdvantage = 'MASSIVE WALK-ON';
  } else if (name.includes('splash') || name.includes('tiana') || name.includes('pirates') || name.includes('ripsaw') || name.includes('river') || name.includes('jurassic park river') || name.includes('splash \'n\' soak')) {
    category = 'Water Flume / Feature';
    baseMinutes = 30;
    confidence = 72.4;
    cause = 'Water pressure sensor check & pump verification';
    reopenAdvantage = 'HIGH ADVANTAGE';
  } else if (name.includes('flight of passage') || name.includes('soarin') || name.includes('star tours') || name.includes('smugglers run') || name.includes('transformers') || name.includes('forbidden journey') || name.includes('simpsons') || name.includes('despicable me')) {
    category = 'Motion Simulator';
    baseMinutes = 22;
    confidence = 77.5;
    cause = 'Hydraulic/electric motion base calibration cycle';
    reopenAdvantage = 'HIGH ADVANTAGE';
  } else if (name.includes('haunted mansion') || name.includes('spaceship earth') || name.includes('peoplemover') || name.includes('peter pan') || name.includes('buzz lightyear') || name.includes('under the sea') || name.includes('alien attack') || name.includes('cat in the hat')) {
    category = 'Omnimover Continuous Flow';
    baseMinutes = 16;
    confidence = 81.6;
    cause = 'Continuous chain reset & vehicle lap-bar sensor clear';
    reopenAdvantage = 'MODERATE';
  } else if (name.includes('tiki room') || name.includes('philharmagic') || name.includes('hall of presidents') || name.includes('carousel of progress') || name.includes('country bear') || name.includes('festival of the lion king') || name.includes('indiana jones') || name.includes('beauty and the beast') || name.includes('horror make-up') || name.includes('belle')) {
    category = 'Theater / Show Cycle';
    baseMinutes = 15;
    confidence = 85.0;
    cause = 'Auditorium load reset & animatronic sequence restart';
    reopenAdvantage = 'MODERATE';
  } else if (name.includes('railroad') || name.includes('train') || name.includes('vehicles') || name.includes('adventures')) {
    category = 'Transit Track System';
    baseMinutes = 20;
    confidence = 78.0;
    cause = 'Track switch alignment & platform clearance';
    reopenAdvantage = 'MODERATE';
  }

  // 1. Incorporate empirical disk audit logs and observed recovery times
  const pastDurations = history?.incidentsToday?.map((i) => i.durationMinutes).filter((d): d is number => typeof d === 'number' && d > 0) || [];
  let totalCycleMinutes = baseMinutes;
  let historyNote = '';
  let avgPastRecovery: number | undefined = undefined;

  const allTimeAvg = history?.allTimeAvgRecoveryMinutes;
  const allTimeCount = history?.allTimeIncidentsTotal || 0;

  if (pastDurations.length > 0 && allTimeAvg) {
    avgPastRecovery = Math.round(pastDurations.reduce((a, b) => a + b, 0) / pastDurations.length);
    // Empirical multi-layer weighting: 55% today's file logs, 35% all-time file logs, 10% archetype baseline
    totalCycleMinutes = Math.round((avgPastRecovery * 0.55) + (allTimeAvg * 0.35) + (baseMinutes * 0.10));
    confidence = Math.min(96, Math.round(confidence + 12 + Math.min(8, allTimeCount)));
    historyNote = `Trained on ${allTimeCount} audit log file incident(s) (All-time avg: ${allTimeAvg}m • Today avg: ${avgPastRecovery}m)`;
  } else if (allTimeAvg && allTimeCount > 0) {
    // 75% all-time file log average, 25% mechanical archetype baseline
    totalCycleMinutes = Math.round((allTimeAvg * 0.75) + (baseMinutes * 0.25));
    confidence = Math.min(94, Math.round(confidence + 10 + Math.min(6, allTimeCount)));
    historyNote = `Trained on ${allTimeCount} persistent disk log breakdown(s) (Historical avg: ${allTimeAvg}m)`;
  } else if (pastDurations.length > 0) {
    avgPastRecovery = Math.round(pastDurations.reduce((a, b) => a + b, 0) / pastDurations.length);
    totalCycleMinutes = Math.round((avgPastRecovery * 0.65) + (baseMinutes * 0.35));
    confidence = Math.min(92, Math.round(confidence + 8 + Math.min(8, pastDurations.length * 2)));
    historyNote = `Trained on ${pastDurations.length} recovery event(s) today (Avg: ${avgPastRecovery}m)`;
  } else {
    historyNote = `Baseline mechanical profile (Awaiting initial disk downtime audit log)`;
  }

  // 2. Factor in current elapsed downtime
  const elapsedMinutes = history?.currentDownMinutes || 1;
  let remainingMinutes = Math.max(3, totalCycleMinutes - elapsedMinutes);
  let extendedDelay = false;

  if (elapsedMinutes >= totalCycleMinutes) {
    extendedDelay = true;
    remainingMinutes = Math.max(4, Math.round(elapsedMinutes * 0.3));
    confidence = Math.max(65, confidence - 7);
  }

  const now = new Date();
  const targetDate = new Date(now.getTime() + remainingMinutes * 60 * 1000);
  const projectedTimeString = targetDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    category,
    expectedMinutes: remainingMinutes,
    elapsedMinutes,
    totalCycleMinutes,
    predictedTimeString: projectedTimeString,
    confidence,
    cause: extendedDelay ? `Extended reset underway (${cause})` : cause,
    reopenAdvantage,
    historyNote,
    totalDowntimesToday: history?.totalDowntimesToday || 1,
    pastDurations,
    avgPastRecovery,
    extendedDelay,
    allTimeCount,
    allTimeAvg,
    reliabilityScore: history?.reliabilityScore,
    logFileName: history?.logFileName,
    logFilePath: history?.logFilePath,
  };
}

export default function App() {
  const [data, setData] = useState<WaitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Sound Mode State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('disney_sound_mode') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) playMagicFanfare();
      try {
        localStorage.setItem('disney_sound_mode', String(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Watchlist State
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('disney_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (rideName: string) => {
    setFavorites((prev) => {
      const next = prev.includes(rideName)
        ? prev.filter((r) => r !== rideName)
        : [...prev, rideName];
      try {
        localStorage.setItem('disney_favorites', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Completed / Ridden Today Tracker State
  const [completedRides, setCompletedRides] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('disney_completed_rides');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleCompleted = (rideName: string) => {
    setCompletedRides((prev) => {
      const next = prev.includes(rideName)
        ? prev.filter((r) => r !== rideName)
        : [...prev, rideName];
      if (soundEnabled && !prev.includes(rideName)) playMagicFanfare();
      try {
        localStorage.setItem('disney_completed_rides', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Modals state
  const [parkOverlayOpen, setParkOverlayOpen] = useState(false);
  const [selectedPark, setSelectedPark] = useState<string>('');
  const [crowdModalOpen, setCrowdModalOpen] = useState(false);

  // Explorer filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'TEMPORARILY_CLOSED' | 'REFURBISHMENT' | 'FAVORITES' | 'COMPLETED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'COASTERS' | 'FAMILY' | 'WATER' | 'INDOOR'>('ALL');
  const [sortOption, setSortOption] = useState<'WAIT_ASC' | 'WAIT_DESC' | 'NAME'>('WAIT_ASC');

  // Smart Guide state
  const [algoOverlayOpen, setAlgoOverlayOpen] = useState(false);
  const [algoPark, setAlgoPark] = useState<string | null>(null);

  // New feature modals state
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [ropeDropModalOpen, setRopeDropModalOpen] = useState(false);
  const [selectedRopeDropPark, setSelectedRopeDropPark] = useState<string>('Magic Kingdom');
  const [hopperModalOpen, setHopperModalOpen] = useState(false);
  const [timeSavedModalOpen, setTimeSavedModalOpen] = useState(false);

  // Downtime radar & MOWD predictor state
  const [radarParkFilter, setRadarParkFilter] = useState<string>('ALL');

  // Dedicated Ride Audit Log file viewer state
  const [auditLogModalRide, setAuditLogModalRide] = useState<{ park: string; ride: string } | null>(null);
  const [auditLogData, setAuditLogData] = useState<any | null>(null);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [auditLogCopied, setAuditLogCopied] = useState(false);

  const openRideAuditLog = async (park: string, ride: string) => {
    setAuditLogModalRide({ park, ride });
    setAuditLogLoading(true);
    setAuditLogCopied(false);
    setAuditLogData(null);
    try {
      const res = await fetch(`/api/rides/log?park=${encodeURIComponent(park)}&ride=${encodeURIComponent(ride)}`);
      const json = await res.json();
      setAuditLogData(json);
    } catch (err) {
      console.error('Failed to load ride audit log:', err);
    } finally {
      setAuditLogLoading(false);
    }
  };

  // Device & Phone GUI state
  const [deviceMode, setDeviceMode] = useState<'AUTO' | 'PHONE' | 'IPAD'>(() => {
    try {
      return (localStorage.getItem('disney_device_mode') as 'AUTO' | 'PHONE' | 'IPAD') || 'AUTO';
    } catch {
      return 'AUTO';
    }
  });

  const [isMobileWidth, setIsMobileWidth] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 800;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileWidth(window.innerWidth <= 800);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPhoneView = deviceMode === 'PHONE' || (deviceMode === 'AUTO' && isMobileWidth);

  const toggleDeviceMode = () => {
    setDeviceMode((prev) => {
      const next = prev === 'PHONE' ? 'IPAD' : 'PHONE';
      try {
        localStorage.setItem('disney_device_mode', next);
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Phone GUI Active Tab
  const [phoneTab, setPhoneTab] = useState<'SPOTLIGHT' | 'PARKS' | 'RADAR' | 'TOOLS'>('SPOTLIGHT');

  const nextRide = () => {
    if (!data?.playlist || data.playlist.length === 0) return;
    setCurrentIdx((prev) => (prev + 1) % data.playlist.length);
  };

  const prevRide = () => {
    if (!data?.playlist || data.playlist.length === 0) return;
    setCurrentIdx((prev) => (prev - 1 + data.playlist.length) % data.playlist.length);
  };

  const randomRide = () => {
    if (!data?.playlist || data.playlist.length === 0) return;
    const rand = Math.floor(Math.random() * data.playlist.length);
    setCurrentIdx(rand);
  };

  const [watchedReopens, setWatchedReopens] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('disney_watched_reopens');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [reopenBanner, setReopenBanner] = useState<string | null>(null);

  const toggleWatchedReopen = (rideName: string) => {
    setWatchedReopens((prev) => {
      const next = prev.includes(rideName) ? prev.filter((r) => r !== rideName) : [...prev, rideName];
      if (soundEnabled && !prev.includes(rideName)) playMagicFanfare();
      try {
        localStorage.setItem('disney_watched_reopens', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const jumpToRide = (rideName: string, parkName: string) => {
    if (!data) return;
    const idx = data.playlist.findIndex((r) => r.name === rideName && r.park === parkName);
    if (idx !== -1) {
      setCurrentIdx(idx);
      if (soundEnabled) playMagicFanfare();
      if (isPhoneView) setPhoneTab('SPOTLIGHT');
    }
  };

  // Data fetching
  const loadData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      if (soundEnabled) playMagicFanfare();
    }
    try {
      const res = await fetch('/api/waits');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: WaitData = await res.json();

      // Check for watched ride reopens (flips from TEMPORARILY_CLOSED to OPEN)
      if (data && json.playlist) {
        for (const watched of watchedReopens) {
          const prev = data.playlist.find((r) => r.name === watched);
          const curr = json.playlist.find((r) => r.name === watched);
          if (prev && curr && prev.status === 'TEMPORARILY_CLOSED' && curr.status === 'OPEN') {
            if (soundEnabled) playMagicFanfare();
            setReopenBanner(`⚡ REOPEN ALERT: ${curr.name} (${curr.park}) just rebooted to OPEN! Current wait is ${curr.wait} min.`);
          }
        }
      }

      setData(json);
      setError(null);
    } catch (err) {
      console.error('Failed to load wait times:', err);
      setError('Unable to load wait times. Retrying...');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const refreshInterval = setInterval(() => loadData(), 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Spotlight cycling
  useEffect(() => {
    if (parkOverlayOpen || algoOverlayOpen || crowdModalOpen) return;
    if (!data || !data.playlist.length) return;

    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % data.playlist.length);
    }, 7500);

    return () => clearInterval(timer);
  }, [parkOverlayOpen, algoOverlayOpen, crowdModalOpen, data]);

  // Park modal triggers
  const openPark = (parkName: string) => {
    setSelectedPark(parkName);
    setSearchQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setSortOption('WAIT_ASC');
    setParkOverlayOpen(true);
  };

  const closePark = () => {
    setParkOverlayOpen(false);
  };

  const openAlgorithm = () => {
    setAlgoPark(null);
    setAlgoOverlayOpen(true);
    if (soundEnabled) playMagicFanfare();
  };

  const closeAlgorithm = () => {
    setAlgoOverlayOpen(false);
    setAlgoPark(null);
  };

  const currentRide = data && data.playlist.length > 0 ? data.playlist[currentIdx % data.playlist.length] : null;
  const hours = data?.hours || DEFAULT_HOURS;
  const parkInfo = data?.park_info || {};
  const top5 = data?.top_5 || [];
  const aiTips = data?.ai_tips || ["All systems nominal. Have a magical day!"];
  const lastUpdated = data?.last_updated || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Downtime radar computed lists (Strictly actual rides that are temporarily broken down, excluding closed-for-day & landmarks)
  const allDownRides = useMemo(() => {
    if (!data || !data.playlist) return [];
    return data.playlist.filter((r) => {
      if (r.status !== 'TEMPORARILY_CLOSED') return false;
      const lower = r.name.toLowerCase();
      const isLandmarkOrNonRide = /cinderella castle|discovery island trails|jurassic park discovery center|bruce's shark world|advanced training lab|conservation station|camp jurassic|if i ran the zoo|me ship, the olive|honey, i shrunk|a pirate's adventure|swiss family treehouse|tom sawyer island|tree of life|first train|last train|main street vehicles/i.test(lower);
      return !isLandmarkOrNonRide;
    });
  }, [data]);

  const filteredDownRides = useMemo(() => {
    if (radarParkFilter === 'ALL') return allDownRides;
    return allDownRides.filter((r) => r.park === radarParkFilter);
  }, [allDownRides, radarParkFilter]);

  const parkDownCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PARK_NAMES.forEach((p) => {
      counts[p] = allDownRides.filter((r) => r.park === p).length;
    });
    return counts;
  }, [allDownRides]);

  // Filtered rides for Park Explorer
  const parkRides = useMemo(() => {
    if (!data || !selectedPark) return [];
    let rides = data.playlist.filter((r) => r.park === selectedPark);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rides = rides.filter((r) => r.name.toLowerCase().includes(q));
    }

    if (statusFilter === 'OPEN') {
      rides = rides.filter((r) => r.status === 'OPEN');
    } else if (statusFilter === 'TEMPORARILY_CLOSED') {
      rides = rides.filter((r) => r.status === 'TEMPORARILY_CLOSED');
    } else if (statusFilter === 'REFURBISHMENT') {
      rides = rides.filter((r) => r.status === 'REFURBISHMENT');
    } else if (statusFilter === 'FAVORITES') {
      rides = rides.filter((r) => favorites.includes(r.name));
    } else if (statusFilter === 'COMPLETED') {
      rides = rides.filter((r) => completedRides.includes(r.name));
    }

    if (categoryFilter !== 'ALL') {
      rides = rides.filter((r) => {
        const cat = getRideCategory(r.name);
        if (categoryFilter === 'COASTERS') return cat.isCoaster;
        if (categoryFilter === 'WATER') return cat.isWater;
        if (categoryFilter === 'INDOOR') return cat.isIndoor;
        if (categoryFilter === 'FAMILY') return cat.isFamily;
        return true;
      });
    }

    return [...rides].sort((a, b) => {
      if (sortOption === 'WAIT_ASC') {
        if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
        if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
        return a.wait - b.wait;
      }
      if (sortOption === 'WAIT_DESC') {
        if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
        if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
        return b.wait - a.wait;
      }
      return a.name.localeCompare(b.name);
    });
  }, [data, selectedPark, searchQuery, statusFilter, categoryFilter, sortOption, favorites, completedRides]);

  // Overall Resort Crowd Statistics
  const resortStats = useMemo(() => {
    if (!data) return { overallAvg: 0, totalOpen: 0, totalRides: 0, parksOverview: [] };
    const openRides = data.playlist.filter((r) => r.status === 'OPEN');
    const overallAvg = openRides.length > 0 ? Math.round(openRides.reduce((s, r) => s + r.wait, 0) / openRides.length) : 0;

    const parksOverview = PARK_NAMES.map((pName) => {
      const pRides = data.playlist.filter((r) => r.park === pName);
      const pOpen = pRides.filter((r) => r.status === 'OPEN');
      const pAvg = pOpen.length > 0 ? Math.round(pOpen.reduce((s, r) => s + r.wait, 0) / pOpen.length) : 0;
      const openPct = pRides.length > 0 ? Math.round((pOpen.length / pRides.length) * 100) : 0;
      let crowdLevel = 'Low';
      if (pAvg >= 45) crowdLevel = 'Heavy';
      else if (pAvg >= 25) crowdLevel = 'Moderate';

      return {
        park: pName,
        avgWait: pAvg,
        openCount: pOpen.length,
        totalCount: pRides.length,
        openPct,
        crowdLevel,
        isOpen: parkInfo[pName]?.isOpen || false,
        isExtra: parkInfo[pName]?.isExtraEventActive || false,
      };
    });

    return { overallAvg, totalOpen: openRides.length, totalRides: data.playlist.length, parksOverview };
  }, [data, parkInfo]);

  // Advanced Algorithm Engine for Selected Park
  const algoAnalysis = useMemo(() => {
    if (!data || !algoPark) return null;

    const pInfo = parkInfo[algoPark];
    const parkEvents = pInfo?.events || [];
    const isRegularOpen = pInfo?.isOpen || false;
    const isExtraEventActive = pInfo?.isExtraEventActive || false;
    const isParkActive = isRegularOpen || isExtraEventActive;

    const allParkRides = data.playlist.filter((r) => r.park === algoPark);
    const openRides = allParkRides.filter((r) => r.status === 'OPEN');
    const tempClosedRides = allParkRides.filter((r) => r.status === 'TEMPORARILY_CLOSED');
    const refurbRides = allParkRides.filter((r) => r.status === 'REFURBISHMENT');

    const avgWait = openRides.length > 0
      ? Math.round(openRides.reduce((sum, r) => sum + r.wait, 0) / openRides.length)
      : 0;

    const parkHeadlinerNames = HEADLINERS[algoPark] || [];
    const headlinerData = parkHeadlinerNames.map((name) => {
      const matched = allParkRides.find((r) => r.name.toLowerCase().includes(name.toLowerCase()));
      return {
        name,
        ride: matched,
        status: matched ? matched.statusText : 'Not Listed',
        wait: matched ? matched.wait : 0,
        isOpen: matched?.status === 'OPEN',
      };
    });

    const eligibleRides = openRides.filter((r) => r.wait > 5);
    let optimalTarget: RideItem | null = null;
    let optimalReason = '';

    const underHypedHeadliners = eligibleRides.filter((r) =>
      parkHeadlinerNames.some((h) => r.name.toLowerCase().includes(h.toLowerCase())) && r.wait <= 40
    );

    if (underHypedHeadliners.length > 0) {
      underHypedHeadliners.sort((a, b) => a.wait - b.wait);
      optimalTarget = underHypedHeadliners[0];
      optimalReason = '🌟 PREMIER HEADLINER DEAL: Line is significantly below typical peak standby!';
    } else if (eligibleRides.length > 0) {
      eligibleRides.sort((a, b) => a.wait - b.wait);
      optimalTarget = eligibleRides[0];
      optimalReason = '⏱️ SHORTEST VERIFIED LINE: Lowest active queue in the park right now.';
    } else if (openRides.length > 0) {
      optimalTarget = openRides[0];
      optimalReason = '⚡ WALK-ON: Standby queue is currently walk-on!';
    }

    const nextBest = eligibleRides
      .filter((r) => !optimalTarget || r.name !== optimalTarget.name)
      .slice(0, 3);

    const walkOns = openRides.filter((r) => r.wait > 0 && r.wait <= 15 && (!optimalTarget || r.name !== optimalTarget.name));
    const downHeadliners = headlinerData.filter((h) => h.ride && h.ride.status === 'TEMPORARILY_CLOSED');

    return {
      isParkActive,
      isRegularOpen,
      isExtraEventActive,
      activeEventName: pInfo?.activeEventName,
      events: parkEvents,
      totalRides: allParkRides.length,
      openCount: openRides.length,
      tempClosedCount: tempClosedRides.length,
      refurbCount: refurbRides.length,
      avgWait,
      optimalTarget,
      optimalReason,
      nextBest,
      walkOns,
      headlinerData,
      downHeadliners,
      ropeDropPlan: ROPE_DROP_PLANS[algoPark] || [],
    };
  }, [data, algoPark, parkInfo]);

  const selectedParkInfo = selectedPark ? parkInfo[selectedPark] : null;

  // RENDER HELPER: SPOTLIGHT TURNSTILE CARD
  const renderSpotlight = (isPhone = false) => {
    if (loading && !data) {
      return (
        <div style={{ textAlign: 'center', fontSize: '1.3rem', color: 'var(--disney-gold)', padding: '40px 20px' }}>
          Loading Disney & Universal Wait Times...
        </div>
      );
    }

    if (error && !data) {
      return (
        <div style={{ textAlign: 'center', color: '#ff4444', padding: '40px 20px' }}>
          <p>{error}</p>
          <button className="close-btn" onClick={() => loadData(true)} style={{ marginTop: '10px' }}>
            Retry
          </button>
        </div>
      );
    }

    if (!currentRide) return null;

    return (
      <div key={`${currentRide.park}-${currentRide.name}-${currentIdx}`} className="ride-spotlight">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span
            className="clickable"
            onClick={() => openPark(currentRide.park)}
            style={{
              color: 'var(--disney-gold)',
              fontSize: '0.85rem',
              letterSpacing: '3px',
              fontWeight: 'bold',
            }}
          >
            {currentRide.park.toUpperCase()}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className={`check-btn ${completedRides.includes(currentRide.name) ? 'checked' : ''}`}
              onClick={() => toggleCompleted(currentRide.name)}
              title="Mark attraction as ridden today"
            >
              {completedRides.includes(currentRide.name) ? 'RIDDEN ✓' : '+ LOG RIDE'}
            </button>
            <button
              className="star-btn"
              title={favorites.includes(currentRide.name) ? 'Remove from Watchlist' : 'Add to Watchlist'}
              onClick={() => toggleFavorite(currentRide.name)}
            >
              {favorites.includes(currentRide.name) ? '★' : '☆'}
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: 'clamp(1.3rem, 4vw, 1.8rem)',
            fontWeight: 'bold',
            marginBottom: '14px',
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {currentRide.name}
        </div>

        {currentRide.status === 'OPEN' && (
          <>
            <div
              style={{
                fontSize: 'clamp(3.5rem, 9vw, 5rem)',
                fontWeight: 'bold',
                color: '#00ff00',
                lineHeight: 1,
              }}
            >
              {currentRide.wait}
            </div>
            <div style={{ fontSize: '1rem', color: '#00ff00', marginTop: '4px', fontWeight: 'bold' }}>
              MINUTES
            </div>
          </>
        )}

        {currentRide.status === 'REFURBISHMENT' && (
          <div
            style={{
              fontSize: 'clamp(1.4rem, 4.5vw, 2.2rem)',
              fontWeight: 'bold',
              color: '#ffaa00',
              lineHeight: 1.2,
            }}
          >
            CLOSED FOR REFURBISHMENT
          </div>
        )}

        {currentRide.status === 'CLOSED_FOR_DAY' && (
          <div
            style={{
              fontSize: 'clamp(1.5rem, 5vw, 2.3rem)',
              fontWeight: 'bold',
              color: 'var(--downtime-red)',
              lineHeight: 1.2,
            }}
          >
            CLOSED FOR THE DAY
          </div>
        )}

        {currentRide.status === 'TEMPORARILY_CLOSED' && (
          <div>
            <div
              style={{
                fontSize: 'clamp(1.5rem, 5vw, 2.3rem)',
                fontWeight: 'bold',
                color: 'var(--downtime-red)',
                lineHeight: 1.2,
              }}
            >
              TEMPORARILY CLOSED
            </div>
            {(() => {
              const hist = data?.downtime_history?.[currentRide.name];
              const pred = computeMOWDUptime(currentRide.name, hist);
              return (
                <div style={{ marginTop: '8px', background: 'rgba(0, 0, 0, 0.4)', padding: '6px 12px', borderRadius: '8px', border: '1px dashed #00ff00', display: 'inline-block' }}>
                  <div style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    Est. Reopen: ~{pred.predictedTimeString} (⏱ ~{pred.expectedMinutes}m remaining)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>
                    ⚙️ {pred.category} • {pred.confidence}% Model Confidence
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Quick Carousel Controls */}
        <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button className="filter-btn" onClick={prevRide} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            ◀ PREV
          </button>
          <button className="filter-btn" onClick={randomRide} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            🎲 RANDOM
          </button>
          <button className="filter-btn" onClick={nextRide} style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
            NEXT ▶
          </button>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button
            className="filter-btn"
            onClick={() => {
              if (isPhone) setPhoneTab('PARKS');
              openPark(currentRide.park);
            }}
            style={{ fontSize: '0.85rem', padding: '8px 16px', fontWeight: 'bold' }}
          >
            Explore All {currentRide.park} Waits
          </button>
        </div>
      </div>
    );
  };

  // RENDER HELPER: DOWNTIME & REOPEN RADAR
  const renderDowntimeRadar = () => (
    <div>
      <div
        style={{
          fontWeight: 'bold',
          color: 'var(--disney-gold)',
          marginBottom: '6px',
          borderBottom: '1px solid var(--disney-gold)',
          fontSize: '0.82rem',
          paddingBottom: '3px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: 'var(--downtime-red)' }}>🚨</span> DOWNTIME & REOPEN RADAR
        </span>
        <span
          style={{
            background: 'rgba(255, 68, 68, 0.2)',
            color: '#ff6666',
            border: '1px solid #ff4444',
            padding: '1px 6px',
            borderRadius: '10px',
            fontSize: '0.68rem',
            fontWeight: 'bold',
          }}
        >
          {filteredDownRides.length} DOWN
        </span>
      </div>

      {/* Reopen Notification Banner if any watched ride opened */}
      {reopenBanner && (
        <div
          style={{
            background: 'rgba(0, 255, 0, 0.15)',
            border: '1px solid #00ff00',
            borderRadius: '8px',
            padding: '8px 10px',
            marginBottom: '8px',
            fontSize: '0.74rem',
            color: '#00ff00',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '6px',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div style={{ lineHeight: '1.3' }}>{reopenBanner}</div>
          <button
            onClick={() => setReopenBanner(null)}
            style={{
              background: '#00ff00',
              color: '#002200',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.68rem',
              padding: '2px 6px',
              flexShrink: 0,
            }}
          >
            DISMISS
          </button>
        </div>
      )}

      {/* MOWD PREDICTIVE UPTIME ADVISORY STATEMENT */}
      <div
        style={{
          background: 'rgba(255, 204, 0, 0.1)',
          border: '1px solid var(--disney-gold)',
          borderRadius: '8px',
          padding: '8px 10px',
          marginBottom: '8px',
          fontSize: '0.72rem',
          color: '#fff4cc',
          lineHeight: '1.35',
        }}
      >
        <div
          style={{
            fontWeight: 'bold',
            color: 'var(--disney-gold)',
            marginBottom: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span>⚡ MOWD PREDICTIVE UPTIME ADVISORY</span>
        </div>
        <div>
          Reopening times are modeled on historical recovery curves, vehicle dispatch cycles, and mechanical reset telemetry. <b>These times may not be completely accurate, but it's worth a try to give you a strategic head start before the queues surge!</b>
        </div>
      </div>

      {/* Quick Park Filter Chips */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          overflowX: 'auto',
          paddingBottom: '6px',
          marginBottom: '8px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          className={`filter-btn ${radarParkFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => setRadarParkFilter('ALL')}
          style={{ fontSize: '0.68rem', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          ALL ({allDownRides.length})
        </button>
        {PARK_NAMES.map((p) => {
          const count = parkDownCounts[p] || 0;
          let label = p;
          if (p === 'Universal Studios Florida') label = 'Universal';
          else if (p === 'Islands of Adventure') label = 'Islands';
          else if (p === 'Hollywood Studios') label = 'Hollywood';
          else if (p === 'Animal Kingdom') label = 'Animal';
          else if (p === 'Magic Kingdom') label = 'Magic';
          return (
            <button
              key={p}
              className={`filter-btn ${radarParkFilter === p ? 'active' : ''}`}
              onClick={() => setRadarParkFilter(p)}
              style={{ fontSize: '0.68rem', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Down Rides List */}
      {filteredDownRides.length === 0 ? (
        <div
          style={{
            background: 'rgba(0, 255, 0, 0.08)',
            border: '1px solid #00ff00',
            borderRadius: '8px',
            padding: '14px',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: '#00ff00',
          }}
        >
          <b>🎉 100% OPERATIONAL!</b>
          <div style={{ fontSize: '0.74rem', color: '#ccffcc', marginTop: '4px' }}>
            No attractions are temporarily closed in {radarParkFilter === 'ALL' ? 'any park' : radarParkFilter}. All ride systems are running nominal standby queues.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredDownRides.map((ride) => {
            const hist = data?.downtime_history?.[ride.name];
            const pred = computeMOWDUptime(ride.name, hist);
            const isWatching = watchedReopens.includes(ride.name);

            return (
              <div
                key={ride.id}
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: isWatching ? '2px solid #00ff00' : '1px solid rgba(255, 68, 68, 0.5)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  borderLeft: isWatching ? '5px solid #00ff00' : '5px solid var(--downtime-red)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.7rem', color: '#aaa', fontWeight: 'bold' }}>
                      {ride.park.toUpperCase()}
                    </div>
                    <b style={{ fontSize: '0.85rem', color: 'white', display: 'block', marginTop: '1px' }}>
                      {ride.name}
                    </b>
                  </div>
                  <span
                    style={{
                      background: 'rgba(255, 68, 68, 0.2)',
                      color: 'var(--downtime-red)',
                      border: '1px solid var(--downtime-red)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.64rem',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    TEMPORARILY CLOSED
                  </span>
                </div>

                <div
                  style={{
                    marginTop: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px dashed rgba(255, 204, 0, 0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '0.82rem' }}>
                      Est. Reopen: ~{pred.predictedTimeString}
                    </span>
                    <span
                      style={{
                        background: 'rgba(0, 255, 0, 0.2)',
                        color: '#00ff00',
                        border: '1px solid #00ff00',
                        padding: '1px 5px',
                        borderRadius: '8px',
                        fontSize: '0.64rem',
                        fontWeight: 'bold',
                      }}
                    >
                      ⏱ ~{pred.expectedMinutes}m remaining
                    </span>
                  </div>

                  {/* Elapsed vs Typical Recovery Telemetry */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.68rem', color: '#bbb' }}>
                    <span>⏱ Down for: <b style={{ color: '#fff' }}>{pred.elapsedMinutes}m</b></span>
                    <span>Target cycle: <b style={{ color: '#fff' }}>~{pred.totalCycleMinutes}m</b></span>
                  </div>

                  {/* Historical Recovery Log from Today */}
                  {pred.pastDurations.length > 0 ? (
                    <div style={{ background: 'rgba(255, 204, 0, 0.08)', borderRadius: '4px', padding: '3px 6px', marginTop: '4px', fontSize: '0.66rem', color: 'var(--disney-gold)' }}>
                      📜 <b>Down {pred.totalDowntimesToday}x today</b> • Past recoveries: {pred.pastDurations.map((d) => `${d}m`).join(', ')} (Avg {pred.avgPastRecovery}m)
                    </div>
                  ) : (
                    <div style={{ marginTop: '3px', fontSize: '0.65rem', color: '#888' }}>
                      📜 First downtime recorded today (modeled on mechanical safety curve)
                    </div>
                  )}

                  {pred.extendedDelay && (
                    <div style={{ background: 'rgba(255, 68, 68, 0.2)', border: '1px solid #ff4444', borderRadius: '4px', padding: '3px 6px', marginTop: '4px', fontSize: '0.66rem', color: '#ff9999' }}>
                      ⚠️ Extended delay: Down longer than typical recovery ({pred.elapsedMinutes}m &gt; {pred.totalCycleMinutes}m). Crew re-cycling circuit.
                    </div>
                  )}

                  {/* Lightning Lane Surge & Golden Walk-On Window Strategy */}
                  <div style={{ background: 'rgba(0, 150, 255, 0.12)', border: '1px solid rgba(0, 180, 255, 0.4)', borderRadius: '4px', padding: '3px 6px', marginTop: '4px', fontSize: '0.66rem', color: '#99e0ff' }}>
                    ⚡ <b>Golden Walk-On Window:</b> First ~8–12 min post-reopen offer walk-on speeds before Lightning Lane backlog fills!
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '0.68rem', color: '#ccc' }}>
                    <span>⚙️ {pred.cause}</span>
                    <span style={{ color: 'var(--disney-gold)', fontWeight: 'bold' }}>
                      {pred.confidence}% Accuracy
                    </span>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '5px' }}>
                  <button
                    onClick={() => jumpToRide(ride.name, ride.park)}
                    style={{
                      flex: 1,
                      background: 'rgba(0, 30, 90, 0.8)',
                      color: 'var(--disney-gold)',
                      border: '1px solid var(--disney-gold)',
                      borderRadius: '5px',
                      padding: '3px 4px',
                      fontSize: '0.66rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    🎯 SPOTLIGHT
                  </button>
                  <button
                    onClick={() => openRideAuditLog(ride.park, ride.name)}
                    style={{
                      flex: 1.1,
                      background: 'rgba(255, 204, 0, 0.15)',
                      color: 'var(--disney-gold)',
                      border: '1px solid var(--disney-gold)',
                      borderRadius: '5px',
                      padding: '3px 4px',
                      fontSize: '0.66rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    title="View persistent downtime and recovery disk text log"
                  >
                    📄 AUDIT LOG
                  </button>
                  <button
                    onClick={() => toggleWatchedReopen(ride.name)}
                    style={{
                      flex: 1.1,
                      background: isWatching ? '#00ff00' : 'rgba(255, 255, 255, 0.08)',
                      color: isWatching ? '#002200' : '#ccc',
                      border: isWatching ? '1px solid #00ff00' : '1px solid #666',
                      borderRadius: '5px',
                      padding: '3px 4px',
                      fontSize: '0.66rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    title="Get notified with a fanfare chime when this attraction reopens"
                  >
                    {isWatching ? '🔔 WATCHING ✓' : '+ WATCH'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // RENDER HELPER: PHONE ALL PARKS OVERVIEW
  const renderParkOverviewList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <b style={{ color: 'var(--disney-gold)', fontSize: '0.92rem' }}>🏰 ALL 7 THEME PARKS & OPERATING WAITS</b>
        <span style={{ fontSize: '0.74rem', color: '#00ff00' }}>{data?.playlist?.length || 0} Total Rides</span>
      </div>

      <div
        className="algo-btn"
        onClick={openAlgorithm}
        style={{ padding: '12px', fontSize: '0.88rem', marginBottom: '4px' }}
      >
        🎯 RUN SMART GUIDE RECOMMENDATION ENGINE
      </div>

      {PARK_NAMES.map((park) => {
        const pInfo = parkInfo[park];
        const regHours = pInfo?.hours || hours[park] || DEFAULT_HOURS[park];
        const isOpen = pInfo?.isOpen || false;
        const isExtra = pInfo?.isExtraEventActive || false;
        const parkRides = data?.playlist?.filter((r) => r.park === park) || [];
        const openRides = parkRides.filter((r) => r.status === 'OPEN');
        const downRides = parkRides.filter((r) => r.status === 'TEMPORARILY_CLOSED');
        const avgWait = openRides.length > 0 ? Math.round(openRides.reduce((s, r) => s + r.wait, 0) / openRides.length) : 0;

        let crowdColor = '#00ff00';
        let crowdLevel = 'Low Wait';
        if (avgWait >= 45) {
          crowdColor = 'var(--downtime-red)';
          crowdLevel = 'Heavy Wait';
        } else if (avgWait >= 25) {
          crowdColor = 'var(--disney-gold)';
          crowdLevel = 'Moderate Wait';
        }

        return (
          <div
            key={park}
            className="clickable"
            onClick={() => openPark(park)}
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--disney-gold)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '0.98rem', color: 'white' }}>{park}</b>
              {isExtra ? (
                <span className="badge-extra" style={{ fontSize: '0.68rem' }}>EXTRA EVENT</span>
              ) : isOpen ? (
                <span className="badge-open" style={{ fontSize: '0.68rem' }}>OPEN NOW</span>
              ) : (
                <span className="badge-closed" style={{ fontSize: '0.68rem' }}>CLOSED FOR DAY</span>
              )}
            </div>

            <div style={{ fontSize: '0.74rem', color: 'var(--disney-gold)', marginTop: '3px' }}>
              🕒 {regHours}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.74rem', color: '#ccc' }}>
              <span>
                Avg: <b style={{ color: crowdColor, fontSize: '0.86rem' }}>{avgWait}m</b> ({crowdLevel}) • Operating: <b style={{ color: '#fff' }}>{openRides.length}/{parkRides.length}</b>
              </span>
              {downRides.length > 0 && (
                <span style={{ color: 'var(--downtime-red)', fontWeight: 'bold' }}>
                  🚨 {downRides.length} Down
                </span>
              )}
            </div>

            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ color: 'var(--disney-gold)', fontSize: '0.76rem', fontWeight: 'bold' }}>
                Explore All {park} Rides →
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // RENDER HELPER: PHONE TOOLS LIST
  const renderToolsList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ color: 'var(--disney-gold)', fontWeight: 'bold', fontSize: '0.92rem', marginBottom: '2px' }}>
        RESORT COMMAND TOOLS & ADVISORIES
      </div>

      <div className="phone-tool-card" onClick={openAlgorithm}>
        <div>
          <b style={{ color: 'var(--disney-gold)', fontSize: '0.92rem' }}>🎯 Smart Guide Algorithm</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>Live wait analysis, optimal ride targets, & walk-on deals</div>
        </div>
        <span style={{ color: 'var(--disney-gold)', fontSize: '1.2rem' }}>→</span>
      </div>

      <div className="phone-tool-card" onClick={() => setCrowdModalOpen(true)}>
        <div>
          <b style={{ color: '#00ff00', fontSize: '0.92rem' }}>📊 Resort Crowd Meter</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>Park-by-park crowd density levels & wait metrics</div>
        </div>
        <span style={{ color: '#00ff00', fontSize: '1.2rem' }}>→</span>
      </div>

      <div className="phone-tool-card" onClick={() => setWeatherModalOpen(true)}>
        <div>
          <b style={{ color: '#66ccff', fontSize: '0.92rem' }}>⛈️ Weather & Lightning Radar</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>10-mile lightning radius status & outdoor coaster halts</div>
        </div>
        <span style={{ color: '#66ccff', fontSize: '1.2rem' }}>→</span>
      </div>

      <div className="phone-tool-card" onClick={() => setRopeDropModalOpen(true)}>
        <div>
          <b style={{ color: '#ffaa00', fontSize: '0.92rem' }}>🏃 Morning Rope Drop Playbook</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>Headliner sprint blueprints & down-ride pivots for all 7 parks</div>
        </div>
        <span style={{ color: '#ffaa00', fontSize: '1.2rem' }}>→</span>
      </div>

      <div className="phone-tool-card" onClick={() => setHopperModalOpen(true)}>
        <div>
          <b style={{ color: '#ff99ff', fontSize: '0.92rem' }}>🦘 Park Hopper & Migration Advisor</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>Best park to hop to right now based on queue resistance</div>
        </div>
        <span style={{ color: '#ff99ff', fontSize: '1.2rem' }}>→</span>
      </div>

      <div className="phone-tool-card" onClick={() => setTimeSavedModalOpen(true)}>
        <div>
          <b style={{ color: '#00ff00', fontSize: '0.92rem' }}>⏱️ Time Saved & Trip ROI</b>
          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>
            {completedRides.length} rides logged • ~{completedRides.length * 35}m saved (${Math.round(((completedRides.length * 35) / 60) * 18)} value)
          </div>
        </div>
        <span style={{ color: '#00ff00', fontSize: '1.2rem' }}>→</span>
      </div>

      {/* Orlando Weather Widget */}
      <div style={{ background: 'rgba(0, 20, 60, 0.7)', border: '1px solid var(--disney-gold)', padding: '10px 14px', borderRadius: '10px', marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '0.82rem', color: 'var(--disney-gold)' }}>☀️ ORLANDO WEATHER</b>
          <span style={{ fontSize: '0.78rem', color: '#00ff00', fontWeight: 'bold' }}>83°F / FAIR</span>
        </div>
        <div style={{ fontSize: '0.74rem', color: '#ddd', marginTop: '4px' }}>
          ⚡ 0 lightning strikes within 10 miles. Outdoor coasters operational.
        </div>
      </div>

      {/* Gemini AI Advice Card */}
      <div style={{ background: 'rgba(155, 89, 182, 0.2)', border: '2px solid #9b59b6', padding: '12px', borderRadius: '10px', marginTop: '4px' }}>
        <b style={{ fontSize: '0.82rem', color: '#d499ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ✨ GEMINI LIVE ADVICE
        </b>
        {aiTips.map((tip, idx) => (
          <div key={idx} style={{ fontSize: '0.75rem', color: '#eee', marginTop: '4px', lineHeight: '1.35' }}>
            {tip}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', letterSpacing: '1px' }}>
              {isPhoneView ? '🏰 WDW & UNIVERSAL' : 'WDW & UNIVERSAL RESORT DASHBOARD'}
            </span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(0, 30, 90, 0.85)', color: 'var(--disney-gold)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
              {lastUpdated} ET
            </span>
          </div>

          {/* Header Controls */}
          {isPhoneView ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                className="device-toggle-btn"
                onClick={toggleDeviceMode}
                title="Switch to iPad / Desktop layout"
              >
                💻 IPAD GUI
              </button>
              <button
                onClick={toggleSound}
                style={{
                  background: soundEnabled ? 'var(--disney-gold)' : 'rgba(0, 30, 90, 0.85)',
                  color: soundEnabled ? 'var(--disney-blue)' : 'var(--disney-gold)',
                  border: '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
                title="Toggle sound fanfare"
              >
                {soundEnabled ? '🔔' : '🔕'}
              </button>
              <button
                onClick={() => loadData(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.85)',
                  color: 'var(--disney-gold)',
                  border: '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                {refreshing ? '🔄...' : '🔄'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="device-toggle-btn"
                onClick={toggleDeviceMode}
                title="Toggle to Phone GUI layout"
              >
                📱 PHONE GUI
              </button>
              <button
                onClick={() => setCrowdModalOpen(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.8)',
                  color: 'var(--disney-gold)',
                  border: '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                📊 CROWD METER
              </button>
              <button
                onClick={() => setWeatherModalOpen(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.8)',
                  color: '#66ccff',
                  border: '1px solid #66ccff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                ⛈️ WEATHER RADAR
              </button>
              <button
                onClick={() => setRopeDropModalOpen(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.8)',
                  color: '#ffaa00',
                  border: '1px solid #ffaa00',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                🏃 ROPE DROP
              </button>
              <button
                onClick={() => setHopperModalOpen(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.8)',
                  color: '#ff99ff',
                  border: '1px solid #ff99ff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                🦘 PARK HOPPER
              </button>
              <button
                onClick={() => setTimeSavedModalOpen(true)}
                style={{
                  background: completedRides.length > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 30, 90, 0.8)',
                  color: completedRides.length > 0 ? '#00ff00' : 'var(--disney-gold)',
                  border: completedRides.length > 0 ? '1px solid #00ff00' : '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                ⏱️ TIME SAVED ({completedRides.length})
              </button>
              <button
                onClick={toggleSound}
                style={{
                  background: soundEnabled ? 'var(--disney-gold)' : 'rgba(0, 30, 90, 0.8)',
                  color: soundEnabled ? 'var(--disney-blue)' : 'var(--disney-gold)',
                  border: '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
                title="Toggle melodic fanfare chime on alerts and refresh"
              >
                {soundEnabled ? '🔔 SOUND: ON' : '🔕 SOUND: OFF'}
              </button>
              <button
                onClick={() => loadData(true)}
                style={{
                  background: 'rgba(0, 30, 90, 0.8)',
                  color: 'var(--disney-gold)',
                  border: '1px solid var(--disney-gold)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                }}
              >
                {refreshing ? '🔄 REFRESHING...' : '🔄 REFRESH FEED'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Marquee ticker for top 5 waits or closed message */}
      <div className="top-waits-bar">
        <div className="marquee-content">
          {top5.length > 0 ? (
            top5.map((ride, i) => (
              <span key={i} className="marquee-item">
                {ride.name.toUpperCase()} ({ride.park}):{' '}
                <b style={{ color: 'var(--disney-gold)' }}>{ride.wait} MIN</b>
              </span>
            ))
          ) : (
            <span className="marquee-item" style={{ color: '#ffcc00' }}>
              ALL ATTRACTIONS ARE CLOSED FOR THE DAY • CHECK BACK TOMORROW FOR LIVE STANDBY WAITS
            </span>
          )}
        </div>
      </div>

      {/* ALL 7 PARKS QUICK-NAV STRIP (Visible on desktop & mobile above content) */}
      <div className="parks-nav-strip">
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', color: 'var(--disney-gold)', fontWeight: 'bold', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
          PARKS:
        </div>
        {PARK_NAMES.map((park) => {
          const pInfo = parkInfo[park];
          const regHours = pInfo?.hours || hours[park] || DEFAULT_HOURS[park];
          const isOpen = pInfo?.isOpen || false;
          const isExtra = pInfo?.isExtraEventActive || false;

          return (
            <button
              key={park}
              className="park-chip"
              onClick={() => openPark(park)}
              title={`Tap to explore all attractions and waits in ${park}`}
            >
              <div className="chip-title">
                <span>{park}</span>
                {isExtra ? (
                  <span className="badge-extra" style={{ padding: '1px 4px', fontSize: '0.62rem' }}>EXTRA</span>
                ) : isOpen ? (
                  <span className="badge-open" style={{ padding: '1px 4px', fontSize: '0.62rem' }}>OPEN</span>
                ) : (
                  <span className="badge-closed" style={{ padding: '1px 4px', fontSize: '0.62rem' }}>CLOSED</span>
                )}
              </div>
              <div className="chip-hours">{regHours}</div>
            </button>
          );
        })}
        {/* Generous right-end spacer so the 7th park (Epic Universe) is never cut off */}
        <div style={{ width: '30px', flexShrink: 0 }} />
      </div>

      {isPhoneView ? (
        <div className="phone-container">
          <div className="phone-tab-content">
            {phoneTab === 'SPOTLIGHT' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                {renderSpotlight(true)}

                {/* Below Spotlight on Phone: Quick Live Pulse & Navigation Dashboard */}
                <div style={{ width: '100%', maxWidth: '520px', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Live Resort Pulse Box */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--disney-gold)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ color: 'var(--disney-gold)', fontSize: '0.84rem' }}>🏰 RESORT LIVE PULSE</b>
                      <span style={{ color: '#00ff00', fontSize: '0.76rem', fontWeight: 'bold' }}>
                        {resortStats.totalOpen}/{resortStats.totalRides} OPERATING
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '10px', textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#00ff00' }}>{resortStats.overallAvg}m</div>
                        <div style={{ fontSize: '0.66rem', color: '#bbb' }}>AVG WAIT</div>
                      </div>
                      <div style={{ height: '28px', width: '1px', background: 'rgba(255, 255, 255, 0.2)' }} />
                      <div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: allDownRides.length > 0 ? 'var(--downtime-red)' : '#00ff00' }}>
                          {allDownRides.length}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: '#bbb' }}>DOWN RIDES</div>
                      </div>
                      <div style={{ height: '28px', width: '1px', background: 'rgba(255, 255, 255, 0.2)' }} />
                      <div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--disney-gold)' }}>
                          {completedRides.length}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: '#bbb' }}>LOGGED TODAY</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Shortcuts Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => setPhoneTab('RADAR')}
                      style={{
                        background: 'rgba(255, 68, 68, 0.15)',
                        border: '1px solid var(--downtime-red)',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '10px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span>🚨</span>
                      <span>Downtime Radar ({allDownRides.length})</span>
                    </button>
                    <button
                      onClick={() => setPhoneTab('PARKS')}
                      style={{
                        background: 'rgba(0, 30, 90, 0.8)',
                        border: '1px solid var(--disney-gold)',
                        color: 'var(--disney-gold)',
                        borderRadius: '10px',
                        padding: '10px 8px',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span>🏰</span>
                      <span>All 7 Parks Waits →</span>
                    </button>
                  </div>

                  {/* Run Smart Guide Algorithm Button */}
                  <div
                    className="algo-btn"
                    onClick={openAlgorithm}
                    style={{ padding: '12px', fontSize: '0.9rem', marginBottom: '0' }}
                  >
                    🎯 RUN SMART GUIDE ALGORITHM
                  </div>

                  {/* Weather Snapshot Bar on Phone Spotlight */}
                  <div
                    onClick={() => setWeatherModalOpen(true)}
                    style={{
                      background: 'rgba(0, 20, 60, 0.75)',
                      border: '1px solid #66ccff',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>☀️</span>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#66ccff' }}>ORLANDO RESORT WEATHER</div>
                        <div style={{ fontSize: '0.7rem', color: '#ccc' }}>0 lightning strikes in 10 mi • Rides running</div>
                      </div>
                    </div>
                    <span style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '0.85rem' }}>83°F →</span>
                  </div>
                </div>
              </div>
            )}

            {phoneTab === 'PARKS' && renderParkOverviewList()}
            {phoneTab === 'RADAR' && renderDowntimeRadar()}
            {phoneTab === 'TOOLS' && renderToolsList()}
          </div>

          {/* Bottom Nav Bar */}
          <div className="phone-bottom-nav">
            <button
              className={`phone-nav-item ${phoneTab === 'SPOTLIGHT' ? 'active' : ''}`}
              onClick={() => setPhoneTab('SPOTLIGHT')}
            >
              <span className="phone-nav-icon">🎯</span>
              <span>Spotlight</span>
            </button>

            <button
              className={`phone-nav-item ${phoneTab === 'PARKS' ? 'active' : ''}`}
              onClick={() => setPhoneTab('PARKS')}
            >
              <span className="phone-nav-icon">🏰</span>
              <span>Parks</span>
            </button>

            <button
              className={`phone-nav-item ${phoneTab === 'RADAR' ? 'active' : ''}`}
              onClick={() => setPhoneTab('RADAR')}
            >
              <span className="phone-nav-icon">🚨</span>
              <span>Radar {allDownRides.length > 0 ? `(${allDownRides.length})` : ''}</span>
            </button>

            <button
              className={`phone-nav-item ${phoneTab === 'TOOLS' ? 'active' : ''}`}
              onClick={() => setPhoneTab('TOOLS')}
            >
              <span className="phone-nav-icon">🧭</span>
              <span>Tools</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="main">
          {/* SIDEBAR: Shows All 7 Parks, Hours, Extra Events & Smart Guide */}
          <div className="sidebar">
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{lastUpdated}</span>
              <span style={{ color: 'var(--disney-gold)', fontSize: '0.8rem', letterSpacing: '1px' }}>FLORIDA (ET)</span>
            </div>

            <div className="algo-btn" onClick={openAlgorithm}>
              🎯 RUN SMART GUIDE ALGORITHM
            </div>

            {/* MOWD DOWNTIME & REOPEN RADAR (Predictive Uptime Engine) */}
            {renderDowntimeRadar()}

            {/* Florida Theme Park Weather & Rain Advisory Widget */}
            <div
              style={{
                background: 'rgba(0, 20, 60, 0.7)',
                border: '1px solid var(--disney-gold)',
                padding: '8px 10px',
                borderRadius: '8px',
                marginTop: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--disney-gold)' }}>
                  ☀️ ORLANDO WEATHER ADVISORY
                </span>
                <span style={{ fontSize: '0.74rem', color: '#00ff00', fontWeight: 'bold' }}>83°F / FAIR</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#ddd', marginTop: '2px', lineHeight: '1.25' }}>
                ⚡ Lightning risk is low. Outdoor thrill coasters and water rides are running.
              </div>
            </div>

            {/* Day Tracker Summary Banner */}
            {completedRides.length > 0 && (
              <div
                style={{
                  background: 'rgba(0, 255, 0, 0.1)',
                  border: '1px solid #00ff00',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ color: '#00ff00', fontWeight: 'bold' }}>
                  🎒 TRIP LOG: {completedRides.length} RIDES COMPLETED TODAY
                </div>
              </div>
            )}

            {/* Gemini AI Live Advice Card */}
            <div
              style={{
                background: 'rgba(155, 89, 182, 0.2)',
                border: '2px solid #9b59b6',
                padding: '10px',
                borderRadius: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  color: '#d499ff',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>✨ GEMINI LIVE ADVICE</span>
              </div>
              {aiTips.map((tip, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: '0.76rem',
                    lineHeight: '1.3',
                    marginBottom: '4px',
                  }}
                >
                  {tip}
                </div>
              ))}
            </div>

            <div style={{ height: '20px', flexShrink: 0 }} />
          </div>

          {/* CENTER CONTENT: LIVE SPOTLIGHT CAROUSEL ("THE TURNSTILE") */}
          <div className="content">
            {renderSpotlight(false)}
          </div>
        </div>
      )}

      {/* PARK EXPLORER OVERLAY */}
      {parkOverlayOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {selectedPark.toUpperCase()}
              </span>
              {selectedParkInfo && (
                <div style={{ fontSize: '0.9rem', color: '#ffcc00', marginTop: '4px' }}>
                  Regular Hours: {selectedParkInfo.hours}{' '}
                  {selectedParkInfo.isOpen ? (
                    <span className="badge-open" style={{ marginLeft: '6px' }}>OPEN</span>
                  ) : selectedParkInfo.isExtraEventActive ? (
                    <span className="badge-extra" style={{ marginLeft: '6px' }}>
                      EXTRA EVENT: {selectedParkInfo.activeEventName}
                    </span>
                  ) : (
                    <span className="badge-closed" style={{ marginLeft: '6px' }}>CLOSED FOR DAY</span>
                  )}
                </div>
              )}
            </div>
            <button className="close-btn" onClick={closePark}>
              CLOSE
            </button>
          </div>

          {/* Schedule Events Timeline */}
          {selectedParkInfo && selectedParkInfo.events.length > 0 && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--disney-gold)',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 'bold', color: 'var(--disney-gold)', fontSize: '0.9rem', marginBottom: '6px' }}>
                📅 TODAY'S COMPLETE OPERATING SCHEDULE & EXTRA EVENTS:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.85rem' }}>
                {selectedParkInfo.events.map((evt, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: evt.activeNow ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                      border: evt.activeNow ? '1px solid #00ff00' : '1px solid rgba(255, 255, 255, 0.2)',
                      padding: '6px 12px',
                      borderRadius: '6px',
                    }}
                  >
                    <b>{evt.label}</b>: {evt.hours}
                    {evt.activeNow && <span style={{ color: '#00ff00', marginLeft: '6px', fontWeight: 'bold' }}>• ACTIVE NOW</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search, Status Filter & Category Filter Chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <input
              type="text"
              className="search-input"
              placeholder="🔍 Search attractions in this park..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Ride Categories Chip Filter */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--disney-gold)', fontWeight: 'bold' }}>Filter by Type:</span>
              <button
                className={`category-chip ${categoryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('ALL')}
              >
                All Attractions
              </button>
              <button
                className={`category-chip ${categoryFilter === 'COASTERS' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('COASTERS')}
              >
                🎢 Thrill Coasters
              </button>
              <button
                className={`category-chip ${categoryFilter === 'FAMILY' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('FAMILY')}
              >
                👨‍👩‍👧 Family & Dark Rides
              </button>
              <button
                className={`category-chip ${categoryFilter === 'WATER' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('WATER')}
              >
                💦 Water Rides
              </button>
              <button
                className={`category-chip ${categoryFilter === 'INDOOR' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('INDOOR')}
              >
                🌧️ Rain-Proof / Indoor
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  All ({parkRides.length})
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'OPEN' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('OPEN')}
                >
                  Open Only
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'TEMPORARILY_CLOSED' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('TEMPORARILY_CLOSED')}
                >
                  Temporarily Closed
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'REFURBISHMENT' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('REFURBISHMENT')}
                >
                  Refurbishment
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'FAVORITES' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('FAVORITES')}
                >
                  ★ Watchlist
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('COMPLETED')}
                >
                  ✓ Ridden ({completedRides.length})
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                <span>Sort:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as any)}
                  style={{
                    background: 'rgba(0, 20, 60, 0.8)',
                    color: 'white',
                    border: '1px solid var(--disney-gold)',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="WAIT_ASC">Lowest Wait Time</option>
                  <option value="WAIT_DESC">Highest Wait Time</option>
                  <option value="NAME">Name (A-Z)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ride List */}
          <div>
            {parkRides.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#ccc', padding: '30px' }}>
                No attractions match your current filter or search query.
              </p>
            ) : (
              parkRides.map((ride, idx) => {
                let statusLabel: React.ReactNode;

                if (ride.status === 'OPEN') {
                  statusLabel = <b style={{ color: '#00ff00', fontSize: '1.1rem' }}>{ride.wait} MIN</b>;
                } else if (ride.status === 'REFURBISHMENT') {
                  statusLabel = <b style={{ color: '#ffaa00' }}>Closed for Refurbishment</b>;
                } else if (ride.status === 'CLOSED_FOR_DAY') {
                  statusLabel = <b style={{ color: 'var(--downtime-red)' }}>Closed for the Day</b>;
                } else {
                  statusLabel = <b style={{ color: 'var(--downtime-red)' }}>Temporarily Closed</b>;
                }

                const isFav = favorites.includes(ride.name);
                const isDone = completedRides.includes(ride.name);

                return (
                  <div key={idx} className="ride-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        className={`check-btn ${isDone ? 'checked' : ''}`}
                        onClick={() => toggleCompleted(ride.name)}
                        title="Mark attraction as ridden today"
                      >
                        {isDone ? '✓' : '+'}
                      </button>
                      <button
                        className="star-btn"
                        onClick={() => toggleFavorite(ride.name)}
                        title={isFav ? 'Remove from Watchlist' : 'Add to Watchlist'}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                      <span style={{ fontWeight: 500, fontSize: '1rem', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.75 : 1 }}>
                        {ride.name}
                      </span>
                    </div>
                    {statusLabel}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* RESORT CROWD METER MODAL */}
      {crowdModalOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>📊 RESORT-WIDE CROWD METER</span>
              <div style={{ fontSize: '0.85rem', color: 'var(--disney-gold)', marginTop: '2px' }}>
                Telemetry comparison across all 7 Orlando destination parks
              </div>
            </div>
            <button className="close-btn" onClick={() => setCrowdModalOpen(false)}>
              CLOSE
            </button>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>OVERALL RESORT AVG WAIT</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--disney-gold)', marginTop: '4px' }}>
                  {resortStats.overallAvg} MIN
                </div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>TOTAL OPEN ATTRACTIONS</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                  {resortStats.totalOpen} / {resortStats.totalRides}
                </div>
              </div>
            </div>

            <div style={{ fontWeight: 'bold', color: 'var(--disney-gold)', marginBottom: '10px' }}>
              PARK-BY-PARK CROWD DENSITY & ACTIVE CAPACITY:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resortStats.parksOverview.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--disney-gold)',
                    padding: '14px',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: '1.05rem' }}>{item.park}</b>
                    <span style={{ fontSize: '0.85rem', color: item.crowdLevel === 'Heavy' ? 'var(--downtime-red)' : item.crowdLevel === 'Moderate' ? 'var(--disney-gold)' : '#00ff00', fontWeight: 'bold' }}>
                      {item.crowdLevel.toUpperCase()} CROWD ({item.avgWait} MIN AVG)
                    </span>
                  </div>

                  <div className="crowd-meter-bar">
                    <div
                      className="crowd-meter-fill"
                      style={{ width: `${Math.min(100, Math.max(10, item.avgWait * 1.5))}%` }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ccc', marginTop: '4px' }}>
                    <span>Active Rides: {item.openCount} / {item.totalCount} ({item.openPct}%)</span>
                    <span>Status: {item.isExtra ? '⚡ Extra Magic Event' : item.isOpen ? '🟢 Open Regular' : '🔴 Closed'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADVANCED SMART GUIDE ALGORITHM OVERLAY */}
      {algoOverlayOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ color: 'white', fontSize: '1.3rem' }}>🎯 SMART GUIDE LIVE ENGINE</span>
              <div style={{ fontSize: '0.85rem', color: 'var(--disney-gold)', marginTop: '2px' }}>
                Algorithmic line optimization powered by live Florida park telemetry
              </div>
            </div>
            <button className="close-btn" onClick={closeAlgorithm}>
              CLOSE
            </button>
          </div>

          {!algoPark ? (
            <div>
              <h3 style={{ color: 'var(--disney-gold)', textAlign: 'center', marginBottom: '15px' }}>
                Select your park to generate your live strategy:
              </h3>
              <div style={{ display: 'grid', gap: '12px', maxWidth: '650px', margin: '0 auto' }}>
                {PARK_NAMES.map((park) => {
                  const pInfo = parkInfo[park];
                  const isOpen = pInfo?.isOpen || false;
                  const isExtra = pInfo?.isExtraEventActive || false;

                  return (
                    <button
                      key={park}
                      className="clickable"
                      onClick={() => setAlgoPark(park)}
                      style={{
                        padding: '16px 20px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '2px solid var(--disney-gold)',
                        color: 'white',
                        fontSize: '1.05rem',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        fontFamily: 'inherit',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{park.toUpperCase()}</span>
                      {isExtra ? (
                        <span className="badge-extra">EXTRA EVENT ACTIVE</span>
                      ) : isOpen ? (
                        <span className="badge-open">OPEN NOW</span>
                      ) : (
                        <span className="badge-closed">CLOSED FOR DAY</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            algoAnalysis && (
              <div style={{ maxWidth: '750px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ color: 'var(--disney-gold)', margin: 0 }}>
                    {algoPark.toUpperCase()}
                  </h3>
                  <button
                    className="filter-btn"
                    onClick={() => setAlgoPark(null)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    ← Change Park
                  </button>
                </div>

                {/* Park Live Health Diagnostics */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '10px',
                    marginBottom: '20px',
                  }}
                >
                  <div className="stat-card">
                    <div style={{ fontSize: '0.75rem', color: '#ccc' }}>OPERATING STATUS</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '4px', color: algoAnalysis.isExtraEventActive ? 'var(--disney-gold)' : algoAnalysis.isRegularOpen ? '#00ff00' : '#ff7777' }}>
                      {algoAnalysis.isExtraEventActive ? 'Extra Event' : algoAnalysis.isRegularOpen ? 'Open Regular' : 'Closed'}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div style={{ fontSize: '0.75rem', color: '#ccc' }}>AVG WAIT TIME</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--disney-gold)', marginTop: '4px' }}>
                      {algoAnalysis.avgWait} MIN
                    </div>
                  </div>
                  <div className="stat-card">
                    <div style={{ fontSize: '0.75rem', color: '#ccc' }}>OPEN RIDES</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                      {algoAnalysis.openCount} / {algoAnalysis.totalRides}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div style={{ fontSize: '0.75rem', color: '#ccc' }}>TEMP CLOSED</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: algoAnalysis.tempClosedCount > 0 ? 'var(--downtime-red)' : '#ccc', marginTop: '4px' }}>
                      {algoAnalysis.tempClosedCount}
                    </div>
                  </div>
                </div>

                {/* Closed Park Strategy */}
                {!algoAnalysis.isParkActive ? (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '2px solid #ff4444',
                      padding: '20px',
                      borderRadius: '12px',
                      marginBottom: '20px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', color: '#ff7777', fontWeight: 'bold', marginBottom: '8px' }}>
                      Park is Currently Closed for the Day
                    </div>
                    <p style={{ color: '#ddd', fontSize: '0.9rem', lineHeight: '1.5' }}>
                      This park is not operating right now. Below is your recommended <b>Rope Drop Strategy</b> to hit high-demand rides with minimum wait when gates open tomorrow morning:
                    </p>
                    <div style={{ marginTop: '14px', background: 'rgba(0, 0, 0, 0.3)', padding: '14px', borderRadius: '8px' }}>
                      {algoAnalysis.ropeDropPlan.map((step, idx) => (
                        <div key={idx} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--disney-gold)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              #{idx + 1} {step.target}
                            </span>
                            <span style={{ color: '#00ff00', fontSize: '0.74rem', background: 'rgba(0, 255, 0, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              {step.timing}
                            </span>
                          </div>
                          <div style={{ color: '#ddd', fontSize: '0.8rem', marginTop: '3px' }}>
                            {step.rationale}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Down Headliners Warning */}
                    {algoAnalysis.downHeadliners.length > 0 && (
                      <div
                        style={{
                          background: 'rgba(255, 68, 68, 0.15)',
                          border: '2px solid #ff4444',
                          padding: '14px',
                          borderRadius: '10px',
                          marginBottom: '20px',
                        }}
                      >
                        <div style={{ color: '#ff7777', fontWeight: 'bold', fontSize: '0.95rem' }}>
                          ⚠️ MAJOR HEADLINER DOWNTIME ALERT:
                        </div>
                        <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                          {algoAnalysis.downHeadliners.map((h, i) => (
                            <span key={i} style={{ marginRight: '10px' }}>
                              • <b>{h.name}</b> is currently Temporarily Closed.
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#ccc', marginTop: '6px' }}>
                          Tip: When a headliner reboots after downtime, line up immediately before the queue surges!
                        </div>
                      </div>
                    )}

                    {/* Optimal Target */}
                    {algoAnalysis.optimalTarget && (
                      <div
                        style={{
                          background: 'rgba(0, 255, 0, 0.12)',
                          border: '3px solid #00ff00',
                          padding: '24px',
                          borderRadius: '16px',
                          textAlign: 'center',
                          boxShadow: '0 0 25px rgba(0, 255, 0, 0.25)',
                          marginBottom: '20px',
                        }}
                      >
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--disney-gold)', letterSpacing: '1px' }}>
                          🎯 OPTIMAL TARGET (BEST VALUE NOW)
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: '10px 0' }}>
                          {algoAnalysis.optimalTarget.name}
                        </div>
                        <div style={{ fontSize: '4.5rem', fontWeight: 'bold', color: '#00ff00', lineHeight: 1 }}>
                          {algoAnalysis.optimalTarget.wait}
                        </div>
                        <div style={{ fontSize: '1rem', color: '#00ff00', marginTop: '4px' }}>
                          MINUTES STANDBY
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#eee', marginTop: '10px', fontStyle: 'italic' }}>
                          {algoAnalysis.optimalReason}
                        </div>
                      </div>
                    )}

                    {/* Runner-ups */}
                    {algoAnalysis.nextBest.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--disney-gold)', marginBottom: '8px' }}>
                          NEXT BEST ALTERNATIVES:
                        </div>
                        {algoAnalysis.nextBest.map((ride, idx) => (
                          <div key={idx} className="ride-row">
                            <span>{ride.name}</span>
                            <b style={{ color: '#00ff00' }}>{ride.wait} MIN</b>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Walk-on Gems */}
                    {algoAnalysis.walkOns.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontWeight: 'bold', color: '#00ff00', marginBottom: '8px' }}>
                          ⚡ WALK-ON GEMS (15 MIN OR LESS):
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                          {algoAnalysis.walkOns.slice(0, 6).map((ride, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid #00ff00',
                                padding: '10px',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span style={{ fontSize: '0.85rem' }}>{ride.name}</span>
                              <b style={{ color: '#00ff00' }}>{ride.wait} MIN</b>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Headliner Radar */}
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--disney-gold)', marginBottom: '8px' }}>
                        🎢 TOP HEADLINER RADAR:
                      </div>
                      {algoAnalysis.headlinerData.map((h, idx) => (
                        <div key={idx} className="ride-row">
                          <span>{h.name}</span>
                          {h.isOpen ? (
                            <b style={{ color: h.wait <= 40 ? '#00ff00' : '#ffcc00' }}>
                              {h.wait} MIN {h.wait <= 40 ? '• GREAT TIME' : '• HIGH'}
                            </b>
                          ) : (
                            <b style={{ color: 'var(--downtime-red)' }}>{h.status}</b>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  className="clickable"
                  onClick={() => setAlgoPark(null)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'var(--disney-blue)',
                    border: '2px solid var(--disney-gold)',
                    color: 'white',
                    fontWeight: 'bold',
                    borderRadius: '10px',
                    marginTop: '10px',
                    fontFamily: 'inherit',
                    fontSize: '1rem',
                  }}
                >
                  CHOOSE ANOTHER PARK
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* 1. FLORIDA WEATHER & LIGHTNING RADAR MODAL */}
      {weatherModalOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                ⛈️ FLORIDA THEME PARK WEATHER & LIGHTNING RADAR
              </span>
              <div style={{ fontSize: '0.85rem', color: '#ffcc00', marginTop: '4px' }}>
                Real-time outdoor attraction shutdown and lightning risk telemetry
              </div>
            </div>
            <button className="close-btn" onClick={() => setWeatherModalOpen(false)}>
              CLOSE
            </button>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>ORLANDO RESORT WEATHER</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                  83°F / FAIR
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>Humidity: 64% • Wind: 9mph E</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>10-MILE LIGHTNING STATUS</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                  ⚡ SAFE (0 STRIKES)
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>Coaster halt radius: 10 miles</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>THRILL COASTER IMPACT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--disney-gold)', marginTop: '4px' }}>
                  ALL RUNNING
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>Outdoor tracks cleared to operate</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--disney-gold)', borderRadius: '10px', padding: '16px' }}>
              <b style={{ color: 'var(--disney-gold)', fontSize: '0.95rem' }}>⚡ Florida Theme Park Lightning Standard:</b>
              <p style={{ fontSize: '0.84rem', lineHeight: '1.45', color: '#ddd', margin: '6px 0 0 0' }}>
                Under Disney and Universal strict safety operating protocols, outdoor attractions (especially elevated steel and wooden coasters) are required to pause dispatch whenever lightning is detected within <b>10 nautical miles</b>. Indoor dark rides and continuous omnimovers continue operating normally!
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', borderRadius: '10px', padding: '14px' }}>
                <b style={{ color: '#ff6666', fontSize: '0.9rem' }}>⚠️ Outdoor Attractions (Halt in Storms):</b>
                <ul style={{ fontSize: '0.8rem', color: '#eee', paddingLeft: '18px', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                  <li>TRON Lightcycle / Run (Launch & outdoor sweep)</li>
                  <li>Big Thunder Mountain & Seven Dwarfs Mine Train</li>
                  <li>Jurassic World VelociCoaster & Hulk Coaster</li>
                  <li>Hagrid's Motorbike Adventure</li>
                  <li>Slinky Dog Dash & Expedition Everest</li>
                  <li>Stardust Racers (Epic Universe)</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(0, 255, 0, 0.1)', border: '1px solid #00ff00', borderRadius: '10px', padding: '14px' }}>
                <b style={{ color: '#00ff00', fontSize: '0.9rem' }}>🛡️ 100% Stormproof / Indoor (Never Halt):</b>
                <ul style={{ fontSize: '0.8rem', color: '#eee', paddingLeft: '18px', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                  <li>Space Mountain (100% enclosed)</li>
                  <li>Star Wars: Rise of the Resistance</li>
                  <li>Pirates of the Caribbean & Haunted Mansion</li>
                  <li>Avatar Flight of Passage & Soarin'</li>
                  <li>Harry Potter & the Escape from Gringotts</li>
                  <li>TRANSFORMERS & Revenge of the Mummy</li>
                </ul>
              </div>
            </div>

            <button
              className="algo-btn"
              onClick={() => {
                setWeatherModalOpen(false);
                openPark('Magic Kingdom');
                setCategoryFilter('INDOOR');
              }}
              style={{ margin: '10px 0 0 0' }}
            >
              🛡️ OPEN PARK EXPLORER: VIEW WEATHERPROOF INDOOR RIDES
            </button>
          </div>
        </div>
      )}

      {/* 2. MORNING ROPE DROP PLAYBOOK MODAL */}
      {ropeDropModalOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                🏃 MORNING ROPE DROP ATTACK PLAYBOOK
              </span>
              <div style={{ fontSize: '0.85rem', color: '#ffcc00', marginTop: '4px' }}>
                Step-by-step headliner sprint blueprints and down-ride pivot contingencies
              </div>
            </div>
            <button className="close-btn" onClick={() => setRopeDropModalOpen(false)}>
              CLOSE
            </button>
          </div>

          <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', WebkitOverflowScrolling: 'touch' }}>
              {PARK_NAMES.map((p) => (
                <button
                  key={p}
                  className={`filter-btn ${selectedRopeDropPark === p ? 'active' : ''}`}
                  onClick={() => setSelectedRopeDropPark(p)}
                  style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '2px solid var(--disney-gold)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ color: 'var(--disney-gold)', margin: 0 }}>
                  {selectedRopeDropPark.toUpperCase()} ROPE DROP PLAN
                </h3>
                <span className="badge-open" style={{ fontSize: '0.75rem' }}>VERIFIED STRATEGY</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(ROPE_DROP_PLANS[selectedRopeDropPark] || []).map((step, idx) => (
                  <div key={idx} style={{ background: 'rgba(0, 20, 60, 0.8)', border: '1px solid rgba(255, 204, 0, 0.4)', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <b style={{ color: 'var(--disney-gold)', fontSize: '0.92rem' }}>
                        #{idx + 1}: {step.target}
                      </b>
                      <span style={{ fontSize: '0.72rem', color: '#00ff00', background: 'rgba(0, 255, 0, 0.15)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                        {step.timing}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.76rem', color: '#ffcc00', marginTop: '4px', fontWeight: 'bold' }}>
                      ⏱ Projected Queue: {step.expectedWait}
                    </div>

                    <div style={{ fontSize: '0.82rem', color: '#ddd', marginTop: '4px', lineHeight: '1.4' }}>
                      {step.rationale}
                    </div>

                    <div style={{ background: 'rgba(255, 68, 68, 0.12)', border: '1px solid rgba(255, 68, 68, 0.3)', borderRadius: '6px', padding: '6px 8px', marginTop: '8px', fontSize: '0.75rem', color: '#ffaaaa' }}>
                      ⚡ <b>Contingency if Down:</b> {step.backupIfDown}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(255, 68, 68, 0.15)', border: '1px solid #ff4444', borderRadius: '8px', padding: '10px 12px', marginTop: '14px' }}>
                <b style={{ color: '#ff6666', fontSize: '0.84rem' }}>🚨 What if the #1 Rope Drop Headliner is Down at Open?</b>
                <div style={{ fontSize: '0.78rem', color: '#eee', marginTop: '4px', lineHeight: '1.4' }}>
                  Never stay standing outside a broken queue entrance! Instantly pivot to your Tier 2 target. Use this app's <b>+ WATCH REOPEN</b> to monitor the Tier 1 ride from afar while riding your backup!
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. RESORT PARK HOPPER & MIGRATION ADVISOR MODAL */}
      {hopperModalOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                🦘 RESORT PARK HOPPER & MIGRATION ADVISOR
              </span>
              <div style={{ fontSize: '0.85rem', color: '#ffcc00', marginTop: '4px' }}>
                Live resort crowd migration analysis, park hop index, and nighttime spectacular schedules
              </div>
            </div>
            <button className="close-btn" onClick={() => setHopperModalOpen(false)}>
              CLOSE
            </button>
          </div>

          <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(() => {
              const overview = resortStats?.parksOverview || [];
              const openParks = overview.filter((p) => p.openCount > 0);
              const bestHop = openParks.length > 0
                ? [...openParks].sort((a, b) => a.avgWait - b.avgWait)[0]
                : overview[0];

              return (
                <>
                  {bestHop && (
                    <div style={{ background: 'rgba(0, 255, 0, 0.12)', border: '2px solid #00ff00', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: '#ccffcc', fontWeight: 'bold' }}>AI HOPPING RECOMMENDATION</span>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#00ff00', marginTop: '2px' }}>
                            BEST HOP RIGHT NOW: {bestHop.park.toUpperCase()} ({bestHop.avgWait} MIN AVG)
                          </div>
                        </div>
                        <span className="badge-open" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>LOWEST QUEUES</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#eee', marginTop: '6px', lineHeight: '1.4' }}>
                        Based on live sensor feeds across all 7 Florida parks, <b>{bestHop.park}</b> currently has the lowest queue resistance with {bestHop.openCount} operational attractions.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: '10px' }}>
                    {overview.map((p) => {
                      const isRecommended = bestHop && p.park === bestHop.park;
                      return (
                        <div
                          key={p.park}
                          className="clickable"
                          onClick={() => {
                            setHopperModalOpen(false);
                            openPark(p.park);
                          }}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: isRecommended ? '2px solid #00ff00' : '1px solid rgba(255, 204, 0, 0.3)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div>
                            <b style={{ fontSize: '0.95rem', color: isRecommended ? '#00ff00' : 'white' }}>{p.park}</b>
                            <div style={{ fontSize: '0.74rem', color: '#ccc', marginTop: '2px' }}>
                              Avg Wait: <b style={{ color: 'var(--disney-gold)' }}>{p.avgWait} min</b> • Operational: <b style={{ color: '#00ff00' }}>{p.openCount}/{p.totalCount} rides</b>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`crowd-badge crowd-${p.crowdLevel}`} style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                              {p.crowdLevel} QUEUES
                            </span>
                            <button className="filter-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                              HOP HERE →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 4. THEME PARK TIME SAVED & ROI CALCULATOR MODAL */}
      {timeSavedModalOpen && (
        <div className="overlay-modal">
          <div className="park-title">
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                ⏱️ THEME PARK TIME SAVED & TRIP ROI
              </span>
              <div style={{ fontSize: '0.85rem', color: '#ffcc00', marginTop: '4px' }}>
                Calculated queue minutes avoided, Genie+/Express Pass equivalent value, and conquest trophies
              </div>
            </div>
            <button className="close-btn" onClick={() => setTimeSavedModalOpen(false)}>
              CLOSE
            </button>
          </div>

          <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>RIDES LOGGED TODAY</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--disney-gold)', marginTop: '4px' }}>
                  {completedRides.length}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>Attractions experienced</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>TOTAL TIME SAVED</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                  {completedRides.length * 35} MIN
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>~{((completedRides.length * 35) / 60).toFixed(1)} hours saved in line</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: '0.75rem', color: '#ccc' }}>TICKET VALUE RECOVERED</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#00ff00', marginTop: '4px' }}>
                  ${Math.round(((completedRides.length * 35) / 60) * 18)}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>At $18/hr theme park operating ROI</div>
              </div>
            </div>

            {/* Financial Comparison: Genie+ / Express Pass Value */}
            <div style={{ background: 'rgba(0, 150, 255, 0.1)', border: '1px solid #0099ff', borderRadius: '10px', padding: '14px' }}>
              <b style={{ color: '#66ccff', fontSize: '0.9rem' }}>💵 Paid Fast-Pass Equivalent Replaced:</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '8px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#ccc' }}>DISNEY LIGHTNING LANE MULTI PASS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ffcc00', marginTop: '2px' }}>
                    ${completedRides.length > 0 ? '32.00 / guest' : '$0.00'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#aaa' }}>{completedRides.length > 0 ? 'Matched via Reopen Radar walk-ons' : 'Log a ride to unlock'}</div>
                </div>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#ccc' }}>UNIVERSAL EXPRESS UNLIMITED PASS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00ff00', marginTop: '2px' }}>
                    ${completedRides.length >= 3 ? '119.00 / guest' : '$0.00'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#aaa' }}>{completedRides.length >= 3 ? 'Equivalent express speeds achieved' : 'Log 3+ rides to unlock'}</div>
                </div>
              </div>
            </div>

            {/* Quick 1-Click Ride Logger & Demo Helper */}
            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--disney-gold)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <b style={{ color: 'var(--disney-gold)', fontSize: '0.9rem' }}>⚡ Quick-Log Headliners Directly Here:</b>
                <button
                  onClick={() => {
                    const sample = [
                      "Space Mountain",
                      "Star Wars: Rise of the Resistance",
                      "Jurassic World VelociCoaster",
                      "Avatar Flight of Passage"
                    ];
                    setCompletedRides(sample);
                    try {
                      localStorage.setItem('disney_completed_rides', JSON.stringify(sample));
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  style={{
                    background: 'rgba(0, 255, 0, 0.2)',
                    color: '#00ff00',
                    border: '1px solid #00ff00',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ✨ Fill Demo Day Log (4 Headliners)
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                {[
                  "Space Mountain",
                  "Seven Dwarfs Mine Train",
                  "Big Thunder Mountain Railroad",
                  "Pirates of the Caribbean",
                  "Haunted Mansion",
                  "Star Wars: Rise of the Resistance",
                  "The Twilight Zone Tower of Terror™",
                  "Avatar Flight of Passage",
                  "Expedition Everest - Legend of the Forbidden Mountain",
                  "Jurassic World VelociCoaster",
                  "Hagrid's Magical Creatures Motorbike Adventure™",
                  "Harry Potter and the Escape from Gringotts™",
                  "Revenge of the Mummy",
                  "Stardust Racers"
                ].map((name) => {
                  const isLogged = completedRides.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleCompleted(name)}
                      style={{
                        background: isLogged ? '#00ff00' : 'rgba(0, 30, 90, 0.8)',
                        color: isLogged ? '#002200' : 'white',
                        border: isLogged ? '1px solid #00ff00' : '1px solid rgba(255, 204, 0, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isLogged ? `✓ ${name}` : `+ ${name}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conquest Certificate */}
            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '2px solid var(--disney-gold)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ color: 'var(--disney-gold)', fontSize: '1.05rem', letterSpacing: '1px' }}>
                  🏆 DAILY CONQUEST SUMMARY
                </b>
                {completedRides.length > 0 && (
                  <button
                    className="filter-btn"
                    onClick={() => {
                      localStorage.removeItem('disney_completed_rides');
                      setCompletedRides([]);
                    }}
                    style={{ fontSize: '0.72rem', color: '#ff7777', borderColor: '#ff4444', padding: '3px 8px' }}
                  >
                    Reset Log
                  </button>
                )}
              </div>

              {completedRides.length > 0 ? (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {completedRides.map((ride, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(0, 255, 0, 0.08)',
                        border: '1px solid rgba(0, 255, 0, 0.3)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <b>✓ {ride}</b>
                        <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>
                          Typical Peak Queue: ~65m • Walk-on Strategy: ~25m
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '0.8rem' }}>
                          +40m saved
                        </span>
                        <button
                          onClick={() => toggleCompleted(ride)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ff6666',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            padding: '2px 4px',
                          }}
                          title="Remove from trip log"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: '10px', fontSize: '0.84rem', color: '#bbb' }}>
                  No attractions logged yet today! Click any of the quick-log buttons above, or tap <b>+ LOG RIDE</b> on the center turnstile card to record your time saved.
                </div>
              )}
            </div>

            {/* Milestone Achievements */}
            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 204, 0, 0.4)', borderRadius: '10px', padding: '14px' }}>
              <b style={{ color: 'var(--disney-gold)', fontSize: '0.9rem' }}>🎖️ Trip Milestones & Trophies:</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginTop: '8px' }}>
                <div style={{ background: completedRides.length >= 1 ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)', border: completedRides.length >= 1 ? '1px solid #00ff00' : '1px solid #444', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: completedRides.length >= 1 ? '#00ff00' : '#888' }}>
                    {completedRides.length >= 1 ? '🌟 First Strike (Unlocked)' : '🔒 First Strike'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>Log at least 1 attraction today</div>
                </div>

                <div style={{ background: completedRides.length >= 3 ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)', border: completedRides.length >= 3 ? '1px solid #00ff00' : '1px solid #444', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: completedRides.length >= 3 ? '#00ff00' : '#888' }}>
                    {completedRides.length >= 3 ? '⚡ Line Dodger (Unlocked)' : '🔒 Line Dodger'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>Save 100+ minutes of queue time</div>
                </div>

                <div style={{ background: completedRides.length >= 5 ? 'rgba(255, 204, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)', border: completedRides.length >= 5 ? '1px solid var(--disney-gold)' : '1px solid #444', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: completedRides.length >= 5 ? 'var(--disney-gold)' : '#888' }}>
                    {completedRides.length >= 5 ? '👑 Park Royalty (Unlocked)' : '🔒 Park Royalty'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>Conquer 5+ attractions in one day</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RIDE DOWNTIME & RECOVERY DISK AUDIT LOG MODAL */}
      {auditLogModalRide && (
        <div className="overlay-modal" style={{ zIndex: 9999 }}>
          <div className="park-title">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'white' }}>
                  📄 {auditLogModalRide.ride.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(0, 30, 90, 0.85)', color: 'var(--disney-gold)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--disney-gold)', fontWeight: 'bold' }}>
                  {auditLogModalRide.park}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '4px' }}>
                Dedicated Persistent Text Log & Machine Learning Uptime Training Data
              </div>
            </div>
            <button className="close-btn" onClick={() => setAuditLogModalRide(null)}>
              CLOSE
            </button>
          </div>

          {auditLogLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--disney-gold)', fontSize: '1.1rem' }}>
              ⚡ Reading persistent log file from disk...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* File Info Bar */}
              <div
                style={{
                  background: 'rgba(0, 20, 60, 0.75)',
                  border: '1px solid var(--disney-gold)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Active Disk File Path
                  </div>
                  <code style={{ fontSize: '0.82rem', color: '#00ff00', background: 'rgba(0, 0, 0, 0.4)', padding: '2px 6px', borderRadius: '4px' }}>
                    {auditLogData?.filePath || auditLogData?.stats?.logFilePath || 'logs/rides/'}
                  </code>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', color: '#ddd' }}>
                    Size: <b>{auditLogData?.stats?.fileSizeBytes ? `${auditLogData.stats.fileSizeBytes} B` : 'Active'}</b>
                  </span>
                  <button
                    onClick={() => {
                      if (auditLogData?.rawContent) {
                        navigator.clipboard.writeText(auditLogData.rawContent);
                        setAuditLogCopied(true);
                        setTimeout(() => setAuditLogCopied(false), 2000);
                      }
                    }}
                    style={{
                      background: auditLogCopied ? '#00ff00' : 'rgba(255, 204, 0, 0.15)',
                      color: auditLogCopied ? '#002200' : 'var(--disney-gold)',
                      border: '1px solid var(--disney-gold)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {auditLogCopied ? '✓ COPIED!' : '📋 COPY LOG FILE'}
                  </button>
                </div>
              </div>

              {/* Statistics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                }}
              >
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>SYSTEM RELIABILITY</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#00ff00', marginTop: '2px' }}>
                    {auditLogData?.stats?.reliabilityScore || 95}%
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#aaa', marginTop: '2px' }}>Operational uptime</div>
                </div>

                <div className="stat-card" style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>TOTAL BREAKDOWNS</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--disney-gold)', marginTop: '2px' }}>
                    {auditLogData?.stats?.allTimeTotalIncidents || 0}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#aaa', marginTop: '2px' }}>Logged in file history</div>
                </div>

                <div className="stat-card" style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>HISTORICAL AVG RECOVERY</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#66ccff', marginTop: '2px' }}>
                    {auditLogData?.stats?.allTimeAvgDuration ? `~${auditLogData.stats.allTimeAvgDuration}m` : '--'}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#aaa', marginTop: '2px' }}>Median: ~{auditLogData?.stats?.allTimeMedianDuration || '--'}m</div>
                </div>

                <div className="stat-card" style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ccc' }}>TODAY'S INCIDENTS</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: (auditLogData?.stats?.todayTotalIncidents || 0) > 0 ? 'var(--downtime-red)' : '#00ff00', marginTop: '2px' }}>
                    {auditLogData?.stats?.todayTotalIncidents || 0}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#aaa', marginTop: '2px' }}>
                    {auditLogData?.stats?.todayAvgDuration ? `Avg ${auditLogData.stats.todayAvgDuration}m today` : '0 downtimes today'}
                  </div>
                </div>
              </div>

              {/* Recorded Breakdown Incidents */}
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '10px', padding: '14px' }}>
                <b style={{ color: 'var(--disney-gold)', fontSize: '0.9rem' }}>
                  📜 VERIFIED BREAKDOWN & RECOVERY AUDIT EVENTS:
                </b>
                <div style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '2px', marginBottom: '10px' }}>
                  Every downtime start and recovery timestamp is permanently appended here to calculate the reopen algorithm.
                </div>

                {auditLogData?.stats?.allTimeIncidents?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {auditLogData.stats.allTimeIncidents.map((inc: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(0, 0, 0, 0.45)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderLeft: '4px solid #00ff00',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00ff00' }}>
                              ✓ RECOVERED
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>
                              📅 {inc.date}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: '2px' }}>
                            Down: <b style={{ color: '#ff7777' }}>{inc.downTimeStr || 'Recorded'}</b> ➔ Restored: <b style={{ color: '#88ff88' }}>{inc.upTimeStr || 'Recorded'}</b>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ background: 'rgba(255, 204, 0, 0.2)', color: 'var(--disney-gold)', border: '1px solid var(--disney-gold)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 'bold' }}>
                            ⏱ {inc.durationMinutes} mins down
                          </span>
                          {inc.waitAtReopen !== undefined && (
                            <div style={{ fontSize: '0.68rem', color: '#aaa', marginTop: '2px' }}>
                              Reopened wait: {inc.waitAtReopen}m
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', fontSize: '0.78rem', color: '#aaa', textAlign: 'center' }}>
                    ✨ No breakdown incidents recorded yet in this ride's file. The audit logger will write entries immediately when downtime occurs.
                  </div>
                )}
              </div>

              {/* Raw Text Log File Viewer */}
              <div style={{ background: 'rgba(0, 0, 0, 0.65)', border: '1px solid #444', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ color: '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    📁 RAW FILE CONTENT: {auditLogData?.fileName || 'log.txt'}
                  </b>
                  <span style={{ fontSize: '0.7rem', color: '#00ff00' }}>● Synchronized with Linux filesystem</span>
                </div>
                <pre
                  style={{
                    background: '#0d1117',
                    color: '#c9d1d9',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.4',
                    border: '1px solid #30363d',
                  }}
                >
                  {auditLogData?.rawContent || '# Initializing log...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
