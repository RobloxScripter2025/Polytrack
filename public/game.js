// game.js
let renderer, scene, camera, controls;
let trackMesh, carMesh;
let trackPoints = [];
let clock, runStart = null, runActive = false;
let timeDisplay = null, statusEl = null, leaderboardEl = null;

const api = {
  listTracks: () => fetch('/api/tracks').then(r=>r.json()),
  getTrack: (id) => fetch('/api/tracks/' + id).then(r=>r.json()),
  submitTime: (payload) => fetch('/api/submit-time', {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(payload)
  }).then(r=>r.json()),
  leaderboard: (trackId) => fetch('/api/leaderboard?track=' + encodeURIComponent(trackId)).then(r=>r.json())
};

function init() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071018);

  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(0, 40, 120);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.target.set(0,0,0);

  // lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(100,100,100);
  scene.add(dir);

  // ground grid
  const grid = new THREE.GridHelper(400, 40, 0x1a2730, 0x101418);
  grid.position.y = -0.1;
  scene.add(grid);

  clock = new THREE.Clock(false);

  // HUD elements
  timeDisplay = document.getElementById('timeDisplay');
  statusEl = document.getElementById('status');
  leaderboardEl = document.getElementById('leaderboard');

  // create car
  const carGeo = new THREE.BoxGeometry(4,1.5,6);
  const carMat = new THREE.MeshStandardMaterial({color:0x98FB98, flatShading:true});
  carMesh = new THREE.Mesh(carGeo, carMat);
  carMesh.position.set(0,1,0);
  scene.add(carMesh);

  // default track load
  loadTracksList();

  window.addEventListener('resize', onResize);
  animate();
  setupControls();
}

function onResize(){
  const canvas = renderer.domElement;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
}

function buildTrackMesh(points){
  if (trackMesh) { scene.remove(trackMesh); trackMesh.geometry.dispose(); }
  // simple ribbon along points
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];
  const width = 6;
  for (let i=0;i<points.length;i++){
    const p = points[i];
    // compute forward tangent
    const next = points[(i+1)%points.length] || points[i];
    const dir = new THREE.Vector3(next.x - p.x, 0, next.z - p.z).normalize();
    const left = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width/2);
    const v1 = new THREE.Vector3(p.x, p.y+0.05, p.z).add(left);
    const v2 = new THREE.Vector3(p.x, p.y+0.05, p.z).sub(left);
    vertices.push(v1.x, v1.y, v1.z);
    vertices.push(v2.x, v2.y, v2.z);
    if (i>0){
      const a = (i-1)*2;
      const b = a+1;
      const c = i*2;
      const d = c+1;
      indices.push(a,c,b); indices.push(c,d,b);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({color:0x2f9cff, metalness:0.1, roughness:0.8});
  trackMesh = new THREE.Mesh(geometry, mat);
  scene.add(trackMesh);
}

// find closest point on polyline (naive)
function findStartPoint(points){
  return new THREE.Vector3(points[0].x, points[0].y + 1, points[0].z);
}

// physics state
const carState = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  angle: 0, // yaw in radians
  speed: 0
};

function resetCarToStart(points){
  const p = findStartPoint(points);
  carState.pos.copy(p);
  carState.vel.set(0,0,0);
  carState.speed = 0;
  carState.angle = 0;
  carMesh.position.copy(p);
  carMesh.rotation.set(0,0,0);
  statusEl.textContent = 'Status: Ready';
  runActive = false;
  runStart = null;
  timeDisplay.textContent = '0.000';
}

let input = { up:false, down:false, left:false, right:false };

function setupControls(){
  window.addEventListener('keydown', (e)=>{
    if (['ArrowUp','w','W'].includes(e.key)) input.up = true;
    if (['ArrowDown','s','S'].includes(e.key)) input.down = true;
    if (['ArrowLeft','a','A'].includes(e.key)) input.left = true;
    if (['ArrowRight','d','D'].includes(e.key)) input.right = true;
    if (e.key === 'r' || e.key === 'R') {
      if (trackPoints && trackPoints.length) resetCarToStart(trackPoints);
    }
  });
  window.addEventListener('keyup', (e)=>{
    if (['ArrowUp','w','W'].includes(e.key)) input.up = false;
    if (['ArrowDown','s','S'].includes(e.key)) input.down = false;
    if (['ArrowLeft','a','A'].includes(e.key)) input.left = false;
    if (['ArrowRight','d','D'].includes(e.key)) input.right = false;
  });
  document.getElementById('startRun').onclick = ()=>{
    if (!trackPoints || trackPoints.length<2) return alert('No track loaded');
    resetCarToStart(trackPoints);
    runActive = true;
    runStart = performance.now();
    clock.start();
    statusEl.textContent = 'Status: Running';
  };
  document.getElementById('resetCar').onclick = ()=>{ resetCarToStart(trackPoints); };
  document.getElementById('trackSelect').onchange = async (e)=>{
    const id = e.target.value;
    if (!id) return;
    const track = await api.getTrack(id);
    trackPoints = track.points;
    buildTrackMesh(trackPoints);
    resetCarToStart(trackPoints);
    loadLeaderboard(id);
  };
  // load saved player name
  const pn = localStorage.getItem('poly_name');
  if (pn) document.getElementById('playerName').value = pn;
  document.getElementById('playerName').onchange = (e)=> localStorage.setItem('poly_name', e.target.value);
}

function updatePhysics(dt){
  // basic car model: acceleration, friction, turning
  const accel = input.up ? 40 : (input.down ? -20 : 0);
  carState.speed += accel * dt;
  // clamp
  if (carState.speed > 70) carState.speed = 70;
  if (carState.speed < -20) carState.speed = -20;
  // steering
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const turnRate = 2.5; // rad/s at speed factor
  const speedFactor = Math.max(0.2, Math.min(1.0, Math.abs(carState.speed)/30));
  carState.angle += steer * turnRate * dt * speedFactor;
  // apply velocity along angle
  carState.vel.set(Math.sin(carState.angle), 0, Math.cos(carState.angle)).multiplyScalar(carState.speed);
  // simple friction
  carState.vel.multiplyScalar(1 - Math.min(0.9, dt * 0.5));
  // update pos
  carState.pos.addScaledVector(carState.vel, dt);
  // bounce if below ground
  if (carState.pos.y < 0.5) carState.pos.y = 0.5;
  // set mesh
  carMesh.position.copy(carState.pos);
  carMesh.rotation.y = carState.angle;
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (runActive) {
    updatePhysics(dt);
    const elapsed = (performance.now() - runStart)/1000;
    timeDisplay.textContent = elapsed.toFixed(3);
    // naive finish detection: if we cross near starting point after some time
    const start = findStartPoint(trackPoints);
    const distToStart = carState.pos.distanceTo(start);
    if (elapsed > 1.0 && distToStart < 6) {
      // finish
      runActive = false;
      clock.stop();
      statusEl.textContent = 'Status: Finished';
      const finalMs = Math.round(elapsed * 1000);
      submitTimeIfBetter(finalMs);
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

async function loadTracksList(){
  const select = document.getElementById('trackSelect');
  select.innerHTML = '<option value="">Loading tracks...</option>';
  const tracks = await api.listTracks();
  select.innerHTML = '';
  tracks.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    select.appendChild(opt);
  });
  if (tracks.length>0) {
    select.value = tracks[0].id;
    const track = await api.getTrack(tracks[0].id);
    trackPoints = track.points;
    buildTrackMesh(trackPoints);
    resetCarToStart(trackPoints);
    loadLeaderboard(tracks[0].id);
  } else {
    select.innerHTML = '<option value="">No tracks</option>';
  }
}

async function loadLeaderboard(trackId){
  leaderboardEl.innerHTML = '<li>Loading...</li>';
  const lb = await api.leaderboard(trackId);
  leaderboardEl.innerHTML = '';
  if (!lb || lb.length===0) {
    leaderboardEl.innerHTML = '<li>No times yet</li>';
    return;
  }
  lb.slice(0,10).forEach((row,i)=>{
    const li = document.createElement('li');
    li.textContent = `${row.name} — ${(row.timeMs/1000).toFixed(3)}s`;
    leaderboardEl.appendChild(li);
  });
}

async function submitTimeIfBetter(finalMs){
  const trackId = document.getElementById('trackSelect').value;
  if (!trackId) return;
  const name = document.getElementById('playerName').value || 'Player';
  // submit regardless (server will limit top 50)
  await api.submitTime({ trackId, name, timeMs: finalMs });
  await loadLeaderboard(trackId);
  alert(`Run complete: ${(finalMs/1000).toFixed(3)}s — submitted`);
}

// start
window.addEventListener('load', init);
