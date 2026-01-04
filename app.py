from flask import Flask, render_template_string, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import requests
import os
import random

app = Flask(__name__)

# --- PI-SPECIFIC PATH FIX ---
# This ensures the database is created in the same folder as this script
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'waits.db')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Database Model
class WaitHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ride_name = db.Column(db.String(100))
    park_name = db.Column(db.String(100))
    wait_time = db.Column(db.Integer)
    status = db.Column(db.String(20))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# Ensure tables are created on start
with app.app_context():
    db.create_all()

# --- CONFIGURATION (2026 Ready) ---
PARKS = {
    "Magic Kingdom": 6, "EPCOT": 5, "Hollywood Studios": 7, "Animal Kingdom": 8,
    "Universal Studios Florida": 65, "Islands of Adventure": 64,
    "Epic Universe": 334
}

# Permanently closed rides filter
BLACKLIST = [
    "Hollywood Rip Ride Rockit", "Dinosaur", "Poseidon's Fury", 
    "Shrek 4-D", "Fear Factor Live", "Star Wars Launch Bay",
    "Primeval Whirl", "Great Movie Ride", "Splash Mountain"
]

park_hours = {
    "Magic Kingdom": "8:00 AM - 11:00 PM",
    "EPCOT": "9:00 AM - 9:30 PM",
    "Hollywood Studios": "8:30 AM - 9:00 PM",
    "Animal Kingdom": "8:00 AM - 8:00 PM",
    "Universal Studios Florida": "8:00 AM - 10:00 PM",
    "Islands of Adventure": "8:00 AM - 10:00 PM",
    "Epic Universe": "9:00 AM - 10:00 PM"
}

# --- GEMINI SUGGESTION ENGINE ---
def generate_ai_advice(playlist):
    tips = []
    open_rides = [r for r in playlist if r['status'] == "OPEN"]
    if not open_rides: return ["Enjoy the resort atmosphere! Parks are currently quiet."]

    epic_gems = [r for r in open_rides if r['park'] == "Epic Universe" and r['wait'] <= 45]
    if epic_gems:
        gem = random.choice(epic_gems)
        tips.append(f"✨ EPIC TIP: {gem['name']} is only {gem['wait']} mins. Rare for this new park!")

    big_disney = ["Mine Train", "Slinky Dog", "Rise of the Resistance"]
    for r in open_rides:
        if r['name'] in big_disney and r['wait'] <= 50:
            tips.append(f"🚀 VALUE ALERT: {r['name']} wait has dropped to {r['wait']} mins!")
    
    if not tips:
        tips.append("Welcome back! Keep an eye on the spotlight for trending wait times.")

    return tips[:2]

# --- ROUTES ---

@app.route('/api/history/<path:ride_name>')
def get_ride_history(ride_name):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    history = WaitHistory.query.filter(WaitHistory.ride_name == ride_name, WaitHistory.timestamp > cutoff).order_by(WaitHistory.timestamp.asc()).all()
    data = [{"time": h.timestamp.strftime("%H:%M"), "wait": h.wait_time} for h in history]
    return jsonify(data)

@app.route('/')
def index():
    playlist = []
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    for park_name, p_id in PARKS.items():
        try:
            r = requests.get(f"https://queue-times.com/parks/{p_id}/queue_times.json", headers=headers, timeout=10)
            data = r.json()
            
            def process_rides(raw_rides):
                for r_data in raw_rides:
                    name = r_data.get('name')
                    if name in BLACKLIST: continue

                    is_open = r_data.get('is_open', False)
                    raw_wait = r_data.get('wait_time', 0)
                    status = "OPEN" if is_open else "DELAYED"
                    display_wait = (raw_wait if raw_wait > 0 else 5) if is_open else 0

                    ride_unit = {"name": name, "park": park_name, "wait": display_wait, "status": status}
                    playlist.append(ride_unit)
                    db.session.add(WaitHistory(ride_name=name, park_name=park_name, wait_time=display_wait, status=status))

            if 'lands' in data:
                for land in data['lands']: process_rides(land.get('rides', []))
            if 'rides' in data: process_rides(data['rides'])
            db.session.commit()
        except: pass

    ai_tips = generate_ai_advice(playlist)
    top_5 = sorted([r for r in playlist if r['status'] == "OPEN"], key=lambda x: x['wait'], reverse=True)[:5]
    random.shuffle(playlist)
    
    return render_template_string(MAIN_TEMPLATE, playlist=playlist, top_5=top_5, hours=park_hours, ai_tips=ai_tips)

@app.route('/history')
def history_log():
    cutoff = datetime.utcnow() - timedelta(hours=12)
    logs = WaitHistory.query.filter(WaitHistory.timestamp > cutoff).order_by(WaitHistory.timestamp.desc()).limit(200).all()
    
    history_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Resort TV - History Log</title>
        <style>
            body { background: #003399; color: white; font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; background: rgba(0,0,0,0.3); }
            th, td { padding: 10px; border: 1px solid #ffcc00; text-align: left; }
            th { color: #ffcc00; }
            .btn { background: #ffcc00; color: #003399; padding: 10px; text-decoration: none; font-weight: bold; border-radius: 5px; }
        </style>
    </head>
    <body>
        <a href="/" class="btn">← BACK TO LIVE</a>
        <h1>Wait Time History</h1>
        <table>
            <tr><th>Time</th><th>Park</th><th>Attraction</th><th>Wait</th><th>Status</th></tr>
            {% for log in logs %}
            <tr>
                <td>{{ log.timestamp.strftime('%H:%M') }}</td>
                <td>{{ log.park_name }}</td>
                <td>{{ log.ride_name }}</td>
                <td>{{ log.wait_time }}m</td>
                <td style="color: {{ '#00ff00' if log.status == 'OPEN' else '#ff3333' }}">{{ log.status }}</td>
            </tr>
            {% endfor %}
        </table>
    </body>
    </html>
    """
    return render_template_string(history_html, logs=logs)

# --- TEMPLATE ---
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Resort TV 2026 - Epic Edition</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root { --disney-blue: #003399; --disney-gold: #ffcc00; --gemini-purple: #9b59b6; }
        body { background: var(--disney-blue); color: white; font-family: 'Trebuchet MS', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .header { background: var(--disney-gold); color: var(--disney-blue); padding: 12px; text-align: center; font-weight: bold; font-size: 1.6rem; border-bottom: 2px solid white; }
        .top-waits-bar { background: rgba(0,0,0,0.5); display: flex; justify-content: space-around; padding: 8px; border-bottom: 2px solid var(--disney-gold); font-size: 0.8rem; }
        .main { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 320px; background: rgba(0, 40, 120, 0.95); border-right: 4px solid var(--disney-gold); padding: 20px; display: flex; flex-direction: column; }
        .suggestion-tab { background: linear-gradient(135deg, #2c3e50, #003399); border: 2px solid var(--gemini-purple); padding: 15px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        .ai-title { color: #d499ff; font-weight: bold; font-size: 0.9rem; margin-bottom: 8px; }
        .tip-text { font-size: 0.85rem; line-height: 1.4; margin-bottom: 10px; }
        .sidebar-box { border: 2px solid var(--disney-gold); padding: 10px; border-radius: 5px; text-align: center; background: rgba(0,0,0,0.2); margin-bottom: 15px; }
        .content { flex: 1; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle, #0044bb 0%, #001133 100%); position: relative; }
        .ride-spotlight { width: 85%; max-width: 600px; padding: 40px; border-radius: 40px; background: rgba(255, 255, 255, 0.1); border: 5px solid var(--disney-gold); text-align: center; display: none; box-shadow: 0 0 60px rgba(0,0,0,0.6); backdrop-filter: blur(10px); cursor: pointer; }
        .active { display: block; animation: slideIn 0.8s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        #modal { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #001133; padding: 25px; border: 4px solid var(--disney-gold); border-radius: 20px; z-index: 100; width: 80%; max-width: 700px; }
        #overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 50; }
    </style>
</head>
<body>
    <div class="header">WALT DISNEY WORLD RESORT INFORMATION</div>
    <div class="top-waits-bar">
        {% for ride in top_5 %}<span>{{ ride.name | upper }}: <b style="color:var(--disney-gold)">{{ ride.wait }} MIN</b></span>{% endfor %}
    </div>
    <div class="main">
        <div class="sidebar">
            <div class="suggestion-tab">
                <div class="ai-title">✨ GEMINI LIVE GUIDE</div>
                {% for tip in ai_tips %}<div class="tip-text">{{ tip }}</div>{% endfor %}
            </div>
            <div class="sidebar-box">
                <input type="text" id="searchBar" placeholder="Search Playlist..." onkeyup="searchRides()" style="width:90%; padding:8px; border-radius:5px; border:2px solid var(--disney-gold); background:#001133; color:white;">
                <ul id="resultsList" style="list-style:none; padding:0; max-height:100px; overflow-y:auto; font-size:0.8rem; text-align:left;"></ul>
                <button id="resumeBtn" onclick="resumeRotation()" style="display:none; margin-top:5px; width:100%; background:var(--disney-gold); border:none; padding:8px; font-weight:bold; cursor:pointer;">▶ Resume</button>
            </div>
            <div class="sidebar-box"><div id="clock" style="font-size: 1.8rem; font-weight: bold;">--:--</div></div>
            <div style="flex:1; overflow-y:auto;">
                <div style="color:var(--disney-gold); font-weight:bold; text-align:center; font-size:0.9rem; border-bottom:1px solid #ffcc00; margin-bottom:10px;">PARK HOURS</div>
                {% for park, time in hours.items() %}
                    <div style="font-size:0.8rem; margin-bottom:8px;"><b>{{ park }}</b><br><span style="color:#00ff00;">{{ time }}</span></div>
                {% endfor %}
            </div>
            <a href="/history" style="color:var(--disney-gold); font-size:0.7rem; text-align:center; text-decoration:none; border:1px solid var(--disney-gold); padding:5px; border-radius:5px;">HISTORY LOG</a>
        </div>
        <div class="content">
            {% for ride in playlist %}
            <div class="ride-spotlight" data-name="{{ ride.name.lower() }}" onclick="showHistory('{{ ride.name }}')">
                <div style="color:var(--disney-gold); letter-spacing:4px; margin-bottom:10px;">{{ ride.park | upper }}</div>
                <div style="font-size:2.8rem; font-weight:bold; margin-bottom:20px;">{{ ride.name }}</div>
                {% if ride.status == "OPEN" %}
                    <div style="opacity:0.7;">CURRENT WAIT</div>
                    <div style="font-size:7rem; font-weight:bold; color:var(--disney-gold);">{{ ride.wait }}</div>
                    <div style="font-size:1.6rem; color:var(--disney-gold);">MINUTES</div>
                {% else %}
                    <div style="font-size:4.5rem; color:#ff3333; font-weight:bold;">DELAYED</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
    </div>
    <div id="overlay" onclick="closeModal()"></div>
    <div id="modal">
        <h2 id="modalTitle" style="color:var(--disney-gold); margin-top:0;"></h2>
        <canvas id="chart"></canvas>
    </div>
    <script>
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
    app.run(host='0.0.0.0', port=5001, debug=False)