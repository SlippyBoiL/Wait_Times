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

def daily_maintenance():
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(hours=24)
        WaitHistory.query.filter(WaitHistory.timestamp < cutoff).delete()
        db.session.commit()

scheduler = BackgroundScheduler()
scheduler.add_job(func=daily_maintenance, trigger="interval", hours=24)
scheduler.add_job(func=update_park_hours, trigger="interval", hours=24)
scheduler.start()

# --- GEMINI SUGGESTION ENGINE ---
def generate_ai_advice(playlist):
    tips = []
    open_rides = [r for r in playlist if r['status'] == "OPEN"]
    if not open_rides:
        return ["It looks like the parks are currently closed. Plan your next selection!"]
    
    thrill_hits = ["Mine Train", "Space Mountain", "VelociCoaster", "Hagrid", "Stardust Racers", "Monsters Unchained"]
    family_hits = ["Mickey & Minnie", "Slinky Dog", "Peter Pan", "Navi River"]
    
    for ride in open_rides:
        if any(hit in ride['name'] for hit in thrill_hits) and ride['wait'] <= 45:
            tips.append(f"🎢 THRILL ALERT: {ride['name']} is at a rare low of {ride['wait']} mins!")
        elif any(hit in ride['name'] for hit in family_hits) and ride['wait'] <= 35:
            tips.append(f"👨‍👩‍👧 FAMILY PICK: {ride['name']} is only {ride['wait']} mins right now.")

    return tips[:2]

# --- ROUTES ---

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
    return jsonify(manifest_data)

@app.route('/sw.js')
def service_worker():
    sw_code = "self.addEventListener('install', (e) => { }); self.addEventListener('fetch', (e) => { });"
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
                    if status == "DELAYED": delayed_rides.append(ride_unit)
                    db.session.add(WaitHistory(ride_name=ride_unit['name'], park_name=park_name, wait_time=display_wait, status=status))

            if 'lands' in data:
                for land in data['lands']: process_rides(land.get('rides', []))
            if 'rides' in data: process_rides(data['rides'])
            db.session.commit()
        except: pass

    ai_suggestions = generate_ai_advice(playlist)
    top_5 = sorted([r for r in playlist if r['status'] == "OPEN"], key=lambda x: x['wait'], reverse=True)[:5]
    random.shuffle(playlist)
    
    last_updated = datetime.now().strftime("%I:%M %p")
    is_evening = datetime.now().hour >= 19
    
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
        
        .header { background: var(--disney-gold); color: var(--disney-blue); padding: 8px 15px; text-align: center; font-weight: bold; font-size: 1.1rem; border-bottom: 2px solid white; display: flex; justify-content: center; align-items: center; }
        
        .top-waits-bar { background: rgba(0,0,0,0.5); padding: 4px 0; border-bottom: 2px solid var(--disney-gold); font-size: 0.8rem; overflow: hidden; white-space: nowrap; height: 25px; display: flex; align-items: center; }
        .marquee-content { display: inline-block; animation: marquee 35s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .marquee-item { margin-right: 40px; }

        .main { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 340px; background: rgba(0, 40, 120, 0.95); border-right: 4px solid var(--disney-gold); padding: 20px; display: flex; flex-direction: column; overflow-y: auto; box-sizing: border-box; }
        
        .content { flex: 1; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle, #0044bb 0%, #001133 100%); position: relative; overflow-y: auto; }
        .ride-spotlight { width: 85%; max-width: 600px; padding: 30px; border-radius: 40px; background: rgba(255, 255, 255, 0.1); border: 5px solid var(--disney-gold); text-align: center; display: none; box-shadow: 0 0 60px rgba(0,0,0,0.6); backdrop-filter: blur(10px); }
        .active { display: block; animation: slideIn 0.8s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        /* Park View Modal */
        #parkModal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--disney-blue); z-index: 200; overflow-y: auto; padding: 20px; box-sizing: border-box; animation: slideUp 0.4s ease-out; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .park-grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 20px; }
        .park-ride-item { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 5px solid var(--disney-gold); }
        
        @media (max-width: 800px) {
            body { overflow-y: auto; }
            .main { flex-direction: column-reverse; overflow: visible; }
            .sidebar { width: 100%; border-right: none; border-top: 4px solid var(--disney-gold); }
            .content { padding: 20px 0; min-height: 60vh; }
            .ride-spotlight { padding: 20px; width: 90%; }
        }
    </style>
</head>
<body>
    <div class="header">WDW & UNIVERSAL DASHBOARD</div>
    
    <div class="top-waits-bar">
        <div class="marquee-content">
            {% for ride in top_5 %}
            <span class="marquee-item">{{ ride.name | upper }}: <b style="color:var(--disney-gold)">{{ ride.wait }} MIN</b></span>
            {% endfor %}
        </div>
    </div>
    
    <div class="main">
        <div class="sidebar">
            <div class="sidebar-box" style="display:flex; justify-content: space-between; align-items: center; border: 2px solid var(--disney-gold); padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.2); margin-bottom: 15px;">
                <div id="clock" style="font-size: 1.4rem; font-weight: bold;">--:--</div>
                <div style="font-size: 0.7rem; color: #aaa; text-align: right;">Updated:<br><span style="color:var(--disney-gold);">{{ last_updated }}</span></div>
            </div>
            <div class="suggestion-tab" style="background: linear-gradient(135deg, #2c3e50, #003399); border: 2px solid var(--gemini-purple); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                <div style="color: #d499ff; font-weight: bold; font-size: 0.9rem; margin-bottom: 8px;">✨ GEMINI LIVE GUIDE</div>
                {% for tip in ai_tips %}<div style="font-size: 0.85rem; line-height: 1.4; margin-bottom: 10px;">{{ tip }}</div>{% endfor %}
            </div>
            <div style="color:var(--disney-gold); font-weight:bold; text-align:center; font-size:0.9rem; border-bottom:1px solid #ffcc00; margin-bottom:10px;">PARK HOURS</div>
            {% for park, time in hours.items() %}<div style="font-size:0.8rem; margin-bottom:8px;"><b>{{ park }}</b><br><span style="color:#00ff00;">{{ time }}</span></div>{% endfor %}
        </div>
        
        <div class="content">
            {% for ride in playlist %}
            <div class="ride-spotlight" data-name="{{ ride.name.lower() }}" data-park="{{ ride.park }}">
                <div onclick="openParkView('{{ ride.park }}')" style="color:var(--disney-gold); letter-spacing:4px; margin-bottom:10px; font-size:0.9rem; cursor:pointer; text-decoration: underline;">{{ ride.park | upper }}</div>
                <div class="ride-title" style="font-size:2rem; font-weight:bold; margin-bottom:20px;">{{ ride.name }}</div>
                {% if ride.status == "OPEN" %}
                    <div style="opacity:0.7; font-size: 0.8rem;">CURRENT WAIT</div>
                    {% set wait_color = '#00ff00' if ride.wait < 30 else ('#ffcc00' if ride.wait <= 60 else '#ff3333') %}
                    <div style="font-size:5rem; font-weight:bold; color:{{ wait_color }};">{{ ride.wait }}</div>
                    <div style="font-size:1.2rem; color:{{ wait_color }};">MINUTES</div>
                {% else %}
                    <div style="font-size:3.5rem; color:var(--downtime-red); font-weight:bold;">DELAYED</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
    </div>

    <div id="parkModal">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2 id="parkModalName" style="color:var(--disney-gold); margin:0;"></h2>
            <button onclick="closeParkView()" style="background:var(--downtime-red); border:none; color:white; padding:10px 20px; border-radius:5px; font-weight:bold;">CLOSE</button>
        </div>
        <div id="parkRideList" class="park-grid"></div>
    </div>
    
    <script>
        setTimeout(() => { window.location.reload(); }, 300000);
        function updateClock() { document.getElementById('clock').innerText = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
        setInterval(updateClock, 1000); updateClock();
        
        let currentIndex = 0; const spotlightCards = document.querySelectorAll('.ride-spotlight');
        function cycleSpotlight() { 
            if (document.getElementById('parkModal').style.display === 'block') return;
            spotlightCards[currentIndex].classList.remove('active'); 
            currentIndex = (currentIndex + 1) % spotlightCards.length; 
            spotlightCards[currentIndex].classList.add('active'); 
        }
        if (spotlightCards.length > 0) { spotlightCards[0].classList.add('active'); setInterval(cycleSpotlight, 7000); }

        function openParkView(parkName) {
            const modal = document.getElementById('parkModal');
            const list = document.getElementById('parkRideList');
            document.getElementById('parkModalName').innerText = parkName.toUpperCase();
            list.innerHTML = '';
            
            spotlightCards.forEach(card => {
                if (card.getAttribute('data-park') === parkName) {
                    const name = card.querySelector('.ride-title').innerText;
                    const wait = card.querySelector('[style*="font-size:5rem"]') ? card.querySelector('[style*="font-size:5rem"]').innerText : "DOWN";
                    const color = card.querySelector('[style*="font-size:5rem"]') ? card.querySelector('[style*="font-size:5rem"]').style.color : "var(--downtime-red)";
                    
                    const item = document.createElement('div');
                    item.className = 'park-ride-item';
                    item.innerHTML = `<span>${name}</span><b style="color:${color}">${wait} ${wait === 'DOWN' ? '' : 'MIN'}</b>`;
                    list.appendChild(item);
                }
            });
            modal.style.display = 'block';
        }

        function closeParkView() { document.getElementById('parkModal').style.display = 'none'; }
    </script>
</body>
</html>
"""

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5001, debug=False)