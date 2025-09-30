// editor.js
let eRenderer, eScene, eCamera, eControls, eRaycaster;
let ePoints = [];
let ePointMeshes = [];
let eTrackLine;
const editorCanvas = document.getElementById('editorCanvas');

function edInit(){
  eRenderer = new THREE.WebGLRenderer({canvas: editorCanvas, antialias:true});
  eRenderer.setPixelRatio(window.devicePixelRatio);
  eRenderer.setSize(editorCanvas.clientWidth, editorCanvas.clientHeight, false);

  eScene = new THREE.Scene();
  eScene.background = new THREE.Color(0x061018);

  eCamera = new THREE.PerspectiveCamera(60, editorCanvas.clientWidth / editorCanvas.clientHeight, 0.1, 1000);
  eCamera.position.set(0, 80, 120);
  eControls = new THREE.OrbitControls(eCamera, eRenderer.domElement);
  eControls.target.set(0,0,0);

  eScene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(100,100,100); eScene.add(dir);
  const grid = new THREE.GridHelper(400, 40, 0x1a2730, 0x101418); eScene.add(grid);

  eRaycaster = new THREE.Raycaster();
  const planeGeo = new THREE.PlaneGeometry(1000,1000);
  const planeMat = new THREE.MeshBasicMaterial({visible:false});
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI/2;
  eScene.add(plane);
  window.addEventListener('resize', eOnResize);
  eRenderer.domElement.addEventListener('click', onEditorClick);

  // UI bindings
  document.getElementById('newPoint').onclick = ()=>{ alert('Click on the scene where you want to place a point'); };
  document.getElementById('saveTrack').onclick = saveTrack;

  animateEditor();
}

function eOnResize(){
  eCamera.aspect = eRenderer.domElement.clientWidth / eRenderer.domElement.clientHeight;
  eCamera.updateProjectionMatrix();
  eRenderer.setSize(eRenderer.domElement.clientWidth, eRenderer.domElement.clientHeight, false);
}

function onEditorClick(event){
  // map click to 3d plane
  const rect = eRenderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  eRaycaster.setFromCamera({x,y}, eCamera);
  const intersects = eRaycaster.intersectObjects(eScene.children, true);
  if (intersects.length){
    // find plane intersection (first)
    const inter = intersects.find(i=>i.object.geometry && i.object.geometry.type === 'PlaneGeometry');
    let point;
    if (inter) point = inter.point;
    else point = intersects[0].point;
    addPoint({x: point.x, y: 0, z: point.z});
  }
}

function addPoint(p){
  ePoints.push(p);
  const g = new THREE.SphereGeometry(1.2, 8, 8);
  const m = new THREE.MeshStandardMaterial({color:0xffcc00});
  const msh = new THREE.Mesh(g,m);
  msh.position.set(p.x,p.y+1,p.z);
  ePointMeshes.push(msh);
  eScene.add(msh);
  rebuildTrackLine();
}

function rebuildTrackLine(){
  if (eTrackLine) { eScene.remove(eTrackLine); eTrackLine.geometry.dispose(); }
  if (ePoints.length < 2) return;
  const geom = new THREE.BufferGeometry();
  const verts = [];
  ePoints.forEach(p => { verts.push(p.x, p.y+0.1, p.z); });
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({color:0x00ffcc});
  eTrackLine = new THREE.Line(geom, mat);
  eScene.add(eTrackLine);
}

function saveTrack(){
  const id = document.getElementById('editorId').value.trim();
  const name = document.getElementById('editorName').value.trim();
  if (!id || !name) return alert('Please provide track ID and name');
  if (ePoints.length < 3) return alert('Add at least 3 points');
  // POST to server
  fetch('/api/tracks', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ id, name, points: ePoints })
  }).then(async r => {
    if (!r.ok) {
      const body = await r.json().catch(()=>({error:'unknown'}));
      return alert('Error saving track: ' + (body && body.error ? body.error : r.statusText));
    }
    alert('Saved!');
    // refresh track list in game (reload page or call API)
    try { window.parent && window.parent.location.reload(); } catch(e){ location.reload(); }
  });
}

function animateEditor(){
  requestAnimationFrame(animateEditor);
  eControls.update();
  eRenderer.render(eScene, eCamera);
}

// init editor on load
window.addEventListener('load', edInit);
