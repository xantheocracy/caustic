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
renderer.sortObjects = true;  // Enable renderOrder sorting
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

// Raycasting for light selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDownTime = 0;
const clickDurationThreshold = 200; // milliseconds - max duration to consider as a quick click

// Track mouse down time and gizmo interactions
window.addEventListener('mousedown', (event) => {
    mouseDownTime = Date.now();

    // Check if clicking on gizmo
    if (selectedLightIndex !== null && gizmoObjects.length > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
        mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(gizmoObjects, true);

        if (intersects.length > 0) {
            // Find which axis was clicked
            const clickedObject = intersects[0].object;
            let parent = clickedObject;
            while (parent && !parent.userData.axis) {
                parent = parent.parent;
            }

            if (parent && parent.userData.axis) {
                activeAxis = parent.userData.axis;
                const lightSphere = lightMeshes[selectedLightIndex * 2];
                gizmoStartPos = lightSphere.position.clone();
                gizmoStartMousePos = { x: event.clientX, y: event.clientY };
                // Disable OrbitControls temporarily
                controls.enabled = false;
            }
        }
    }
});

// Handle gizmo dragging
window.addEventListener('mousemove', (event) => {
    if (activeAxis && selectedLightIndex !== null) {
        const lightSphere = lightMeshes[selectedLightIndex * 2];
        const lightIndex = selectedLightIndex;

        // Calculate movement from the original mouse position, not accumulated
        const deltaX = event.clientX - gizmoStartMousePos.x;
        const deltaY = event.clientY - gizmoStartMousePos.y;

        // Get camera right and up vectors for screen-aligned movement
        const cameraRight = new THREE.Vector3();
        const cameraUp = new THREE.Vector3();
        camera.matrix.extractBasis(cameraRight, cameraUp, new THREE.Vector3());

        // Scale movement based on camera distance (zoom level)
        // Use a fixed pixel-to-world ratio that's zoom-aware
        const distance = camera.position.distanceTo(gizmoStartPos);
        const moveScale = distance * 0.0013; // Constant ratio

        // Convert screen space movement to world space vectors
        const screenMovement = cameraRight.clone().multiplyScalar(deltaX * moveScale)
            .add(cameraUp.clone().multiplyScalar(-deltaY * moveScale));

        // Project screen movement onto the selected axis to determine movement amount
        let worldDelta = new THREE.Vector3();

        if (activeAxis === 'x') {
            // Project movement onto X-axis
            const xAxis = new THREE.Vector3(1, 0, 0);
            const projection = screenMovement.dot(xAxis);
            worldDelta = xAxis.clone().multiplyScalar(projection);
        } else if (activeAxis === 'y') {
            // Project movement onto Y-axis
            const yAxis = new THREE.Vector3(0, 1, 0);
            const projection = screenMovement.dot(yAxis);
            worldDelta = yAxis.clone().multiplyScalar(projection);
        } else if (activeAxis === 'z') {
            // Project movement onto Z-axis
            const zAxis = new THREE.Vector3(0, 0, 1);
            const projection = screenMovement.dot(zAxis);
            worldDelta = zAxis.clone().multiplyScalar(projection);
        }

        // Update light position from the original starting position
        const newPos = gizmoStartPos.clone().add(worldDelta);
        lightSphere.position.copy(newPos);
        lightsArray[lightIndex].position = {
            x: newPos.x,
            y: newPos.y,
            z: newPos.z
        };

        // Update all gizmo positions
        gizmoObjects.forEach(gizmo => {
            gizmo.position.copy(newPos);
        });

        // Update point light position
        const pointLight = lightMeshes[lightIndex * 2 + 1];
        if (pointLight && pointLight instanceof THREE.Light) {
            pointLight.position.copy(newPos);
        }

        // Update outline position
        if (lightOutlineMeshes[lightIndex]) {
            lightOutlineMeshes[lightIndex].position.copy(newPos);
        }

        // Update the lights list display
        updateLightsDisplay();
    }
});

// Stop gizmo dragging on mouse up
window.addEventListener('mouseup', () => {
    activeAxis = null;
    // Re-enable OrbitControls
    controls.enabled = true;
});

// Handle mouse click for light selection (only on quick clicks, not click-and-hold)
window.addEventListener('click', (event) => {
    // Ignore clicks on UI elements
    if (event.target.closest('#controls') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select')) {
        return;
    }

    // Ignore if we were dragging a gizmo
    if (activeAxis !== null) {
        return;
    }

    // Check if this was a quick click (not a hold)
    const clickDuration = Date.now() - mouseDownTime;

    if (clickDuration > clickDurationThreshold) {
        // This was a hold, not a quick click - ignore it
        return;
    }

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Find all light meshes (every other mesh in lightMeshes array, since we store sphere + point light)
    const lightSpheres = [];
    for (let i = 0; i < lightMeshes.length; i += 2) {
        if (lightMeshes[i] instanceof THREE.Mesh) {
            lightSpheres.push(lightMeshes[i]);
        }
    }

    // Check for intersections
    const intersects = raycaster.intersectObjects(lightSpheres);

    if (intersects.length > 0) {
        // Find which light this sphere belongs to
        const intersectedSphere = intersects[0].object;
        const lightIndex = lightSpheres.indexOf(intersectedSphere);

        // Find the closest light to camera in case of overlaps
        let closestLight = lightIndex;
        let closestDistance = intersects[0].distance;

        for (let i = 1; i < intersects.length; i++) {
            if (intersects[i].distance < closestDistance) {
                closestDistance = intersects[i].distance;
                closestLight = lightSpheres.indexOf(intersects[i].object);
            }
        }

        selectLight(closestLight);
    } else {
        // Clicked on empty space - deselect (only if it was a quick click, not a drag)
        deselectLight();
    }
});

// Select a light by index
function selectLight(index) {
    // If already selected, do nothing
    if (selectedLightIndex === index) {
        return;
    }

    // Deselect previous light if any
    if (selectedLightIndex !== null) {
        deselectLight();
    }

    selectedLightIndex = index;

    // Add white outline to selected light
    const lightSphere = lightMeshes[index * 2];
    if (lightSphere && lightSphere instanceof THREE.Mesh) {
        // Store original material
        originalLightMaterials[index] = lightSphere.material;

        // Make the light sphere brighter when selected
        const brightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,  // White
            emissive: 0xFFFFFF,
            emissiveIntensity: 1.0,
            roughness: 0.1,
            metalness: 0.5
        });
        lightSphere.material = brightMaterial;

        // Create outline as a wireframe sphere for better visibility
        const outlineGeometry = new THREE.SphereGeometry(0.75, 32, 32);
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            linewidth: 4,
            transparent: true,
            opacity: 1.0,
            fog: false,
            depthTest: false,
            depthWrite: false
        });
        const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outlineMesh.position.copy(lightSphere.position);
        // Render in front of facets but allow depth-based ordering with arrows
        outlineMesh.renderOrder = 1000;
        scene.add(outlineMesh);
        lightOutlineMeshes[index] = outlineMesh;

        console.log(`Selected light ${index}`);
    }

    // Update info box
    updateLightInfoBox(lightsArray[index]);

    // Create gizmo for light manipulation
    createGizmo(index);
}

// Create axis gizmo for selected light
function createGizmo(lightIndex) {
    // Remove old gizmo if it exists
    if (gizmoObjects.length > 0) {
        gizmoObjects.forEach(obj => scene.remove(obj));
        gizmoObjects.length = 0;
    }

    const lightSphere = lightMeshes[lightIndex * 2];
    if (!lightSphere) return;

    const lightPos = lightSphere.position;

    // Fixed arrow dimensions (scaling is handled in animation loop)
    const arrowLength = 1.5;
    const arrowOffset = 0.5;

    // X-axis arrow (red)
    const xArrow = createArrow(new THREE.Vector3(1, 0, 0), 0xff0000, arrowLength, arrowOffset);
    xArrow.position.copy(lightPos);
    xArrow.userData.axis = 'x';
    scene.add(xArrow);
    gizmoObjects.push(xArrow);

    // Y-axis arrow (green)
    const yArrow = createArrow(new THREE.Vector3(0, 1, 0), 0x00ff00, arrowLength, arrowOffset);
    yArrow.position.copy(lightPos);
    yArrow.userData.axis = 'y';
    scene.add(yArrow);
    gizmoObjects.push(yArrow);

    // Z-axis arrow (blue)
    const zArrow = createArrow(new THREE.Vector3(0, 0, 1), 0x0000ff, arrowLength, arrowOffset);
    zArrow.position.copy(lightPos);
    zArrow.userData.axis = 'z';
    scene.add(zArrow);
    gizmoObjects.push(zArrow);
}

// Create an arrow mesh for a given direction and color
function createArrow(direction, color, length, offset) {
    const group = new THREE.Group();

    // Create arrow shaft (cylinder)
    // Cylinder is oriented along Y by default, so we need to rotate to match direction
    const shaftGeometry = new THREE.CylinderGeometry(0.1, 0.1, length, 8);
    const arrowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        fog: false
    });
    const shaft = new THREE.Mesh(shaftGeometry, arrowMaterial);
    shaft.renderOrder = 1001; // Render in front of outline and facets

    // Position shaft along the direction
    const shaftPos = direction.clone().multiplyScalar(offset + length / 2);
    shaft.position.copy(shaftPos);

    // Calculate rotation to point along direction
    // Cylinder points along Y by default, so we rotate from Y-axis to direction
    const yAxis = new THREE.Vector3(0, 1, 0);
    const rotAxis = new THREE.Vector3().crossVectors(yAxis, direction).normalize();
    const rotAngle = Math.acos(Math.max(-1, Math.min(1, yAxis.dot(direction))));

    if (rotAxis.length() > 0.001) {
        shaft.setRotationFromAxisAngle(rotAxis, rotAngle);
    }

    group.add(shaft);

    // Create arrow head (cone)
    const headGeometry = new THREE.ConeGeometry(0.25, 0.4, 8);
    const head = new THREE.Mesh(headGeometry, arrowMaterial);
    head.renderOrder = 1001; // Render in front of outline and facets
    const headPos = direction.clone().multiplyScalar(offset + length + 0.2);
    head.position.copy(headPos);

    if (rotAxis.length() > 0.001) {
        head.setRotationFromAxisAngle(rotAxis, rotAngle);
    }

    group.add(head);

    return group;
}

// Deselect the currently selected light
function deselectLight() {
    if (selectedLightIndex !== null) {
        // Restore original material
        const lightSphere = lightMeshes[selectedLightIndex * 2];
        if (lightSphere && originalLightMaterials[selectedLightIndex]) {
            lightSphere.material = originalLightMaterials[selectedLightIndex];
        }

        // Remove outline
        if (lightOutlineMeshes[selectedLightIndex]) {
            scene.remove(lightOutlineMeshes[selectedLightIndex]);
            lightOutlineMeshes[selectedLightIndex] = null;
        }
        selectedLightIndex = null;
    }

    // Remove gizmo
    gizmoObjects.forEach(obj => scene.remove(obj));
    gizmoObjects.length = 0;
    activeAxis = null;

    // Clear info box
    clearLightInfoBox();
}

// Update the light info box in bottom right
function updateLightInfoBox(light) {
    const infoBox = document.getElementById('light-info-box');
    if (infoBox) {
        infoBox.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #666; padding-bottom: 8px;">Light Information</div>
            <div style="font-size: 12px; line-height: 1.6;">
                <div><strong>Type:</strong> ${light.lamp_type}</div>
                <div><strong>Position:</strong></div>
                <div style="margin-left: 10px;">
                    X: ${light.position.x.toFixed(2)}<br>
                    Y: ${light.position.y.toFixed(2)}<br>
                    Z: ${light.position.z.toFixed(2)}
                </div>
                <div style="margin-top: 8px;"><strong>Direction:</strong></div>
                <div style="margin-left: 10px;">
                    X: ${light.direction.x.toFixed(2)}<br>
                    Y: ${light.direction.y.toFixed(2)}<br>
                    Z: ${light.direction.z.toFixed(2)}
                </div>
            </div>
        `;
        infoBox.style.display = 'block';
    }
}

// Clear the light info box
function clearLightInfoBox() {
    const infoBox = document.getElementById('light-info-box');
    if (infoBox) {
        infoBox.style.display = 'none';
        infoBox.innerHTML = '';
    }
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
    const baseSpeed = movementConfig.speed;

    // Scale speed based on distance from target (zoom level)
    const distanceToTarget = camera.position.distanceTo(controls.target);
    const scaledSpeed = baseSpeed * distanceToTarget * 0.1;

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
        const offset = forwardDir.multiplyScalar(scaledSpeed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['s'] || keys['arrowdown']) {
        const offset = forwardDir.multiplyScalar(-scaledSpeed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['a'] || keys['arrowleft']) {
        const offset = strafeDir.multiplyScalar(-scaledSpeed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
    if (keys['d'] || keys['arrowright']) {
        const offset = strafeDir.multiplyScalar(scaledSpeed);
        camera.position.add(offset);
        controls.target.add(offset);
    }
}

// UI state management (must be declared before animation loop)
const lightsArray = [];
const lightMeshes = [];
const pointMeshes = [];
let selectedLightIndex = null;
const lightOutlineMeshes = []; // Store outline meshes for selected lights
const originalLightMaterials = []; // Store original materials for light spheres
const gizmoObjects = []; // Store gizmo meshes for axis manipulation

// Gizmo state
let activeAxis = null; // 'x', 'y', 'z', or null
let gizmoStartPos = null;
let gizmoStartMousePos = null;

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updateCameraMovement();
    controls.update();

    // Update gizmo size based on current zoom level
    if (selectedLightIndex !== null && gizmoObjects.length > 0) {
        const lightSphere = lightMeshes[selectedLightIndex * 2];
        const cameraDistance = camera.position.distanceTo(lightSphere.position);
        let scale = cameraDistance * 0.05; // Smaller multiplier for reasonable arrow size

        // Enforce minimum scale so arrows stay visible and outside highlight sphere (radius 0.75)
        const minScale = 1.2; // Ensures arrows extend beyond the 0.75 radius highlight
        scale = Math.max(scale, minScale);

        // Update each gizmo's scale
        gizmoObjects.forEach(gizmo => {
            gizmo.scale.set(scale, scale, scale);
        });
    }

    renderer.render(scene, camera);
}

animate();

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

    // Store the original material for this light
    const lightIndex = lightsArray.length - 1;
    originalLightMaterials[lightIndex] = lightMaterial;

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

    // Remove outline if this light was selected
    if (lightOutlineMeshes[index]) {
        scene.remove(lightOutlineMeshes[index]);
        lightOutlineMeshes.splice(index, 1);
    }

    // Clear selection if this was the selected light
    if (selectedLightIndex === index) {
        selectedLightIndex = null;
        clearLightInfoBox();
    } else if (selectedLightIndex > index) {
        // Adjust selected light index if necessary
        selectedLightIndex--;
    }

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

    // Remove all outline meshes
    lightOutlineMeshes.forEach(mesh => {
        if (mesh) scene.remove(mesh);
    });
    lightOutlineMeshes.length = 0;

    // Remove all point meshes from previous simulation
    pointMeshes.forEach(mesh => scene.remove(mesh));
    pointMeshes.length = 0;

    selectedLightIndex = null;
    clearLightInfoBox();

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
