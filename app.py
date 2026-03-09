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
        return "v2.6.0-Mobile-Optimized"

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

park_hours = {
    "Magic Kingdom": "9:00 AM - 11:00 PM",
    "EPCOT": "9:00 AM - 9:00 PM",
    "Hollywood Studios": "9:00 AM - 9:00 PM",
    "Animal Kingdom": "8:00 AM - 7:00 PM",
    "Universal Studios Florida": "9:00 AM - 9:00 PM",
    "Islands of Adventure": "9:00 AM - 8:00 PM",
    "Epic Universe": "9:00 AM - 10:00 PM"
}

def daily_maintenance():
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(hours=24)
        WaitHistory.query.filter(WaitHistory.timestamp < cutoff).delete()
        db.session.commit()

scheduler = BackgroundScheduler()
scheduler.add_job(func=daily_maintenance, trigger="interval", hours=24)
scheduler.start()

# --- GEMINI SUGGESTION ENGINE ---
def generate_ai_advice(playlist):
    tips = []
    open_rides = [r for r in playlist if r['status'] == "OPEN"]
    if not open_rides: return ["Parks are currently winding down. Check back for rope drop!"]
    
    thrill_hits = ["Mine Train", "Space Mountain", "VelociCoaster", "Hagrid", "Stardust Racers", "Monsters Unchained"]
    for ride in open_rides:
        if any(hit in ride['name'] for hit in thrill_hits) and ride['wait'] <= 40:
            tips.append(f"🎢 THRILL ALERT: {ride['name']} is at {ride['wait']} mins!")
    
    return tips[:2] if tips else ["All systems nominal. Enjoy the magic!"]

# --- ROUTES ---

@app.route('/api/history/<path:ride_name>')
def get_ride_history(ride_name):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    history = WaitHistory.query.filter(WaitHistory.ride_name == ride_name, WaitHistory.timestamp > cutoff).order_by(WaitHistory.timestamp.asc()).all()
    return jsonify([{"time": h.timestamp.strftime("%H:%M"), "wait": h.wait_time} for h in history])

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
                    ride_unit = {"name": r_data.get('name'), "park": park_name, "wait": raw_wait, "status": status}
                    playlist.append(ride_unit)
                    if status == "DELAYED": delayed_rides.append(ride_unit)
                    db.session.add(WaitHistory(ride_name=ride_unit['name'], park_name=park_name, wait_time=raw_wait, status=status))

            if 'lands' in data:
                for land in data['lands']: process_rides(land.get('rides', []))
            if 'rides' in data: process_rides(data['rides'])
            db.session.commit()
        except: pass

    ai_suggestions = generate_ai_advice(playlist)
    top_5 = sorted([r for r in playlist if r['status'] == "OPEN"], key=lambda x: x['wait'], reverse=True)[:5]
    random.shuffle(playlist)
    
    return render_template_string(MAIN_TEMPLATE, playlist=playlist, top_5=top_5, hours=park_hours, ai_tips=ai_suggestions, last_updated=datetime.now().strftime("%I:%M %p"), delayed_rides=delayed_rides)

# --- THE FRONTEND (UI) ---
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Resort TV Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root { --disney-blue: #003399; --disney-gold: #ffcc00; --downtime-red: #ff4444; }
        body { background: var(--disney-blue); color: white; font-family: 'Trebuchet MS', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        
        /* Header Spacing Fix */
        .header { background: var(--disney-gold); color: var(--disney-blue); padding: 8px; text-align: center; font-weight: bold; font-size: 1.1rem; border-bottom: 2px solid white; }
        
        /* Marquee Bar */
        .top-waits-bar { background: rgba(0,0,0,0.5); padding: 4px 0; border-bottom: 2px solid var(--disney-gold); font-size: 0.75rem; overflow: hidden; white-space: nowrap; }
        .marquee-content { display: inline-block; animation: marquee 40s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .marquee-item { margin-right: 40px; }

        .main { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 320px; background: rgba(0, 30, 90, 0.9); border-right: 3px solid var(--disney-gold); padding: 15px; display: flex; flex-direction: column; overflow-y: auto; }
        
        .content { flex: 1; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle, #0044bb 0%, #001133 100%); position: relative; }
        .ride-spotlight { width: 90%; max-width: 500px; padding: 25px; border-radius: 30px; background: rgba(255, 255, 255, 0.08); border: 4px solid var(--disney-gold); text-align: center; display: none; box-shadow: 0 0 40px rgba(0,0,0,0.5); backdrop-filter: blur(8px); }
        .active { display: block; animation: fadeIn 0.6s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Park View Overlay */
        #parkOverlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #001133; z-index: 1000; padding: 20px; box-sizing: border-box; overflow-y: auto; }
        .park-title { color: var(--disney-gold); border-bottom: 2px solid var(--disney-gold); padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; }
        .park-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .ride-row { background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--disney-gold); font-size: 0.9rem; }
        
        .clickable { cursor: pointer; transition: 0.2s; }
        .clickable:hover { color: var(--disney-gold); transform: scale(1.02); }

        @media (max-width: 800px) {
            .main { flex-direction: column-reverse; overflow: visible; }
            .sidebar { width: 100%; border-right: none; border-top: 3px solid var(--disney-gold); }
            .content { min-height: 55vh; padding: 20px 0; }
        }
    </style>
</head>
<body>
    <div class="header">WDW & UNIVERSAL DASHBOARD</div>
    
    <div class="top-waits-bar">
        <div class="marquee-content">
            {% for ride in top_5 %}<span class="marquee-item">{{ ride.name | upper }}: <b style="color:var(--disney-gold)">{{ ride.wait }} MIN</b></span>{% endfor %}
        </div>
    </div>
    
    <div class="main">
        <div class="sidebar">
            <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 15px; display:flex; justify-content: space-between;">
                <span>{{ last_updated }}</span>
                <span style="color:var(--disney-gold);">FLORIDA</span>
            </div>
            
            <div style="background: rgba(155, 89, 182, 0.2); border: 2px solid #9b59b6; padding: 12px; border-radius: 10px; margin-bottom: 20px;">
                <div style="font-size: 0.8rem; font-weight: bold; color: #d499ff; margin-bottom: 5px;">✨ GEMINI LIVE ADVICE</div>
                {% for tip in ai_tips %}<div style="font-size: 0.8rem; margin-bottom: 5px;">{{ tip }}</div>{% endfor %}
            </div>

            <div style="font-weight:bold; color:var(--disney-gold); margin-bottom: 10px; border-bottom: 1px solid var(--disney-gold);">TAP TO VIEW ALL WAITS</div>
            {% for park, time in hours.items() %}
                <div class="clickable" onclick="openPark('{{ park }}')" style="margin-bottom: 12px; font-size: 0.85rem;">
                    <b>{{ park }}</b><br><span style="color:#00ff00;">{{ time }}</span>
                </div>
            {% endfor %}
        </div>
        
        <div class="content">
            {% for ride in playlist %}
            <div class="ride-spotlight" data-park="{{ ride.park }}">
                <div class="clickable" onclick="openPark('{{ ride.park }}')" style="color:var(--disney-gold); font-size:0.8rem; letter-spacing:3px; margin-bottom:10px;">{{ ride.park | upper }}</div>
                <div style="font-size:1.8rem; font-weight:bold; margin-bottom:15px;">{{ ride.name }}</div>
                {% if ride.status == "OPEN" %}
                    <div style="font-size:4rem; font-weight:bold; color:#00ff00;">{{ ride.wait }}</div>
                    <div style="font-size:1rem; color:#00ff00;">MINUTES</div>
                {% else %}
                    <div style="font-size:3rem; font-weight:bold; color:var(--downtime-red);">DELAYED</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
    </div>

    <div id="parkOverlay">
        <div class="park-title">
            <span id="overlayName">PARK OVERVIEW</span>
            <button onclick="closePark()" style="background:var(--downtime-red); color:white; border:none; padding:8px 15px; border-radius:5px; font-weight:bold;">CLOSE</button>
        </div>
        <div id="rideGrid" class="park-grid"></div>
    </div>
    
    <script>
        setTimeout(() => { window.location.reload(); }, 300000);
        
        let currentIdx = 0; 
        const cards = document.querySelectorAll('.ride-spotlight');
        function cycle() {
            if (document.getElementById('parkOverlay').style.display === 'block') return;
            cards[currentIdx].classList.remove('active');
            currentIdx = (currentIdx + 1) % cards.length;
            cards[currentIdx].classList.add('active');
        }
        if (cards.length > 0) { cards[0].classList.add('active'); setInterval(cycle, 7000); }

        function openPark(parkName) {
            document.getElementById('overlayName').innerText = parkName.toUpperCase();
            const grid = document.getElementById('rideGrid');
            grid.innerHTML = '';
            
            // Build the list of rides for the selected park
            const allRides = Array.from(cards).filter(c => c.dataset.park === parkName);
            allRides.forEach(c => {
                const name = c.querySelector('div:nth-child(2)').innerText;
                const wait = c.querySelector('[style*="font-size:4rem"]') ? c.querySelector('[style*="font-size:4rem"]').innerText : "DOWN";
                const row = document.createElement('div');
                row.className = 'ride-row';
                row.innerHTML = `<span>${name}</span><b style="color:${wait==='DOWN'?'#ff4444':'#00ff00'}">${wait} ${wait==='DOWN'?'':'MIN'}</b>`;
                grid.appendChild(row);
            });
            document.getElementById('parkOverlay').style.display = 'block';
        }

        function closePark() { document.getElementById('parkOverlay').style.display = 'none'; }
    </script>
</body>
</html>
"""

if __name__ == '__main__':
    with app.app_context(): db.create_all()
    app.run(host='0.0.0.0', port=5001, debug=False)
