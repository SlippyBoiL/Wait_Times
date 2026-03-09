from flask import Flask, render_template_string, jsonify, make_response
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import requests
import os
import random
import subprocess
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)

# --- GIT VERSION TRACKER ---
def get_git_version():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode('ascii').strip()
    except:
        return "v3.0.0-Global"

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

# --- ALL 7 PARKS INCLUDED ---
PARKS = {
    "Magic Kingdom": 6, 
    "EPCOT": 5, 
    "Hollywood Studios": 7, 
    "Animal Kingdom": 8,
    "Universal Studios Florida": 65, 
    "Islands of Adventure": 64, 
    "Epic Universe": 334
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

def generate_ai_advice(playlist):
    tips = []
    open_rides = [r for r in playlist if r['status'] == "OPEN"]
    if not open_rides: return ["Parks are resting. Time to plan tomorrow's rope drop!"]
    
    thrill_hits = ["VelociCoaster", "Hagrid", "Stardust Racers", "Monsters Unchained", "Guardians"]
    for ride in open_rides:
        if any(hit in ride['name'] for hit in thrill_hits) and ride['wait'] <= 45:
            tips.append(f"🎢 THRILL ALERT: {ride['name']} is at {ride['wait']} mins!")
    
    return tips[:2] if tips else ["All systems nominal. Have a magical day!"]

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

# --- REFRESHED MAIN TEMPLATE ---
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Resort TV Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        :root { --disney-blue: #003399; --disney-gold: #ffcc00; --downtime-red: #ff4444; }
        body { background: var(--disney-blue); color: white; font-family: 'Trebuchet MS', sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        
        .header { background: var(--disney-gold); color: var(--disney-blue); padding: 10px; text-align: center; font-weight: bold; font-size: 1.1rem; border-bottom: 2px solid white; }
        
        .top-waits-bar { background: rgba(0,0,0,0.5); padding: 6px 0; border-bottom: 2px solid var(--disney-gold); font-size: 0.8rem; overflow: hidden; white-space: nowrap; }
        .marquee-content { display: inline-block; animation: marquee 35s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .marquee-item { margin-right: 40px; }

        .main { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 330px; background: rgba(0, 30, 90, 0.95); border-right: 3px solid var(--disney-gold); padding: 15px; display: flex; flex-direction: column; overflow-y: auto; }
        
        .content { flex: 1; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle, #0044bb 0%, #001133 100%); position: relative; }
        .ride-spotlight { width: 90%; max-width: 500px; padding: 30px; border-radius: 35px; background: rgba(255, 255, 255, 0.1); border: 4px solid var(--disney-gold); text-align: center; display: none; box-shadow: 0 0 50px rgba(0,0,0,0.6); backdrop-filter: blur(10px); }
        .active { display: block; animation: slideIn 0.8s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        /* Park Explorer Overlay */
        #parkOverlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--disney-blue); z-index: 2000; padding: 20px; box-sizing: border-box; overflow-y: auto; }
        .park-title { color: var(--disney-gold); border-bottom: 2px solid var(--disney-gold); padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 1.4rem; font-weight: bold; }
        .ride-row { background: rgba(255,255,255,0.08); padding: 15px; border-radius: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 5px solid var(--disney-gold); }
        
        .clickable { cursor: pointer; transition: 0.3s; }
        .clickable:hover { color: var(--disney-gold); text-decoration: underline; }

        @media (max-width: 800px) {
            .main { flex-direction: column-reverse; overflow: visible; }
            .sidebar { width: 100%; border-right: none; border-top: 3px solid var(--disney-gold); }
            .content { min-height: 60vh; }
        }
    </style>
</head>
<body>
    <div class="header">WALT DISNEY WORLD & UNIVERSAL DASHBOARD</div>
    
    <div class="top-waits-bar">
        <div class="marquee-content">
            {% for ride in top_5 %}<span class="marquee-item">{{ ride.name | upper }}: <b style="color:var(--disney-gold)">{{ ride.wait }} MIN</b></span>{% endfor %}
        </div>
    </div>
    
    <div class="main">
        <div class="sidebar">
            <div style="font-size: 1.3rem; font-weight: bold; margin-bottom: 20px; display:flex; justify-content: space-between;">
                <span>{{ last_updated }}</span>
                <span style="color:var(--disney-gold);">FLORIDA</span>
            </div>
            
            <div style="background: rgba(155, 89, 182, 0.2); border: 2px solid #9b59b6; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <div style="font-size: 0.85rem; font-weight: bold; color: #d499ff; margin-bottom: 8px;">✨ GEMINI LIVE ADVICE</div>
                {% for tip in ai_tips %}<div style="font-size: 0.85rem; line-height: 1.4; margin-bottom: 8px;">{{ tip }}</div>{% endfor %}
            </div>

            <div style="font-weight:bold; color:var(--disney-gold); margin-bottom: 12px; border-bottom: 1px solid var(--disney-gold); font-size: 0.9rem;">TAP PARK TO EXPLORE ALL WAITS</div>
            {% for park, time in hours.items() %}
                <div class="clickable" onclick="openPark('{{ park }}')" style="margin-bottom: 15px; font-size: 0.9rem;">
                    <b>{{ park }}</b><br><span style="color:#00ff00;">{{ time }}</span>
                </div>
            {% endfor %}
        </div>
        
        <div class="content">
            {% for ride in playlist %}
            <div class="ride-spotlight" data-park="{{ ride.park }}">
                <div class="clickable" onclick="openPark('{{ ride.park }}')" style="color:var(--disney-gold); font-size:0.85rem; letter-spacing:4px; margin-bottom:12px;">{{ ride.park | upper }}</div>
                <div style="font-size:2rem; font-weight:bold; margin-bottom:20px;">{{ ride.name }}</div>
                {% if ride.status == "OPEN" %}
                    <div style="font-size:5.5rem; font-weight:bold; color:#00ff00;">{{ ride.wait }}</div>
                    <div style="font-size:1.2rem; color:#00ff00;">MINUTES</div>
                {% else %}
                    <div style="font-size:3.5rem; font-weight:bold; color:var(--downtime-red);">DELAYED</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
    </div>

    <div id="parkOverlay">
        <div class="park-title">
            <span id="overlayName">EXPLORER</span>
            <button onclick="closePark()" style="background:var(--downtime-red); color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer;">CLOSE</button>
        </div>
        <div id="rideGrid"></div>
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
        if (cards.length > 0) { cards[0].classList.add('active'); setInterval(cycle, 7500); }

        function openPark(parkName) {
            document.getElementById('overlayName').innerText = parkName.toUpperCase();
            const grid = document.getElementById('rideGrid');
            grid.innerHTML = '';
            
            const allRides = Array.from(cards).filter(c => c.dataset.park === parkName);
            allRides.forEach(c => {
                const name = c.querySelector('div:nth-child(2)').innerText;
                const wait = c.querySelector('[style*="font-size:5.5rem"]') ? c.querySelector('[style*="font-size:5.5rem"]').innerText : "DOWN";
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
