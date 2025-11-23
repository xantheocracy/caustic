import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(15, 15, 15);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

// Mouse controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.zoomSpeed = 1.0;

// Keyboard movement configuration
const movementConfig = {
    speed: 0.15,  // Units per frame at 60fps
    keys: {}
};

// Track keyboard input
document.addEventListener('keydown', (e) => {
    movementConfig.keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    movementConfig.keys[e.key.toLowerCase()] = false;
});

// Initialize room data
let triangleData = [];
let roomMesh = null;
let roomEdges = null;
let roomBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

// Initialize lights array and simulation results
let lights = [];
let points = [];
let pathogens = [];
let selectedPathogen = null;
let selectedMetric = 'uv_dose';
let sphereScale = 1.0;  // Track current sphere scale factor

// Calculate bounding box from triangles
function calculateBounds(triangles) {
    if (!triangles || triangles.length === 0) {
        return { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    triangles.forEach(triangle => {
        // Check all three vertices
        [triangle.v0, triangle.v1, triangle.v2].forEach(v => {
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
            if (v.z < minZ) minZ = v.z;
            if (v.z > maxZ) maxZ = v.z;
        });
    });

    return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ }
    };
}

// Update light input bounds based on room geometry
function updateLightInputBounds() {
    const lightX = document.getElementById('light-x');
    const lightY = document.getElementById('light-y');
    const lightZ = document.getElementById('light-z');

    if (!lightX || !lightY || !lightZ) return;

    lightX.min = roomBounds.min.x;
    lightX.max = roomBounds.max.x;
    lightX.step = (roomBounds.max.x - roomBounds.min.x) / 20;
    lightX.value = (roomBounds.min.x + roomBounds.max.x) / 2;

    lightY.min = roomBounds.min.y;
    lightY.max = roomBounds.max.y;
    lightY.step = (roomBounds.max.y - roomBounds.min.y) / 20;
    lightY.value = roomBounds.max.y * 0.95; // Near the top

    lightZ.min = roomBounds.min.z;
    lightZ.max = roomBounds.max.z;
    lightZ.step = (roomBounds.max.z - roomBounds.min.z) / 20;
    lightZ.value = (roomBounds.min.z + roomBounds.max.z) / 2;

    // Update labels
    const labelX = document.querySelector('label[for="light-x"]');
    const labelY = document.querySelector('label[for="light-y"]');
    const labelZ = document.querySelector('label[for="light-z"]');

    if (labelX) labelX.textContent = `Position X (${roomBounds.min.x.toFixed(1)}-${roomBounds.max.x.toFixed(1)}):`;
    if (labelY) labelY.textContent = `Position Y (${roomBounds.min.y.toFixed(1)}-${roomBounds.max.y.toFixed(1)}):`;
    if (labelZ) labelZ.textContent = `Position Z (${roomBounds.min.z.toFixed(1)}-${roomBounds.max.z.toFixed(1)}):`;

    // Update cross-section X bounds
    crossSectionXInput.min = roomBounds.min.x;
    crossSectionXInput.max = roomBounds.max.x;
    crossSectionXInput.step = (roomBounds.max.x - roomBounds.min.x) / 20;
    crossSectionXInput.value = (roomBounds.min.x + roomBounds.max.x) / 2;

    const labelCrossX = document.querySelector('label[for="cross-section-x"]');
    if (labelCrossX) labelCrossX.textContent = `X Coordinate (${roomBounds.min.x.toFixed(1)}-${roomBounds.max.x.toFixed(1)}):`;
}

// Load room triangles from settings file
async function loadRoomSettings(settingsFile) {
    try {
        const roomResponse = await fetch(`${config.backendUrl}/settings/${settingsFile}`);
        const roomData = await roomResponse.json();
        triangleData = roomData.triangles;

        // Calculate bounds from geometry
        roomBounds = calculateBounds(triangleData);
        console.log('Room bounds:', roomBounds);

        // Update input field bounds
        updateLightInputBounds();

        // Clear previous room visualization
        if (roomMesh) scene.remove(roomMesh);
        if (roomEdges) scene.remove(roomEdges);

        // Visualize the new room
        visualizeTriangles();

        console.log(`Loaded settings from ${settingsFile}`);
        return true;
    } catch (error) {
        console.error(`Error loading settings file ${settingsFile}:`, error);
        return false;
    }
}

// Color map utility for total_intensity using log scale (black to pink)
function getColorForIntensity(intensity, minI, maxI) {
    // Clamp between minI and maxI
    if (intensity < minI) intensity = minI;
    if (intensity > maxI) intensity = maxI;

    // Use log scale: log(intensity + 1) to handle zero values
    const logMin = Math.log(minI + 1);
    const logMax = Math.log(maxI + 1);
    const logIntensity = Math.log(intensity + 1);

    // Normalize 0 ... 1 on log scale
    let norm = (logIntensity - logMin) / (logMax - logMin);
    norm = Math.max(0, Math.min(1, norm)); // Clamp to [0, 1]

    // Interpolate black (0,0,0) to pink (1,0.75,1)
    let r = norm;      // Black to full red
    let g = norm * 0.75;  // Black to 75% green
    let b = norm;      // Black to full blue

    return new THREE.Color(r, g, b);
}

// Color map utility for survival rate (black for low survival, red for high survival)
function getColorForSurvivalRate(survivalRate, minRate, maxRate) {
    // Clamp between minRate and maxRate
    if (survivalRate < minRate) survivalRate = minRate;
    if (survivalRate > maxRate) survivalRate = maxRate;

    // Normalize 0 ... 1 (linear scale)
    let norm = (survivalRate - minRate) / (maxRate - minRate);

    // Interpolate black (0,0,0) to red (1,0,0)
    // High survival (1.0) = red (bad - pathogens survive)
    // Low survival (0.0) = black (good - pathogens killed)
    let r = norm;  // Black to red
    let g = 0.0;
    let b = 0.0;

    return new THREE.Color(r, g, b);
}

// Color map utility for eACH-UV (brown for low, bright blue for high)
function getColorForEchUV(echUV, minUV, maxUV) {
    // Clamp between minUV and maxUV
    if (echUV < minUV) echUV = minUV;
    if (echUV > maxUV) echUV = maxUV;

    // Normalize 0 ... 1 (linear scale)
    let norm = (echUV - minUV) / (maxUV - minUV);

    // Interpolate brown (0.6, 0.3, 0.0) to bright blue (0.0, 0.7, 1.0)
    let r = 0.6 * (1.0 - norm);      // Brown red component fades
    let g = 0.3 + 0.4 * norm;        // Green increases slightly
    let b = norm;                     // Blue increases

    return new THREE.Color(r, g, b);
}

// Rescale all spheres in the scene (both measurement points and lights)
function rescaleAllSpheres(scale) {
    // Rescale measurement point spheres
    pointMeshes.forEach(mesh => {
        if (mesh instanceof THREE.Mesh) {
            mesh.scale.set(scale, scale, scale);
        }
    });

    // Rescale light spheres (every other mesh in lightMeshes array)
    for (let i = 0; i < lightMeshes.length; i += 2) {
        if (lightMeshes[i] instanceof THREE.Mesh) {
            lightMeshes[i].scale.set(scale, scale, scale);
        }
    }
}


// Visualize triangles
function visualizeTriangles() {
    const triangles = triangleData;
    console.log(`Rendering ${triangles.length} triangles`);

    // Create geometry for all triangles
    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    triangles.forEach(triangle => {
        // Add vertices for this triangle
        vertices.push(
            triangle.v0.x, triangle.v0.y, triangle.v0.z,
            triangle.v1.x, triangle.v1.y, triangle.v1.z,
            triangle.v2.x, triangle.v2.y, triangle.v2.z
        );
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    // Create translucent material for faces
    const material = new THREE.MeshStandardMaterial({
        color: 0xff69b4,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });

    roomMesh = new THREE.Mesh(geometry, material);
    scene.add(roomMesh);

    // Create edges
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2
    });
    roomEdges = new THREE.LineSegments(edges, edgeMaterial);
    scene.add(roomEdges);

    // Center camera on the geometry
    const box = new THREE.Box3().setFromObject(roomMesh);
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    controls.update();

    console.log('Triangles rendered successfully');
}

// Visualize points as small spheres with color mapped to total_intensity
function visualizePoints() {
    if (!points || points.length === 0) {
        console.warn("No points found in simulation results to display.");
        return;
    }

    // Determine min and max total_intensity for color scaling
    let minIntensity = Infinity, maxIntensity = -Infinity;
    points.forEach(point => {
        if (point.intensity && typeof point.intensity.total_intensity === 'number') {
            const value = point.intensity.total_intensity;
            if (value < minIntensity) minIntensity = value;
            if (value > maxIntensity) maxIntensity = value;
        }
    });
    // If all intensity is equal or undefined, fall back to green
    if (!isFinite(minIntensity) || !isFinite(maxIntensity) || minIntensity === maxIntensity) {
        minIntensity = 0;
        maxIntensity = 1;
    }

    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);

    let plotted = 0;
    points.forEach((point) => {
        if (
            point &&
            point.position &&
            typeof point.position.x === 'number' &&
            typeof point.position.y === 'number' &&
            typeof point.position.z === 'number'
        ) {
            // Get color based on total_intensity
            let color;
            if (point.intensity && typeof point.intensity.total_intensity === 'number') {
                color = getColorForIntensity(point.intensity.total_intensity, minIntensity, maxIntensity);
            } else {
                color = new THREE.Color(0x00ff8a); // fallback
            }
            const sphereMaterial = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color.clone().multiplyScalar(0.1),
                roughness: 0.3,
                metalness: 0.2
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(
                point.position.x,
                point.position.y,
                point.position.z
            );
            scene.add(sphere);
            plotted++;
        }
    });

    console.log(`Plotted ${plotted} points as spheres (coloured by total_intensity)`);
}

// Visualize light sources
function visualizeLights() {
    if (!lights || lights.length === 0) {
        console.warn("No lights found in simulation results to display.");
        return;
    }

    // Geometry and material for the lights (larger yellow spheres by default)
    const lightGeometry = new THREE.SphereGeometry(0.4, 32, 32);

    let plotted = 0;
    lights.forEach((light, idx) => {
        if (
            light &&
            light.position &&
            typeof light.position.x === 'number' &&
            typeof light.position.y === 'number' &&
            typeof light.position.z === 'number'
        ) {
            const color = new THREE.Color(0xFFFF00); // bright yellow
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color.clone().multiplyScalar(0.7),
                roughness: 0.1,
                metalness: 0.5
            });

            const sphere = new THREE.Mesh(lightGeometry, lightMaterial);
            sphere.position.set(
                light.position.x,
                light.position.y,
                light.position.z
            );
            // Optionally, add a subtle glow effect by adding a point light at the same spot
            // Note: Reduce intensity if too harsh visually
            const lightObj = new THREE.PointLight(0xFFFF00, 0.5, 10);
            lightObj.position.copy(sphere.position);
            scene.add(lightObj);

            scene.add(sphere);
            plotted++;
        }
    });

    console.log(`Plotted ${plotted} lights as yellow spheres`);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Calculate keyboard-based movement
function updateCameraMovement() {
    const keys = movementConfig.keys;
    const speed = movementConfig.speed;

    // Get camera direction (where the camera is looking)
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    // Get camera right vector (perpendicular to camera direction)
    const rightDir = new THREE.Vector3();
    camera.getWorldDirection(rightDir);
    rightDir.cross(camera.up).normalize();

    // Create forward and right vectors in the X-Z plane (horizontal movement)
    const forwardDir = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
    const strafeDir = new THREE.Vector3(rightDir.x, 0, rightDir.z).normalize();

    // Handle WASD movement - move both camera AND target together
    if (keys['w'] || keys['arrowup']) {
        const offset = forwardDir.multiplyScalar(speed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['s'] || keys['arrowdown']) {
        const offset = forwardDir.multiplyScalar(-speed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['a'] || keys['arrowleft']) {
        const offset = strafeDir.multiplyScalar(-speed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['d'] || keys['arrowright']) {
        const offset = strafeDir.multiplyScalar(speed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updateCameraMovement();
    controls.update();
    renderer.render(scene, camera);
}

animate();

// UI state management
const lightsArray = [];
const lightMeshes = [];
const pointMeshes = [];

// UI elements
const settingsSelect = document.getElementById('settings-select');
const lampType = document.getElementById('lamp-type');
const lightX = document.getElementById('light-x');
const lightY = document.getElementById('light-y');
const lightZ = document.getElementById('light-z');
const addLightBtn = document.getElementById('add-light-btn');
const runSimulationBtn = document.getElementById('run-simulation-btn');
const clearLightsBtn = document.getElementById('clear-lights-btn');
const lightsList = document.getElementById('lights-list');
const lightCount = document.getElementById('light-count');
const resultDiv = document.getElementById('result');
const metricSelect = document.getElementById('metric-select');
const pathogenSelect = document.getElementById('pathogen-select');
const pathogenMessage = document.getElementById('pathogen-message');
const colorLegend = document.getElementById('color-legend');
const numPointsInput = document.getElementById('num-points');
const numPointsRandomInput = document.getElementById('num-points-random');
const maxBouncesSelect = document.getElementById('max-bounces');
const sphereScaleSlider = document.getElementById('sphere-scale');
const sphereScaleLabel = document.getElementById('sphere-scale-label');
const samplingModeSelect = document.getElementById('sampling-mode');
const randomModeControls = document.getElementById('random-mode-controls');
const crossSectionModeControls = document.getElementById('cross-section-mode-controls');
const prunedModeControls = document.getElementById('pruned-mode-controls');
const crossSectionXInput = document.getElementById('cross-section-x');
const gridSizeInput = document.getElementById('grid-size');

// Update lights display
function updateLightsDisplay() {
    lightCount.textContent = lightsArray.length;

    if (lightsArray.length === 0) {
        lightsList.innerHTML = '<div style="color: #999;">No lights added yet</div>';
    } else {
        lightsList.innerHTML = lightsArray.map((light, index) => `
            <div style="padding: 5px; margin: 3px 0; background: rgba(255,255,255,0.1); border-radius: 3px;">
                Light ${index + 1} (${light.lamp_type}): (${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)}) - ${light.intensity}W
                <button onclick="removeLight(${index})" style="float: right; padding: 2px 6px; font-size: 11px;">Remove</button>
            </div>
        `).join('');
    }
}

// Add light to the scene
addLightBtn.addEventListener('click', () => {
    const x = parseFloat(lightX.value);
    const y = parseFloat(lightY.value);
    const z = parseFloat(lightZ.value);
    const lamp = lampType.value;

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
        resultDiv.textContent = 'Please enter valid numbers for all position fields';
        resultDiv.style.color = '#ff4444';
        return;
    }

    // Add to lights array with lamp type and direction (pointing downward)
    // Intensity is determined by lamp type, not user input
    const newLight = {
        position: { x, y, z },
        lamp_type: lamp,
        direction: { x: 0, y: -1, z: 0 }  // Pointing downward
    };
    lightsArray.push(newLight);

    // Visualize the light
    const lightGeometry = new THREE.SphereGeometry(0.4, 32, 32);
    const color = new THREE.Color(0xFFFF00);
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color.clone().multiplyScalar(0.7),
        roughness: 0.1,
        metalness: 0.5
    });

    const sphere = new THREE.Mesh(lightGeometry, lightMaterial);
    sphere.position.set(x, y, z);
    scene.add(sphere);
    lightMeshes.push(sphere);

    // Add point light for visual effect
    const lightObj = new THREE.PointLight(0xFFFF00, 0.5, 10);
    lightObj.position.copy(sphere.position);
    scene.add(lightObj);
    lightMeshes.push(lightObj);

    updateLightsDisplay();
    resultDiv.textContent = `${lamp} light added at (${x}, ${y}, ${z})`;
    resultDiv.style.color = '#4CAF50';
});

// Remove light
window.removeLight = (index) => {
    lightsArray.splice(index, 1);

    // Remove visual representation (sphere and point light)
    const meshIndex = index * 2;
    if (lightMeshes[meshIndex]) scene.remove(lightMeshes[meshIndex]);
    if (lightMeshes[meshIndex + 1]) scene.remove(lightMeshes[meshIndex + 1]);
    lightMeshes.splice(meshIndex, 2);

    updateLightsDisplay();
    resultDiv.textContent = 'Light removed';
    resultDiv.style.color = '#ff9800';
};

// Update pathogen dropdown
function updatePathogenDropdown() {
    if (pathogens.length === 0) {
        metricSelect.style.display = 'none';
        pathogenSelect.style.display = 'none';
        pathogenMessage.textContent = 'Run a simulation to see available pathogens';
        pathogenMessage.style.color = '#999';
    } else {
        metricSelect.style.display = 'block';
        pathogenSelect.style.display = 'block';
        pathogenSelect.innerHTML = '<option value="">-- Select a pathogen --</option>';
        pathogens.forEach(pathogen => {
            const option = document.createElement('option');
            option.value = pathogen.name;
            option.textContent = pathogen.name;
            pathogenSelect.appendChild(option);
        });
        pathogenMessage.textContent = `${pathogens.length} pathogen(s) available`;
        pathogenMessage.style.color = '#4CAF50';
    }
}

// Update color legend based on selected metric and data range
function updateColorLegend(metric, minValue, maxValue) {
    let html = '<div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">';

    let title = '';
    let isLogScale = false;
    let colorStops = [];

    if (metric === 'uv_dose') {
        title = 'UV Light Dose';
        isLogScale = true;
        // Log scale: black to pink
        colorStops = [
            { pos: 0, color: 'rgb(0, 0, 0)', label: 'Low' },
            { pos: 0.5, color: 'rgb(128, 96, 128)', label: 'Mid' },
            { pos: 1, color: 'rgb(255, 191, 255)', label: 'High' }
        ];
    } else if (metric === 'survival_rate') {
        title = 'Survival Rate';
        isLogScale = false;
        // Linear scale: black to red
        colorStops = [
            { pos: 0, color: 'rgb(0, 0, 0)', label: 'Low' },
            { pos: 0.5, color: 'rgb(128, 0, 0)', label: 'Mid' },
            { pos: 1, color: 'rgb(255, 0, 0)', label: 'High' }
        ];
    } else if (metric === 'ech_uv') {
        title = 'eACH-UV';
        isLogScale = false;
        // Linear scale: brown to blue
        colorStops = [
            { pos: 0, color: 'rgb(153, 76, 0)', label: 'Low' },
            { pos: 0.5, color: 'rgb(76, 115, 128)', label: 'Mid' },
            { pos: 1, color: 'rgb(0, 179, 255)', label: 'High' }
        ];
    }

    html += title;
    if (isLogScale) html += ' (log scale)';
    html += '</div>';

    // Create color bar
    html += '<div style="height: 200px; background: linear-gradient(to top, ';

    // Create gradient stops
    const gradientStops = [];
    for (let i = 0; i <= 100; i += 10) {
        const percent = i / 100;
        let color;

        if (metric === 'uv_dose') {
            // Log scale
            const logMin = Math.log(minValue + 1);
            const logMax = Math.log(maxValue + 1);
            const logValue = logMin + percent * (logMax - logMin);
            const value = Math.exp(logValue) - 1;
            color = getColorForIntensity(value, minValue, maxValue);
        } else if (metric === 'survival_rate') {
            const value = minValue + percent * (maxValue - minValue);
            color = getColorForSurvivalRate(value, minValue, maxValue);
        } else if (metric === 'ech_uv') {
            const value = minValue + percent * (maxValue - minValue);
            color = getColorForEchUV(value, minValue, maxValue);
        }

        const hex = '#' + color.getHexString();
        gradientStops.push(`${hex} ${i}%`);
    }
    html += gradientStops.join(', ');
    html += '); border: 1px solid #666; margin-bottom: 8px;"></div>';

    // Value range display
    html += '<div style="font-size: 11px; color: #ccc;">';
    html += '<div style="text-align: right; margin-bottom: 2px;">' + (isLogScale ? 'log(' + maxValue.toFixed(2) + ')' : maxValue.toFixed(3)) + '</div>';
    html += '<div style="text-align: right;">' + (isLogScale ? 'log(' + minValue.toFixed(2) + ')' : minValue.toFixed(3)) + '</div>';
    html += '</div>';

    colorLegend.innerHTML = html;
}

// Visualize points by metric (UV dose, survival rate, or eACH-UV)
function visualizePointsByPathogen(pathogenName, metric) {
    // Remove previous point meshes
    pointMeshes.forEach(mesh => scene.remove(mesh));
    pointMeshes.length = 0;

    // Handle UV dose metric (doesn't require pathogen selection)
    if (metric === 'uv_dose') {
        // Determine min and max intensity for UV dose
        let minValue = Infinity, maxValue = -Infinity;
        points.forEach(point => {
            if (point.intensity && typeof point.intensity.total_intensity === 'number') {
                const value = point.intensity.total_intensity;
                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
            }
        });

        if (!isFinite(minValue) || !isFinite(maxValue) || minValue === maxValue) {
            minValue = 0;
            maxValue = 1;
        }

        const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        let plotted = 0;

        points.forEach((point) => {
            if (
                point &&
                point.position &&
                typeof point.position.x === 'number' &&
                typeof point.position.y === 'number' &&
                typeof point.position.z === 'number'
            ) {
                let color;
                if (point.intensity && typeof point.intensity.total_intensity === 'number') {
                    color = getColorForIntensity(point.intensity.total_intensity, minValue, maxValue);
                } else {
                    color = new THREE.Color(0x000000);
                }

                const sphereMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color.clone().multiplyScalar(0.1),
                    roughness: 0.3,
                    metalness: 0.2
                });

                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                sphere.position.set(
                    point.position.x,
                    point.position.y,
                    point.position.z
                );
                sphere.scale.set(sphereScale, sphereScale, sphereScale);
                scene.add(sphere);
                pointMeshes.push(sphere);
                plotted++;
            }
        });

        console.log(`Plotted ${plotted} points colored by UV dose (fluence)`);
        updateColorLegend('uv_dose', minValue, maxValue);
        return;
    }

    // For pathogen-based metrics, require pathogen selection
    if (!pathogenName || pathogenName === '') {
        return;
    }

    // Find the pathogen data
    const pathogenData = points[0]?.pathogen_survival.find(p => p.pathogen_name === pathogenName);
    if (!pathogenData) {
        console.warn(`Pathogen ${pathogenName} not found in results`);
        return;
    }

    // Determine min and max values for color scaling based on selected metric
    let minValue = Infinity, maxValue = -Infinity;
    const metricKey = metric === 'survival_rate' ? 'survival_rate' : 'ech_uv';

    points.forEach(point => {
        const survivalData = point.pathogen_survival.find(p => p.pathogen_name === pathogenName);
        if (survivalData && typeof survivalData[metricKey] === 'number') {
            const value = survivalData[metricKey];
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
        }
    });

    // Fallback if all values are the same
    if (!isFinite(minValue) || !isFinite(maxValue) || minValue === maxValue) {
        minValue = 0;
        maxValue = 1;
    }

    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    let plotted = 0;

    points.forEach((point) => {
        if (
            point &&
            point.position &&
            typeof point.position.x === 'number' &&
            typeof point.position.y === 'number' &&
            typeof point.position.z === 'number'
        ) {
            const survivalData = point.pathogen_survival.find(p => p.pathogen_name === pathogenName);
            if (survivalData) {
                let color;
                if (metric === 'survival_rate') {
                    color = getColorForSurvivalRate(survivalData.survival_rate, minValue, maxValue);
                } else {
                    color = getColorForEchUV(survivalData.ech_uv, minValue, maxValue);
                }

                const sphereMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color.clone().multiplyScalar(0.1),
                    roughness: 0.3,
                    metalness: 0.2
                });

                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                sphere.position.set(
                    point.position.x,
                    point.position.y,
                    point.position.z
                );
                sphere.scale.set(sphereScale, sphereScale, sphereScale);
                scene.add(sphere);
                pointMeshes.push(sphere);
                plotted++;
            }
        }
    });

    console.log(`Plotted ${plotted} points colored by ${pathogenName} ${metric}`);
    updateColorLegend(metric, minValue, maxValue);
}

// Clear all lights
clearLightsBtn.addEventListener('click', () => {
    lightsArray.length = 0;

    // Remove all light meshes
    lightMeshes.forEach(mesh => scene.remove(mesh));
    lightMeshes.length = 0;

    // Remove all point meshes from previous simulation
    pointMeshes.forEach(mesh => scene.remove(mesh));
    pointMeshes.length = 0;

    updateLightsDisplay();
    resultDiv.textContent = 'All lights cleared';
    resultDiv.style.color = '#ff9800';
});

// Handle metric selection
metricSelect.addEventListener('change', (event) => {
    selectedMetric = event.target.value;
    visualizePointsByPathogen(selectedPathogen, selectedMetric);
});

// Handle pathogen selection
pathogenSelect.addEventListener('change', (event) => {
    selectedPathogen = event.target.value;
    visualizePointsByPathogen(selectedPathogen, selectedMetric);
});

// Handle solid color toggle
const solidColorToggle = document.getElementById('solid-color-toggle');
solidColorToggle.addEventListener('change', (event) => {
    const isSolid = event.target.checked;
    if (roomMesh) {
        if (isSolid) {
            // Solid: 100% opacity, hide edges
            roomMesh.material.transparent = false;
            roomMesh.material.opacity = 1.0;
            if (roomEdges) roomEdges.visible = false;
        } else {
            // Translucent: 30% opacity, show edges
            roomMesh.material.transparent = true;
            roomMesh.material.opacity = 0.3;
            if (roomEdges) roomEdges.visible = true;
        }
        roomMesh.material.needsUpdate = true;
    }
});

// Handle sphere scale slider
sphereScaleSlider.addEventListener('input', (event) => {
    sphereScale = parseFloat(event.target.value);
    sphereScaleLabel.textContent = sphereScale.toFixed(1) + 'x';
    rescaleAllSpheres(sphereScale);
});

// Handle sampling mode changes
samplingModeSelect.addEventListener('change', (event) => {
    const mode = event.target.value;

    // Hide all control panels
    randomModeControls.style.display = 'none';
    crossSectionModeControls.style.display = 'none';
    prunedModeControls.style.display = 'none';

    // Show the appropriate control panel
    if (mode === 'random') {
        randomModeControls.style.display = 'block';
    } else if (mode === 'cross_section') {
        crossSectionModeControls.style.display = 'block';
    } else {
        prunedModeControls.style.display = 'block';
    }

    resultDiv.textContent = `Sampling mode changed to: ${mode}`;
    resultDiv.style.color = '#2196F3';
});

// Run simulation
runSimulationBtn.addEventListener('click', async () => {
    if (lightsArray.length === 0) {
        resultDiv.textContent = 'Please add at least one light before running simulation';
        resultDiv.style.color = '#ff4444';
        return;
    }

    try {
        resultDiv.textContent = 'Running simulation...';
        resultDiv.style.color = '#2196F3';

        // Build simulation request based on sampling mode
        const samplingMode = samplingModeSelect.value;
        const simRequest = {
            lights: lightsArray,
            settings_file: settingsSelect.value,
            max_bounces: parseInt(maxBouncesSelect.value),
            sampling_mode: samplingMode
        };

        // Add mode-specific parameters
        if (samplingMode === 'random') {
            simRequest.num_points = parseInt(numPointsRandomInput.value);
        } else if (samplingMode === 'cross_section') {
            simRequest.cross_section_x = parseFloat(crossSectionXInput.value);
            simRequest.grid_size = parseInt(gridSizeInput.value);
        } else {
            // pruned mode
            simRequest.num_points = parseInt(numPointsInput.value);
        }

        const response = await fetch(`${config.backendUrl}/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(simRequest)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();

        // Clear previous simulation results
        pointMeshes.forEach(mesh => scene.remove(mesh));
        pointMeshes.length = 0;

        // Visualize new results
        if (data.points && data.points.length > 0) {
            points = data.points;

            // Extract unique pathogens from results
            if (points.length > 0 && points[0].pathogen_survival) {
                pathogens = points[0].pathogen_survival.map(p => ({
                    name: p.pathogen_name
                }));
                updatePathogenDropdown();
                // Set default to first pathogen and default metric to uv_dose
                if (pathogens.length > 0) {
                    selectedPathogen = pathogens[0].name;
                    pathogenSelect.value = selectedPathogen;
                    selectedMetric = 'uv_dose';
                    metricSelect.value = 'uv_dose';
                }
            }

            // Determine min and max intensity for color scaling
            let minIntensity = Infinity, maxIntensity = -Infinity;
            points.forEach(point => {
                if (point.intensity && typeof point.intensity.total_intensity === 'number') {
                    const value = point.intensity.total_intensity;
                    if (value < minIntensity) minIntensity = value;
                    if (value > maxIntensity) maxIntensity = value;
                }
            });

            if (!isFinite(minIntensity) || !isFinite(maxIntensity) || minIntensity === maxIntensity) {
                minIntensity = 0;
                maxIntensity = 1;
            }

            const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);

            points.forEach((point) => {
                if (
                    point &&
                    point.position &&
                    typeof point.position.x === 'number' &&
                    typeof point.position.y === 'number' &&
                    typeof point.position.z === 'number'
                ) {
                    let color;
                    if (point.intensity && typeof point.intensity.total_intensity === 'number') {
                        color = getColorForIntensity(point.intensity.total_intensity, minIntensity, maxIntensity);
                    } else {
                        color = new THREE.Color(0x00ff8a);
                    }
                    const sphereMaterial = new THREE.MeshStandardMaterial({
                        color: color,
                        emissive: color.clone().multiplyScalar(0.1),
                        roughness: 0.3,
                        metalness: 0.2
                    });
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.set(
                        point.position.x,
                        point.position.y,
                        point.position.z
                    );
                    sphere.scale.set(sphereScale, sphereScale, sphereScale);
                    scene.add(sphere);
                    pointMeshes.push(sphere);
                }
            });

            // Update color legend for UV dose
            updateColorLegend('uv_dose', minIntensity, maxIntensity);

            resultDiv.textContent = `Simulation complete! Plotted ${pointMeshes.length} UV dose points`;
            resultDiv.style.color = '#4CAF50';
        } else {
            resultDiv.textContent = 'Simulation complete but no results returned';
            resultDiv.style.color = '#ff9800';
        }
    } catch (error) {
        console.error('Error:', error);
        resultDiv.textContent = 'Error running simulation. Is the backend running?';
        resultDiv.style.color = '#ff4444';
    }
});

// Handle settings change
settingsSelect.addEventListener('change', async () => {
    const settingsFile = settingsSelect.value;
    resultDiv.textContent = 'Loading settings...';
    resultDiv.style.color = '#2196F3';

    // Clear all lights when changing room configuration
    lightsArray.length = 0;
    lightMeshes.forEach(mesh => scene.remove(mesh));
    lightMeshes.length = 0;

    // Clear all point meshes from previous simulation
    pointMeshes.forEach(mesh => scene.remove(mesh));
    pointMeshes.length = 0;

    // Update lights display
    updateLightsDisplay();

    const success = await loadRoomSettings(settingsFile);
    if (success) {
        resultDiv.textContent = `Settings loaded: ${settingsFile} - All lights cleared`;
        resultDiv.style.color = '#4CAF50';
    } else {
        resultDiv.textContent = `Error loading settings: ${settingsFile}`;
        resultDiv.style.color = '#ff4444';
    }
});

// Load available settings files
async function loadAvailableSettings() {
    try {
        const response = await fetch(`${config.backendUrl}/settings`);
        const data = await response.json();

        if (data.settings && data.settings.length > 0) {
            settingsSelect.innerHTML = data.settings
                .map(file => `<option value="${file}">${file.replace('.json', '')}</option>`)
                .join('');
        }
    } catch (error) {
        console.log('Could not load settings list, using default:', error);
    }
}

// Initialize
(async () => {
    await loadAvailableSettings();
    await loadRoomSettings(settingsSelect.value);
    updateLightsDisplay();
})();
