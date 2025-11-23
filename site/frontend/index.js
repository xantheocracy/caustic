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

// Initialize room data
let triangleData = [];
let roomMesh = null;
let roomEdges = null;
let roomBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

// Initialize lights array and simulation results
let lights = [];
let points = [];

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
}

// Load room triangles from settings file
async function loadRoomSettings(settingsFile) {
    try {
        const roomResponse = await fetch(`/static/settings/${settingsFile}`);
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

// Color map utility for total_intensity (green for low, yellow for mid, red for high)
function getColorForIntensity(intensity, minI, maxI) {
    // Clamp between minI and maxI
    if (intensity < minI) intensity = minI;
    if (intensity > maxI) intensity = maxI;

    // Normalize 0 ... 1
    let norm = (intensity - minI) / (maxI - minI);

    // Interpolate green (0,1,0)->yellow(1,1,0)->red(1,0,0)
    let r = 0, g = 0, b = 0;
    if (norm <= 0.5) {
        // green to yellow (0,1,0) to (1,1,0)
        r = norm * 2;
        g = 1.0;
        b = 0.0;
    } else {
        // yellow to red (1,1,0) to (1,0,0)
        r = 1.0;
        g = 1.0 - (norm - 0.5) * 2;
        b = 0.0;
    }
    return new THREE.Color(r, g, b);
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
        color: 0xff69b4,
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
    points.forEach((point, idx) => {
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

// Animation loop
function animate() {
    requestAnimationFrame(animate);
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
const lightX = document.getElementById('light-x');
const lightY = document.getElementById('light-y');
const lightZ = document.getElementById('light-z');
const lightIntensity = document.getElementById('light-intensity');
const addLightBtn = document.getElementById('add-light-btn');
const runSimulationBtn = document.getElementById('run-simulation-btn');
const clearLightsBtn = document.getElementById('clear-lights-btn');
const lightsList = document.getElementById('lights-list');
const lightCount = document.getElementById('light-count');
const resultDiv = document.getElementById('result');

// Update lights display
function updateLightsDisplay() {
    lightCount.textContent = lightsArray.length;

    if (lightsArray.length === 0) {
        lightsList.innerHTML = '<div style="color: #999;">No lights added yet</div>';
    } else {
        lightsList.innerHTML = lightsArray.map((light, index) => `
            <div style="padding: 5px; margin: 3px 0; background: rgba(255,255,255,0.1); border-radius: 3px;">
                Light ${index + 1}: (${light.position.x}, ${light.position.y}, ${light.position.z}) - ${light.intensity}W
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
    const intensity = parseFloat(lightIntensity.value);

    if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(intensity)) {
        resultDiv.textContent = 'Please enter valid numbers for all fields';
        resultDiv.style.color = '#ff4444';
        return;
    }

    // Add to lights array
    const newLight = {
        position: { x, y, z },
        intensity
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
    resultDiv.textContent = `Light added at (${x}, ${y}, ${z}) with ${intensity}W`;
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

        const response = await fetch(`${config.backendUrl}/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lights: lightsArray,
                settings_file: settingsSelect.value
            })
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
                    scene.add(sphere);
                    pointMeshes.push(sphere);
                }
            });

            resultDiv.textContent = `Simulation complete! Plotted ${pointMeshes.length} intensity points`;
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

    const success = await loadRoomSettings(settingsFile);
    if (success) {
        resultDiv.textContent = `Settings loaded: ${settingsFile}`;
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
