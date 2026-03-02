from flask import Flask, render_template_string, jsonify, make_response
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import requests
import os
import random
import subprocess
import json
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)

# --- GIT VERSION TRACKER ---
def get_git_version():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode('ascii').strip()
    except:
        return "Local-Dev"

print(f"--- DASHBOARD STARTING: Version {get_git_version()} ---")

# --- DATABASE SETUP ---
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'waits.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class WaitHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ride_name = db.Column(db.String(100))
    park_name = db.Column(db.String(100))
    wait_time = db.Column(db.Integer)
    status = db.Column(db.String(20))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# --- CONFIGURATION & DYNAMIC HOURS ---
PARKS = {
    "Magic Kingdom": 6, "EPCOT": 5, "Hollywood Studios": 7, "Animal Kingdom": 8,
    "Universal Studios Florida": 65, "Islands of Adventure": 64, "Epic Universe": 334
}

park_hours = {}

def update_park_hours():
    global park_hours
    print(f"[{datetime.now()}] Updating park closing times...")
    park_hours = {
        "Magic Kingdom": "8:00 AM - 11:00 PM",
        "EPCOT": "9:00 AM - 9:30 PM",
        "Hollywood Studios": "8:30 AM - 9:00 PM",
        "Animal Kingdom": "8:00 AM - 8:00 PM",
        "Universal Studios Florida": "8:00 AM - 10:00 PM",
        "Islands of Adventure": "8:00 AM - 10:00 PM",
        "Epic Universe": "9:00 AM - 10:00 PM"
    }

update_park_hours()

# --- 24-HOUR MAINTENANCE TASK ---
def daily_maintenance():
    print(f"[{datetime.now()}] Running 24-hour Database Maintenance...")
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(hours=24)
        WaitHistory.query.filter(WaitHistory.timestamp < cutoff).delete()
        db.session.commit()
    print("Cleanup Complete.")

scheduler = BackgroundScheduler()
scheduler.add_job(func=daily_maintenance, trigger="interval", hours=24)
scheduler.add_job(func=update_park_hours, trigger="interval", hours=24)
scheduler.start()

# --- GEMINI SUGGESTION ENGINE ---
def generate_ai_advice(playlist):
    tips = []
    open_rides = [r for r in playlist if r['status'] == "OPEN"]
    
    if not open_rides:
        return ["It looks like the parks are currently closed or updating. Plan your next selection!"]

    thrill_hits = ["Mine Train", "Space Mountain", "VelociCoaster", "Hagrid", "Stardust Racers", "Monsters Unchained"]
    family_hits = ["Mickey & Minnie", "Slinky Dog", "Peter Pan", "Navi River"]
    
    for ride in open_rides:
        if any(hit in ride['name'] for hit in thrill_hits) and ride['wait'] <= 45:
            tips.append(f"🎢 THRILL ALERT: {ride['name']} is at a rare low of {ride['wait']} mins!")
        elif any(hit in ride['name'] for hit in family_hits) and ride['wait'] <= 35:
            tips.append(f"👨‍👩‍👧 FAMILY PICK: {ride['name']} is only {ride['wait']} mins right now.")

    park_averages = {}
    for p in PARKS.keys():
        p_rides = [r['wait'] for r in open_rides if r['park'] == p]
        if p_rides:
            park_averages[p] = sum(p_rides) / len(p_rides)
    
    if park_averages:
        best_park = min(park_averages, key=park_averages.get)
        tips.append(f"🚀 PARK HOPPER: {best_park} has the lowest overall waits.")

    return tips[:2]

# --- ROUTES ---

# 1 & 2. PWA Manifest & Service Worker Routes
@app.route('/manifest.json')
def manifest():
    manifest_data = {
        "name": "Resort TV Dashboard",
        "short_name": "ResortTV",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#003399",
        "theme_color": "#003399",
        "icons": [{"src": "https://cdn-icons-png.flaticon.com/512/814/814513.png", "sizes": "512x512", "type": "image/png"}]
    }
    response = make_response(jsonify(manifest_data))
    response.headers['Content-Type'] = 'application/json'
    return response

@app.route('/sw.js')
def service_worker():
    sw_code = """
    self.addEventListener('install', (e) => { console.log('[Service Worker] Install'); });
    self.addEventListener('fetch', (e) => { });
    """
    response = make_response(sw_code)
    response.headers['Content-Type'] = 'application/javascript'
    return response

@app.route('/api/history/<path:ride_name>')
def get_ride_history(ride_name):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    history = WaitHistory.query.filter(WaitHistory.ride_name == ride_name, WaitHistory.timestamp > cutoff).order_by(WaitHistory.timestamp.asc()).all()
    data = [{"time": h.timestamp.strftime("%H:%M"), "wait": h.wait_time} for h in history]
    return jsonify(data)

@app.route('/')
def index():
    playlist = []
    delayed_rides = []
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    for park_name, p_id in PARKS.items():
        try:
            r = requests.get(f"https://queue-times.com/parks/{p_id}/queue_times.json", headers=headers, timeout=10)
            data = r.json()
            
            def process_rides(raw_rides):
                for r_data in raw_rides:
                    is_open = r_data.get('is_open', False)
                    raw_wait = r_data.get('wait_time', 0)
                    status = "OPEN" if is_open else "DELAYED"
                    display_wait = (raw_wait if raw_wait > 0 else 5) if is_open else 0

                    ride_unit = {"name": r_data.get('name'), "park": park_name, "wait": display_wait, "status": status}
                    playlist.append(ride_unit)
                    
                    if status == "DELAYED":
                        delayed_rides.append(ride_unit)

                    db.session.add(WaitHistory(ride_name=ride_unit['name'], park_name=park_name, wait_time=display_wait, status=status))

            if 'lands' in data:
                for land in data['lands']: process_rides(land.get('rides', []))
            if 'rides' in data: process_rides(data['rides'])
            db.session.commit()
        except: pass

    ai_suggestions = generate_ai_advice(playlist)
    top_5 = sorted([r for r in playlist if r['status'] == "OPEN"], key=lambda x: x['wait'], reverse=True)[:5]
    random.shuffle(playlist)
    
    # Time variables for Evening Banner and Freshness
    now = datetime.now()
    is_evening = now.hour >= 19
    last_updated = now.strftime("%I:%M %p")
    
    return render_template_string(MAIN_TEMPLATE, playlist=playlist, top_5=top_5, hours=park_hours, ai_tips=ai_suggestions, is_evening=is_evening, last_updated=last_updated, delayed_rides=delayed_rides)

# --- REFRESHED MAIN TEMPLATE ---
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Resort TV Dashboard</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#003399">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root { --disney-blue: #003399; --disney-gold: #ffcc00; --gemini-purple: #9b59b6; --downtime-red: #ff4444; }
        body { background: var(--disney-blue); color: white; font-family: 'Trebuchet MS', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .header { background: var(--disney-gold); color: var(--disney-blue); padding: 12px; text-align: center; font-weight: bold; font-size: 1.6rem; border-bottom: 2px solid white; display: flex; justify-content: space-between; align-items: center; }
        .top-waits-bar { background: rgba(0,0,0,0.5); display: flex; justify-content: space-around; padding: 8px; border-bottom: 2px solid var(--disney-gold); font-size: 0.8rem; }
        .evening-banner { background: linear-gradient(90deg, #4b0082, #8a2be2, #4b0082); color: white; text-align: center; padding: 6px; font-weight: bold; font-size: 0.9rem; letter-spacing: 2px; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.8; } 50% { opacity: 1; } 100% { opacity: 0.8; } }
        .main { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 340px; background: rgba(0, 40, 120, 0.95); border-right: 4px solid var(--disney-gold); padding: 20px; display: flex; flex-direction: column; overflow-y: auto; }
        .sidebar::-webkit-scrollbar { width: 5px; } .sidebar::-webkit-scrollbar-thumb { background: var(--disney-gold); }
        .suggestion-tab { background: linear-gradient(135deg, #2c3e50, #003399); border: 2px solid var(--gemini-purple); padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        .ai-title { color: #d499ff; font-weight: bold; font-size: 0.9rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .tip-text { font-size: 0.85rem; line-height: 1.4; margin-bottom: 10px; }
        .sidebar-box { border: 2px solid var(--disney-gold); padding: 10px; border-radius: 5px; text-align: center; background: rgba(0,0,0,0.2); margin-bottom: 15px; }
        
        .downtime-box { border: 2px solid var(--downtime-red); padding: 10px; border-radius: 5px; background: rgba(255,0,0,0.1); margin-bottom: 15px; }
        .downtime-title { color: var(--downtime-red); font-weight: bold; font-size: 0.9rem; margin-bottom: 8px; text-align: center; border-bottom: 1px solid var(--downtime-red); padding-bottom: 5px; }
        .downtime-list { list-style: none; padding: 0; margin: 0; max-height: 120px; overflow-y: auto; font-size: 0.75rem; text-align: left; }
        .downtime-list li { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
        
        .content { flex: 1; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle, #0044bb 0%, #001133 100%); position: relative; }
        .ride-spotlight { width: 85%; max-width: 600px; padding: 40px; border-radius: 40px; background: rgba(255, 255, 255, 0.1); border: 5px solid var(--disney-gold); text-align: center; display: none; box-shadow: 0 0 60px rgba(0,0,0,0.6); backdrop-filter: blur(10px); }
        .active { display: block; animation: slideIn 0.8s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        .btn-fullscreen { background: transparent; border: 2px solid var(--disney-blue); color: var(--disney-blue); font-weight: bold; padding: 5px 10px; border-radius: 5px; cursor: pointer; }
        .btn-fullscreen:hover { background: var(--disney-blue); color: var(--disney-gold); }
    </style>
</head>
<body>
    <div class="header">
        <span style="visibility:hidden;">SPACE</span>
        <span>WALT DISNEY WORLD & UNIVERSAL RESORT (this is a test comment)</span>
        <button class="btn-fullscreen" onclick="toggleFullscreen()">[   ]</button>
    </div>
    
    {% if is_evening %}
    <div class="evening-banner">✨ PREPARE FOR EVENING SPECTACULAR PERFORMANCES ✨</div>
    {% endif %}

    <div class="top-waits-bar">
        {% for ride in top_5 %}<span>{{ ride.name | upper }}: <b style="color:var(--disney-gold)">{{ ride.wait }} MIN</b></span>{% endfor %}
    </div>
    <div class="main">
        <div class="sidebar">
            
            <div class="sidebar-box" style="display:flex; justify-content: space-between; align-items: center;">
                <div id="clock" style="font-size: 1.4rem; font-weight: bold;">--:--</div>
                <div style="font-size: 0.7rem; color: #aaa; text-align: right;">Updated:<br><span style="color:var(--disney-gold);">{{ last_updated }}</span></div>
            </div>

            <div class="suggestion-tab">
                <div class="ai-title">Slippy Live Guide</div>
                {% for tip in ai_tips %}<div class="tip-text">{{ tip }}</div>{% endfor %}
            </div>

            <div class="sidebar-box" style="padding: 15px;">
                <div style="font-size: 0.8rem; color: var(--disney-gold); font-weight: bold; margin-bottom: 5px;">ORLANDO WEATHER</div>
                <div style="font-size: 1.5rem;">☀️ 82°F</div>
                <div style="font-size: 0.7rem; color: #ccc;">Mostly Sunny (API Ready)</div>
            </div>

            <div class="downtime-box">
                <div class="downtime-title">🔧 MECHANIC'S LOG: DELAYED RIDES</div>
                <ul class="downtime-list">
                    {% if delayed_rides %}
                        {% for ride in delayed_rides %}
                            <li><b>{{ ride.park[:4] | upper }}</b> - {{ ride.name }}</li>
                        {% endfor %}
                    {% else %}
                        <li style="text-align:center; color:#00ff00; padding-top:10px;">All monitored systems optimal.</li>
                    {% endif %}
                </ul>
            </div>

            <div class="sidebar-box">
                <input type="text" id="searchBar" placeholder="Search Playlist..." onkeyup="searchRides()" style="width:90%; padding:8px; border-radius:5px; border:2px solid var(--disney-gold); background:#001133; color:white;">
                <ul id="resultsList" style="list-style:none; padding:0; max-height:100px; overflow-y:auto; font-size:0.8rem; text-align:left;"></ul>
                <button id="resumeBtn" onclick="resumeRotation()" style="display:none; margin-top:5px; width:100%; background:var(--disney-gold); border:none; padding:8px; font-weight:bold; cursor:pointer;">▶ Resume</button>
            </div>
            
            <div style="flex:1;">
                <div style="color:var(--disney-gold); font-weight:bold; text-align:center; font-size:0.9rem; border-bottom:1px solid #ffcc00; margin-bottom:10px;">PARK HOURS</div>
                {% for park, time in hours.items() %}
                    <div style="font-size:0.8rem; margin-bottom:8px;"><b>{{ park }}</b><br><span style="color:#00ff00;">{{ time }}</span></div>
                {% endfor %}
            </div>
        </div>
        
        <div class="content">
            {% for ride in playlist %}
            <div class="ride-spotlight" data-name="{{ ride.name.lower() }}" onclick="showHistory('{{ ride.name }}')">
                <div style="color:var(--disney-gold); letter-spacing:4px; margin-bottom:10px;">{{ ride.park | upper }}</div>
                <div style="font-size:2.8rem; font-weight:bold; margin-bottom:20px;">{{ ride.name }}</div>
                {% if ride.status == "OPEN" %}
                    <div style="opacity:0.7;">CURRENT WAIT</div>
                    
                    {% set wait_color = '#00ff00' if ride.wait < 30 else ('#ffcc00' if ride.wait <= 60 else '#ff3333') %}
                    
                    <div style="font-size:7rem; font-weight:bold; color:{{ wait_color }};">{{ ride.wait }}</div>
                    <div style="font-size:1.6rem; color:{{ wait_color }};">MINUTES</div>
                {% else %}
                    <div style="font-size:4.5rem; color:var(--downtime-red); font-weight:bold;">DELAYED</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
    </div>
    
    <div id="overlay" onclick="closeModal()" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:50;"></div>
    <div id="modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#001133; padding:25px; border:4px solid var(--disney-gold); border-radius:20px; z-index:100; width:80%; max-width:700px;">
        <h2 id="modalTitle" style="color:var(--disney-gold); margin-top:0;"></h2>
        <canvas id="chart"></canvas>
    </div>
    
    <script>
        // Auto Refresh every 5 minutes (300,000 milliseconds)
        setTimeout(() => { window.location.reload(); }, 300000);

        // Service Worker Registration for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); });
        }

        // Fullscreen Toggle
        function toggleFullscreen() {
            if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(err => { console.log("Error attempting to enable fullscreen:", err); }); } 
            else { if (document.exitFullscreen) { document.exitFullscreen(); } }
        }

        function updateClock() { const now = new Date(); document.getElementById('clock').innerText = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
        setInterval(updateClock, 1000); updateClock();
        
        let currentIndex = 0; let isPaused = false; const spotlightCards = document.querySelectorAll('.ride-spotlight');
        function cycleSpotlight() { if (isPaused || spotlightCards.length === 0) return; spotlightCards[currentIndex].classList.remove('active'); currentIndex = (currentIndex + 1) % spotlightCards.length; spotlightCards[currentIndex].classList.add('active'); }
        if (spotlightCards.length > 0) { spotlightCards[0].classList.add('active'); setInterval(cycleSpotlight, 7000); }
        
        function searchRides() {
            const input = document.getElementById('searchBar').value.toLowerCase(); const list = document.getElementById('resultsList');
            list.innerHTML = ''; if (!input) return;
            spotlightCards.forEach((card, index) => { if (card.getAttribute('data-name').includes(input)) {
                const li = document.createElement('li'); li.innerText = card.querySelector('div:nth-child(2)').innerText;
                li.onclick = () => { isPaused = true; spotlightCards.forEach(c => c.classList.remove('active')); currentIndex = index; spotlightCards[currentIndex].classList.add('active'); document.getElementById('resumeBtn').style.display = 'block'; list.innerHTML = ''; document.getElementById('searchBar').value = ''; };
                list.appendChild(li);
            }});
        }
        function resumeRotation() { isPaused = false; document.getElementById('resumeBtn').style.display = 'none'; }
        
        let myChart;
        async function showHistory(rideName) {
            isPaused = true; document.getElementById('overlay').style.display = 'block'; document.getElementById('modal').style.display = 'block';
            document.getElementById('modalTitle').innerText = rideName;
            const res = await fetch(`/api/history/${encodeURIComponent(rideName)}`);
            const data = await res.json();
            const ctx = document.getElementById('chart').getContext('2d');
            if (myChart) myChart.destroy();
            myChart = new Chart(ctx, { type: 'line', data: { labels: data.map(d => d.time), datasets: [{ label: 'Mins', data: data.map(d => d.wait), borderColor: '#ffcc00', fill: true, tension: 0.4 }] } });
        }
        function closeModal() { document.getElementById('overlay').style.display = 'none'; document.getElementById('modal').style.display = 'none'; isPaused = false; }
    </script>
</body>
</html>
"""

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    try:
        app.run(host='0.0.0.0', port=5001, debug=False)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()