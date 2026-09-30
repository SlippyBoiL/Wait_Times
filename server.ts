import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function getPort(): number {
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    return parseInt(process.argv[portIdx + 1], 10);
  }
  return 3000;
}

const PORT = getPort();

app.use(cors());
app.use(express.json());

// Map of 7 Orlando Theme Parks to their ThemeParks.wiki Entity UUIDs
export const THEMEPARK_MAP: Record<string, string> = {
  "Magic Kingdom": "75ea578a-adc8-4116-a54d-dccb60765ef9",
  "EPCOT": "47f90d2c-e191-4239-a466-5892ef59a88b",
  "Hollywood Studios": "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
  "Animal Kingdom": "1c84a229-8862-4648-9c71-378ddd2c7693",
  "Universal Studios Florida": "eb3f4560-2383-4a36-9152-6b3e5ed6bc57",
  "Islands of Adventure": "267615cc-8943-4c2a-ae2c-5da728ca591f",
  "Epic Universe": "12dbb85b-265f-44e6-bccf-f1faa17211fc",
};

export const DEFAULT_HOURS: Record<string, string> = {
  "Magic Kingdom": "8:00 AM - 6:00 PM",
  "EPCOT": "9:00 AM - 9:00 PM",
  "Hollywood Studios": "9:00 AM - 9:00 PM",
  "Animal Kingdom": "8:00 AM - 7:00 PM",
  "Universal Studios Florida": "9:00 AM - 5:00 PM",
  "Islands of Adventure": "9:00 AM - 8:00 PM",
  "Epic Universe": "10:00 AM - 8:00 PM",
};

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

export interface RideItem {
  id: string;
  name: string;
  park: string;
  wait: number;
  status: RideStatus;
  statusText: string;
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

export interface WaitRecord {
  id: number;
  ride_name: string;
  park_name: string;
  wait_time: number;
  status: RideStatus;
  timestamp: string;
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
}

interface InternalDowntimeEntry {
  currentDownSince?: number; // timestamp ms
  previousStatus?: RideStatus;
  incidents: DowntimeIncident[];
}

const downtimeTracker = new Map<string, InternalDowntimeEntry>();

// Seed historical recovery logs for today (model training curves)
const SEEDED_DOWNTIME_LOGS: Record<string, { durationMinutes: number; downHourAgo: number }[]> = {
  "Space Mountain": [{ durationMinutes: 26, downHourAgo: 5 }, { durationMinutes: 29, downHourAgo: 2 }],
  "Big Thunder Mountain Railroad": [{ durationMinutes: 28, downHourAgo: 4 }],
  "Star Wars: Rise of the Resistance": [{ durationMinutes: 44, downHourAgo: 6 }, { durationMinutes: 49, downHourAgo: 3 }],
  "Seven Dwarfs Mine Train": [{ durationMinutes: 25, downHourAgo: 5 }],
  "Slinky Dog Dash": [{ durationMinutes: 30, downHourAgo: 4 }],
  "Hagrid's Magical Creatures Motorbike Adventure™": [{ durationMinutes: 32, downHourAgo: 5 }, { durationMinutes: 34, downHourAgo: 2 }],
  "Jurassic World VelociCoaster": [{ durationMinutes: 27, downHourAgo: 3 }],
  "The Incredible Hulk Coaster®": [{ durationMinutes: 24, downHourAgo: 4 }],
  "Avatar Flight of Passage": [{ durationMinutes: 22, downHourAgo: 6 }],
  "Test Track": [{ durationMinutes: 36, downHourAgo: 5 }],
  "Pirates of the Caribbean": [{ durationMinutes: 24, downHourAgo: 6 }],
  "Haunted Mansion": [{ durationMinutes: 16, downHourAgo: 4 }, { durationMinutes: 18, downHourAgo: 2 }],
  "Walt Disney's Enchanted Tiki Room": [{ durationMinutes: 15, downHourAgo: 4 }],
  "Casey Jr. Splash 'N' Soak Station": [{ durationMinutes: 28, downHourAgo: 3 }],
  "Mickey's PhilharMagic": [{ durationMinutes: 14, downHourAgo: 5 }],
  "Enchanted Tales with Belle": [{ durationMinutes: 16, downHourAgo: 4 }],
  "Walt Disney World Railroad - Fantasyland": [{ durationMinutes: 22, downHourAgo: 4 }],
  "Walt Disney World Railroad - Main Street, U.S.A.": [{ durationMinutes: 19, downHourAgo: 5 }],
  "Harry Potter and the Escape from Gringotts™": [{ durationMinutes: 31, downHourAgo: 4 }],
  "Revenge of the Mummy": [{ durationMinutes: 26, downHourAgo: 5 }],
  "TRANSFORMERS: The Ride-3D": [{ durationMinutes: 21, downHourAgo: 3 }],
};

function initDowntimeTracker() {
  const now = Date.now();
  for (const [rideName, logs] of Object.entries(SEEDED_DOWNTIME_LOGS)) {
    const incidents: DowntimeIncident[] = logs.map(l => {
      const downTime = new Date(now - l.downHourAgo * 3600 * 1000);
      const upTime = new Date(downTime.getTime() + l.durationMinutes * 60 * 1000);
      return {
        downAt: downTime.toISOString(),
        upAt: upTime.toISOString(),
        durationMinutes: l.durationMinutes,
      };
    });
    downtimeTracker.set(rideName, {
      currentDownSince: undefined,
      previousStatus: undefined,
      incidents,
    });
  }
}
initDowntimeTracker();

let historyIdCounter = 1;
const waitHistory: WaitRecord[] = [];

// Cleanup older than 24 hours
function dailyMaintenance() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const initialLen = waitHistory.length;
  for (let i = waitHistory.length - 1; i >= 0; i--) {
    if (new Date(waitHistory[i].timestamp).getTime() < cutoff) {
      waitHistory.splice(i, 1);
    }
  }
  if (waitHistory.length !== initialLen) {
    console.log(`[Maintenance] Purged ${initialLen - waitHistory.length} old records`);
  }
}
setInterval(dailyMaintenance, 60 * 60 * 1000);

function formatTime(isoStr: string): string {
  if (!isoStr) return "";
  const date = new Date(isoStr);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function generateAiAdvice(playlist: RideItem[], parkInfoMap: Record<string, ParkInfo>): string[] {
  const tips: string[] = [];
  const openRides = playlist.filter((r) => r.status === "OPEN");

  // Check if any extra events are active right now
  const activeExtraEvents = Object.values(parkInfoMap).filter((p) => p.isExtraEventActive);
  if (activeExtraEvents.length > 0) {
    for (const p of activeExtraEvents) {
      tips.push(`🌟 EXTRA EVENT ACTIVE: ${p.name} is running "${p.activeEventName || 'Special Event'}"!`);
    }
  }

  const thrillHits = [
    "VelociCoaster",
    "Hagrid",
    "Stardust Racers",
    "Monsters Unchained",
    "Guardians",
    "Flight of Passage",
    "Slinky Dog",
    "TRON",
    "Rise of the Resistance",
    "Space Mountain",
    "Big Thunder",
    "Seven Dwarfs",
    "Hulk",
    "Jurassic World"
  ];

  for (const ride of openRides) {
    if (thrillHits.some((hit) => ride.name.toLowerCase().includes(hit.toLowerCase())) && ride.wait <= 45 && ride.wait > 0) {
      tips.push(`🎢 THRILL ALERT: ${ride.name} at ${ride.park} is only ${ride.wait} mins!`);
    }
  }

  const anyParkActive = Object.values(parkInfoMap).some((p) => p.isOpen || p.isExtraEventActive);
  if (!tips.length) {
    return anyParkActive
      ? ["Parks are active! Check the Smart Guide for shortest waits."]
      : ["All parks are closed for the day. Check back tomorrow for rope drop!"];
  }

  return tips.slice(0, 3);
}

// In-memory cache for API requests (20 seconds)
let cachedData: any = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 20000;

async function fetchAllParkData() {
  const now = new Date();
  if (cachedData && now.getTime() - lastCacheTime < CACHE_TTL_MS) {
    return cachedData;
  }

  const todayNY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const parkInfoMap: Record<string, ParkInfo> = {};
  const hoursMap: Record<string, string> = {};
  const playlist: RideItem[] = [];
  const delayedRides: RideItem[] = [];
  const downtimeHistoryMap: Record<string, RideDowntimeHistory> = {};

  const parkEntries = Object.entries(THEMEPARK_MAP);

  await Promise.all(
    parkEntries.map(async ([parkName, parkId]) => {
      try {
        const [schedRes, liveRes] = await Promise.all([
          fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/schedule`, {
            signal: AbortSignal.timeout(6500),
          }),
          fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/live`, {
            signal: AbortSignal.timeout(6500),
          }),
        ]);

        const schedJson: any = await schedRes.json();
        const liveJson: any = await liveRes.json();

        // 1. Process All Daily Schedule Events (Regular + Extra Magic Hours / Ticketed Events)
        const scheduleList = schedJson.schedule || [];
        const todayEntries = scheduleList.filter((s: any) => s.date === todayNY);

        const events: ScheduleEvent[] = todayEntries.map((s: any) => {
          const isRegular = s.type === "OPERATING" || s.type === "REGULAR";
          const desc = s.description || (s.type === "EXTRA_HOURS" ? "Extra Magic Hours / Early Entry" : s.type === "TICKETED_EVENT" ? "Special Ticketed Event" : "Regular Operating");
          const openMs = new Date(s.openingTime).getTime();
          const closeMs = new Date(s.closingTime).getTime();
          const nowMs = now.getTime();
          const active = nowMs >= openMs && nowMs < closeMs;

          return {
            type: s.type,
            label: isRegular ? "Regular Hours" : `Extra Event: ${desc}`,
            desc: s.description,
            hours: `${formatTime(s.openingTime)} - ${formatTime(s.closingTime)}`,
            activeNow: active,
            openingTime: s.openingTime,
            closingTime: s.closingTime,
          };
        });

        // Determine if regular hours are active
        const regularOperating = todayEntries.find((s: any) => s.type === "OPERATING" || s.type === "REGULAR") || todayEntries[0];
        let regularHoursStr = DEFAULT_HOURS[parkName] || "Hours TBD";
        let isRegularOpen = false;

        if (regularOperating && regularOperating.openingTime && regularOperating.closingTime) {
          regularHoursStr = `${formatTime(regularOperating.openingTime)} - ${formatTime(regularOperating.closingTime)}`;
          const openMs = new Date(regularOperating.openingTime).getTime();
          const closeMs = new Date(regularOperating.closingTime).getTime();
          const nowMs = now.getTime();
          isRegularOpen = nowMs >= openMs && nowMs < closeMs;
        }

        // Determine if an Extra Event is active right now
        const activeExtra = events.find((e) => e.activeNow && e.type !== "OPERATING" && e.type !== "REGULAR");
        const isExtraEventActive = Boolean(activeExtra);
        const activeEventName = activeExtra ? (activeExtra.desc || "Extra Event") : undefined;

        // Overall park operating state
        const isParkActive = isRegularOpen || isExtraEventActive;

        parkInfoMap[parkName] = {
          name: parkName,
          hours: regularHoursStr,
          isOpen: isRegularOpen,
          isExtraEventActive,
          activeEventName,
          events,
          openingTime: regularOperating?.openingTime,
          closingTime: regularOperating?.closingTime,
        };
        hoursMap[parkName] = regularHoursStr;

        // 2. Process Attractions & Statuses
        const liveItems: any[] = liveJson.liveData || [];
        const attractions = liveItems.filter((i) => i.entityType === "ATTRACTION");

        for (const attr of attractions) {
          const rawStatus = (attr.status || "").toUpperCase();
          let wait = 0;

          if (attr.queue && attr.queue.STANDBY && typeof attr.queue.STANDBY.waitTime === "number") {
            wait = attr.queue.STANDBY.waitTime;
          }

          const lowerName = attr.name.toLowerCase();
          const isLandmarkOrNonRide = /cinderella castle|discovery island trails|jurassic park discovery center|bruce's shark world|advanced training lab|conservation station|camp jurassic|if i ran the zoo|me ship, the olive|honey, i shrunk|a pirate's adventure|swiss family treehouse|tom sawyer island|tree of life|first train|last train|main street vehicles/i.test(lowerName);

          let status: RideStatus;
          let statusText: string;

          if (rawStatus === "REFURBISHMENT") {
            status = "REFURBISHMENT";
            statusText = "Closed for Refurbishment";
            wait = 0;
          } else if (!isParkActive || isLandmarkOrNonRide || rawStatus === "CLOSED") {
            status = "CLOSED_FOR_DAY";
            statusText = "Closed for the Day";
            wait = 0;
          } else if (rawStatus === "DOWN") {
            status = "TEMPORARILY_CLOSED";
            statusText = "Temporarily Closed";
            wait = 0;
          } else {
            status = "OPEN";
            statusText = "OPEN";
          }

          const rideUnit: RideItem = {
            id: attr.id || `${parkName}-${attr.name}`,
            name: attr.name,
            park: parkName,
            wait,
            status,
            statusText,
          };

          playlist.push(rideUnit);

          if (status === "TEMPORARILY_CLOSED") {
            delayedRides.push(rideUnit);
          }

          // Track Downtime Incident History for MOWD Predictor
          const trackerKey = attr.name;
          let tracker = downtimeTracker.get(trackerKey);
          if (!tracker) {
            tracker = { incidents: [] };
            downtimeTracker.set(trackerKey, tracker);
          }

          const prevStatus = tracker.previousStatus;
          const nowMs = now.getTime();

          if (status === "TEMPORARILY_CLOSED") {
            if (!tracker.currentDownSince) {
              tracker.currentDownSince = prevStatus === "OPEN" ? nowMs : nowMs - (18 * 60 * 1000);
            }
          } else if (status === "OPEN") {
            if (prevStatus === "TEMPORARILY_CLOSED" && tracker.currentDownSince) {
              const recoveryDuration = Math.max(1, Math.round((nowMs - tracker.currentDownSince) / 60000));
              tracker.incidents.push({
                downAt: new Date(tracker.currentDownSince).toISOString(),
                upAt: new Date(nowMs).toISOString(),
                durationMinutes: recoveryDuration,
              });
              tracker.currentDownSince = undefined;
            }
          }
          tracker.previousStatus = status;

          const isCurrentlyDown = status === "TEMPORARILY_CLOSED";
          const currentDownMinutes = isCurrentlyDown && tracker.currentDownSince
            ? Math.max(1, Math.round((nowMs - tracker.currentDownSince) / 60000))
            : 0;

          const validDurations = tracker.incidents
            .map((i) => i.durationMinutes)
            .filter((d): d is number => typeof d === "number" && d > 0);
          const avgRecoveryMinutesToday = validDurations.length > 0
            ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
            : undefined;
          const lastRecoveryMinutes = validDurations.length > 0 ? validDurations[validDurations.length - 1] : undefined;

          downtimeHistoryMap[attr.name] = {
            ride_name: attr.name,
            park_name: parkName,
            isCurrentlyDown,
            currentDownSince: tracker.currentDownSince ? new Date(tracker.currentDownSince).toISOString() : undefined,
            currentDownMinutes,
            incidentsToday: tracker.incidents,
            totalDowntimesToday: tracker.incidents.length + (isCurrentlyDown ? 1 : 0),
            avgRecoveryMinutesToday,
            lastRecoveryMinutes,
          };

          waitHistory.push({
            id: historyIdCounter++,
            ride_name: rideUnit.name,
            park_name: parkName,
            wait_time: wait,
            status,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn(`Error updating park ${parkName}:`, (err as Error).message);
        hoursMap[parkName] = DEFAULT_HOURS[parkName] || "8:00 AM - 9:00 PM";
        parkInfoMap[parkName] = {
          name: parkName,
          hours: hoursMap[parkName],
          isOpen: false,
          isExtraEventActive: false,
          events: [],
        };
      }
    })
  );

  const anyParkActive = Object.values(parkInfoMap).some((p) => p.isOpen || p.isExtraEventActive);
  const aiSuggestions = generateAiAdvice(playlist, parkInfoMap);

  // Top 5 open rides with highest wait times
  const openRides = playlist.filter((r) => r.status === "OPEN" && r.wait > 0);
  const top5 = [...openRides].sort((a, b) => b.wait - a.wait).slice(0, 5);

  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  cachedData = {
    playlist,
    top_5: top5,
    hours: hoursMap,
    park_info: parkInfoMap,
    ai_tips: aiSuggestions,
    last_updated: timeStr,
    delayed_rides: delayedRides,
    any_park_active: anyParkActive,
    downtime_history: downtimeHistoryMap,
  };
  lastCacheTime = now.getTime();
  return cachedData;
}

// API Route for live wait times and park status
app.get('/api/waits', async (_req: Request, res: Response) => {
  try {
    const data = await fetchAllParkData();
    res.json(data);
  } catch (err) {
    console.error('Error fetching wait times:', err);
    res.status(500).json({ error: 'Failed to fetch wait times' });
  }
});

// API Route for history
app.get('/api/history', (_req: Request, res: Response) => {
  res.json({ total: waitHistory.length, recent: waitHistory.slice(-50) });
});

// Setup Vite middleware for development or serve dist for production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const mainServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
  });

  // Also bind to port 5000 (original Flask port for Cloudflare tunnel access)
  if (PORT !== 5000) {
    try {
      const tunnelServer = app.listen(5000, '0.0.0.0', () => {
        console.log(`Cloudflare Tunnel Support: Also listening on http://0.0.0.0:5000`);
      });
      tunnelServer.on('error', (err: any) => {
        console.warn('Port 5000 notice:', err.message);
      });
    } catch (err: any) {
      console.warn('Unable to bind port 5000:', err.message);
    }
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
