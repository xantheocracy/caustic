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

    // Toggle between translation and rotation modes with spacebar
    if (e.key === ' ' && selectedLightIndex !== null) {
        gizmoMode = gizmoMode === 'translate' ? 'rotate' : 'translate';

        if (gizmoMode === 'translate') {
            // Switch to translation mode - show translation arrows
            rotationGizmoObjects.forEach(obj => scene.remove(obj));
            rotationGizmoObjects.length = 0;
            createGizmo(selectedLightIndex);
        } else {
            // Switch to rotation mode - show rotation circles
            gizmoObjects.forEach(obj => scene.remove(obj));
            gizmoObjects.length = 0;
            createRotationGizmo(selectedLightIndex);
        }
    }
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
        side: THREE.DoubleSide,
        depthWrite: false  // Don't write to depth buffer so gizmos can render on top
    });

    roomMesh = new THREE.Mesh(geometry, material);
    roomMesh.renderOrder = 0; // Render before gizmos
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

// Helper function to calculate angle on a rotation circle
function calculateAngleOnCircle(point, center, axis) {
    // Get vector from center to point
    const vec = new THREE.Vector3().subVectors(point, center);

    // Project vector onto the plane perpendicular to the rotation axis
    let rotationAxis = new THREE.Vector3();
    if (typeof axis === 'string') {
        if (axis === 'x') rotationAxis.set(1, 0, 0);
        else if (axis === 'y') rotationAxis.set(0, 1, 0);
        else if (axis === 'z') rotationAxis.set(0, 0, 1);
    } else {
        rotationAxis.copy(axis);
    }

    // Remove component along rotation axis
    const projected = vec.clone().sub(rotationAxis.clone().multiplyScalar(vec.dot(rotationAxis)));

    // Choose reference vectors in the plane
    let refX, refY;
    if (Math.abs(rotationAxis.x) > 0.9) {
        // X-axis: use Y and Z
        refX = new THREE.Vector3(0, 1, 0);
        refY = new THREE.Vector3(0, 0, 1);
    } else if (Math.abs(rotationAxis.y) > 0.9) {
        // Y-axis: use X and Z
        refX = new THREE.Vector3(1, 0, 0);
        refY = new THREE.Vector3(0, 0, 1);
    } else {
        // Z-axis: use X and Y
        refX = new THREE.Vector3(1, 0, 0);
        refY = new THREE.Vector3(0, 1, 0);
    }

    // Calculate angle using atan2
    const x = projected.dot(refX);
    const y = projected.dot(refY);
    return Math.atan2(y, x);
}

// Track mouse down time and gizmo interactions
window.addEventListener('mousedown', (event) => {
    mouseDownTime = Date.now();

    // Check if clicking on gizmo (translation or rotation)
    if (selectedLightIndex !== null) {
        const gizmoList = gizmoMode === 'translate' ? gizmoObjects : rotationGizmoObjects;

        if (gizmoList.length > 0) {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
            mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(gizmoList, true);

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

                    // For rotation mode, store starting direction and calculate starting angle
                    if (gizmoMode === 'rotate') {
                        const light = lightsArray[selectedLightIndex];
                        rotationStartDirection = new THREE.Vector3(
                            light.direction.x,
                            light.direction.y,
                            light.direction.z
                        );

                        // Calculate initial angle on the circle
                        rotationStartAngle = calculateAngleOnCircle(
                            intersects[0].point,
                            lightSphere.position,
                            activeAxis
                        );
                    }

                    // Disable OrbitControls temporarily
                    controls.enabled = false;
                }
            }
        }
    }
});

// Handle gizmo dragging (translation and rotation)
window.addEventListener('mousemove', (event) => {
    if (activeAxis && selectedLightIndex !== null) {
        const lightIndex = selectedLightIndex;

        // Calculate movement from the original mouse position
        const deltaX = event.clientX - gizmoStartMousePos.x;
        const deltaY = event.clientY - gizmoStartMousePos.y;

        if (gizmoMode === 'translate') {
            // ===== TRANSLATION MODE =====
            const lightSphere = lightMeshes[lightIndex * 2];

            // Get camera right and up vectors for screen-aligned movement
            const cameraRight = new THREE.Vector3();
            const cameraUp = new THREE.Vector3();
            camera.matrix.extractBasis(cameraRight, cameraUp, new THREE.Vector3());

            // Scale movement based on camera distance (zoom level)
            const distance = camera.position.distanceTo(gizmoStartPos);
            const moveScale = distance * 0.0013;

            // Convert screen space movement to world space vectors
            const screenMovement = cameraRight.clone().multiplyScalar(deltaX * moveScale)
                .add(cameraUp.clone().multiplyScalar(-deltaY * moveScale));

            // Project screen movement onto the selected axis
            let worldDelta = new THREE.Vector3();

            if (typeof activeAxis === 'string') {
                if (activeAxis === 'x') {
                    const xAxis = new THREE.Vector3(1, 0, 0);
                    const projection = screenMovement.dot(xAxis);
                    worldDelta = xAxis.clone().multiplyScalar(projection);
                } else if (activeAxis === 'y') {
                    const yAxis = new THREE.Vector3(0, 1, 0);
                    const projection = screenMovement.dot(yAxis);
                    worldDelta = yAxis.clone().multiplyScalar(projection);
                } else if (activeAxis === 'z') {
                    const zAxis = new THREE.Vector3(0, 0, 1);
                    const projection = screenMovement.dot(zAxis);
                    worldDelta = zAxis.clone().multiplyScalar(projection);
                }
            }

            // Update light position
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
            rotationGizmoObjects.forEach(gizmo => {
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

            // Update light cone position
            const light = lightsArray[lightIndex];
            updateLightCone(lightIndex, newPos, light.direction);

            // Update info box
            updateLightInfoBox(light);

            updateLightsDisplay();
        } else {
            // ===== ROTATION MODE =====
            const light = lightsArray[lightIndex];
            const lightSphere = lightMeshes[lightIndex * 2];

            // Determine rotation axis
            let rotationAxis = new THREE.Vector3();
            if (typeof activeAxis === 'string') {
                if (activeAxis === 'x') rotationAxis.set(1, 0, 0);
                else if (activeAxis === 'y') rotationAxis.set(0, 1, 0);
                else if (activeAxis === 'z') rotationAxis.set(0, 0, 1);
            }

            // Project light position to screen space
            const lightScreenPos = lightSphere.position.clone().project(camera);

            // Convert mouse positions to normalized device coordinates (NDC)
            const rect = renderer.domElement.getBoundingClientRect();
            const startMouseNDC = new THREE.Vector2(
                (gizmoStartMousePos.x - rect.left) / rect.width * 2 - 1,
                -((gizmoStartMousePos.y - rect.top) / rect.height * 2 - 1)
            );
            const currentMouseNDC = new THREE.Vector2(
                (event.clientX - rect.left) / rect.width * 2 - 1,
                -((event.clientY - rect.top) / rect.height * 2 - 1)
            );

            // Calculate vectors from light center to mouse positions (in screen space)
            const startVector = new THREE.Vector2(
                startMouseNDC.x - lightScreenPos.x,
                startMouseNDC.y - lightScreenPos.y
            );
            const currentVector = new THREE.Vector2(
                currentMouseNDC.x - lightScreenPos.x,
                currentMouseNDC.y - lightScreenPos.y
            );

            // Calculate the angle between start and current positions
            // Using atan2 to get signed angle
            const startAngle = Math.atan2(startVector.y, startVector.x);
            const currentAngle = Math.atan2(currentVector.y, currentVector.x);
            let rotationAmount = -(currentAngle - startAngle);

            // Determine if the rotation axis points toward or away from camera
            const cameraDir = new THREE.Vector3();
            camera.getWorldDirection(cameraDir);
            const axisTowardCamera = rotationAxis.dot(cameraDir);

            // If axis points away from camera, flip rotation direction
            if (axisTowardCamera < 0) {
                rotationAmount = -rotationAmount;
            }

            // Apply rotation to the starting direction
            const rotationQuat = new THREE.Quaternion();
            rotationQuat.setFromAxisAngle(rotationAxis, rotationAmount);

            const dir = rotationStartDirection.clone();
            dir.applyQuaternion(rotationQuat);

            light.direction = {
                x: dir.x,
                y: dir.y,
                z: dir.z
            };

            // Update light cone visualization (position and direction)
            updateLightCone(lightIndex, lightSphere.position, light.direction);

            // Update info box
            updateLightInfoBox(light);
        }
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
            depthTest: false,   // Disable depth test to render in front of all facets
            depthWrite: false
        });
        const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outlineMesh.position.copy(lightSphere.position);
        // Render in front of facets
        outlineMesh.renderOrder = 1001;
        scene.add(outlineMesh);
        lightOutlineMeshes[index] = outlineMesh;

        console.log(`Selected light ${index}`);
    }

    // Update info box
    updateLightInfoBox(lightsArray[index]);

    // Add highlight to light cone
    const selectedLight = lightsArray[index];
    const selectedLightSphere = lightMeshes[index * 2];
    addLightConeHighlight(index, selectedLightSphere.position, selectedLight.direction);

    // Reset gizmo mode to translation when selecting a new light
    gizmoMode = 'translate';

    // Create gizmo for light manipulation (translation by default)
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

// Create a translucent light cone to visualize light direction
function createLightCone(lightIndex, position, direction) {
    // Remove old cone if it exists
    if (lightCones[lightIndex]) {
        scene.remove(lightCones[lightIndex]);
    }

    const coneHeight = 2.0;
    const coneRadius = 0.6;
    const coneGroup = new THREE.Group();

    // Create solid translucent cone
    const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
    const coneMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.15,
        depthTest: false,
        depthWrite: false
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.renderOrder = 500; // Render behind selection highlights
    coneGroup.add(cone);

    // Position cone at the light location
    coneGroup.position.copy(position);

    // Orient the cone along the light direction
    // The cone points along +Y by default (tip at top), we want the tip to point along the direction vector
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // Use quaternion to align cone's +Y axis with the direction vector
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(yAxis, dir.clone().negate());
    coneGroup.setRotationFromQuaternion(quaternion);

    // Now offset the cone along its direction so the tip stays at the light position
    const offset = dir.clone().multiplyScalar(coneHeight / 2);
    coneGroup.position.add(offset);

    scene.add(coneGroup);
    lightCones[lightIndex] = coneGroup;
}

// Update light cone position and direction (for dynamic movement)
function updateLightCone(lightIndex, position, direction) {
    if (!lightCones[lightIndex]) {
        createLightCone(lightIndex, position, direction);
        return;
    }

    const coneGroup = lightCones[lightIndex];
    const coneHeight = 2.0;

    // Position cone at the light location
    coneGroup.position.copy(position);

    // Orient the cone along the light direction
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // Use quaternion to align cone's +Y axis with the direction vector
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(yAxis, dir.clone().negate());
    coneGroup.setRotationFromQuaternion(quaternion);

    // Now offset the cone along its direction so the tip stays at the light position
    const offset = dir.clone().multiplyScalar(coneHeight / 2);
    coneGroup.position.add(offset);

    // Also update highlight if it exists
    if (lightConeHighlights[lightIndex]) {
        updateLightConeHighlight(lightIndex, position, direction);
    }
}

// Add highlight to light cone when light is selected
function addLightConeHighlight(lightIndex, position, direction) {
    // Remove old highlight if it exists
    if (lightConeHighlights[lightIndex]) {
        scene.remove(lightConeHighlights[lightIndex]);
    }

    const coneHeight = 2.0;
    const coneRadius = 0.6;
    const coneGroup = new THREE.Group();

    // Create wireframe highlight for the cone
    const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
    const highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false
    });
    const highlight = new THREE.Mesh(coneGeometry, highlightMaterial);
    highlight.renderOrder = 1000; // Render in front like light highlight
    coneGroup.add(highlight);

    // Position cone at the light location
    coneGroup.position.copy(position);

    // Orient the cone along the light direction
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // Use quaternion to align cone's +Y axis with the direction vector
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(yAxis, dir.clone().negate());
    coneGroup.setRotationFromQuaternion(quaternion);

    // Now offset the cone along its direction so the tip stays at the light position
    const offset = dir.clone().multiplyScalar(coneHeight / 2);
    coneGroup.position.add(offset);

    scene.add(coneGroup);
    lightConeHighlights[lightIndex] = coneGroup;
}

// Update light cone highlight position and direction
function updateLightConeHighlight(lightIndex, position, direction) {
    if (!lightConeHighlights[lightIndex]) {
        return;
    }

    const coneGroup = lightConeHighlights[lightIndex];
    const coneHeight = 2.0;

    // Position cone at the light location
    coneGroup.position.copy(position);

    // Orient the cone along the light direction
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();

    // Use quaternion to align cone's +Y axis with the direction vector
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(yAxis, dir.clone().negate());
    coneGroup.setRotationFromQuaternion(quaternion);

    // Now offset the cone along its direction so the tip stays at the light position
    const offset = dir.clone().multiplyScalar(coneHeight / 2);
    coneGroup.position.add(offset);
}

// Remove light cone highlight
function removeLightConeHighlight(lightIndex) {
    if (lightConeHighlights[lightIndex]) {
        scene.remove(lightConeHighlights[lightIndex]);
        lightConeHighlights[lightIndex] = null;
    }
}

// Create rotation circles (gyroscope-like gizmo) for light rotation
function createRotationGizmo(lightIndex) {
    // Remove old rotation gizmo if it exists
    if (rotationGizmoObjects.length > 0) {
        rotationGizmoObjects.forEach(obj => scene.remove(obj));
        rotationGizmoObjects.length = 0;
    }

    const lightSphere = lightMeshes[lightIndex * 2];
    if (!lightSphere) return;

    const lightPos = lightSphere.position;

    // Base circle size (will be scaled in animation loop)
    const circleRadius = 2.0;

    // X-axis rotation circle (red)
    const xCircle = createRotationCircle(new THREE.Vector3(1, 0, 0), 0xff0000, circleRadius);
    xCircle.position.copy(lightPos);
    xCircle.userData.axis = 'x';
    xCircle.userData.type = 'rotation';
    scene.add(xCircle);
    rotationGizmoObjects.push(xCircle);

    // Y-axis rotation circle (green)
    const yCircle = createRotationCircle(new THREE.Vector3(0, 1, 0), 0x00ff00, circleRadius);
    yCircle.position.copy(lightPos);
    yCircle.userData.axis = 'y';
    yCircle.userData.type = 'rotation';
    scene.add(yCircle);
    rotationGizmoObjects.push(yCircle);

    // Z-axis rotation circle (blue)
    const zCircle = createRotationCircle(new THREE.Vector3(0, 0, 1), 0x0000ff, circleRadius);
    zCircle.position.copy(lightPos);
    zCircle.userData.axis = 'z';
    zCircle.userData.type = 'rotation';
    scene.add(zCircle);
    rotationGizmoObjects.push(zCircle);
}

// Create a rotation circle mesh for a given axis and color
function createRotationCircle(axis, color, radius) {
    const group = new THREE.Group();

    // Create circle geometry (torus - a ring/circle in 3D)
    const circleGeometry = new THREE.TorusGeometry(radius, 0.08, 8, 32);
    // Use MeshBasicMaterial with depth test enabled for proper overlap between circles
    const circleMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.7,
        depthTest: true,   // Enable depth test so circles depth-sort among themselves
        depthWrite: true,  // Enable depth write for proper depth sorting
        fog: false,
        polygonOffset: true,      // Enable polygon offset
        polygonOffsetFactor: -1,  // Negative value pulls geometry toward camera
        polygonOffsetUnits: -1
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    circle.renderOrder = 1001; // Render in front of outline and facets

    // Rotate circle to face the correct direction
    // A torus lies in XY plane by default (normal points along Z)
    // We need to rotate it so the circle lies in the plane perpendicular to the rotation axis
    if (axis.x === 1) {
        // X-axis circle - should be in YZ plane (normal pointing along X)
        // Rotate 90° around Y to move from XY plane to YZ plane
        circle.rotation.y = Math.PI / 2;
    } else if (axis.y === 1) {
        // Y-axis circle - should be in XZ plane (normal pointing along Y)
        // Rotate 90° around X to move from XY plane to XZ plane
        circle.rotation.x = Math.PI / 2;
    } else if (axis.z === 1) {
        // Z-axis circle - should be in XY plane (normal pointing along Z) - default, no rotation
        // No rotation needed
    }

    group.add(circle);
    group.userData.axis = axis;

    return group;
}

// Update rotation gizmo for selected light when it rotates
function updateRotationGizmoPosition(lightIndex) {
    if (rotationGizmoObjects.length > 0) {
        const lightSphere = lightMeshes[lightIndex * 2];
        rotationGizmoObjects.forEach(gizmo => {
            gizmo.position.copy(lightSphere.position);
        });
    }
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

        // Remove light cone highlight
        removeLightConeHighlight(selectedLightIndex);

        selectedLightIndex = null;
    }

    // Remove gizmo
    gizmoObjects.forEach(obj => scene.remove(obj));
    gizmoObjects.length = 0;

    // Remove rotation gizmo
    rotationGizmoObjects.forEach(obj => scene.remove(obj));
    rotationGizmoObjects.length = 0;

    activeAxis = null;
    gizmoMode = 'translate'; // Reset to translation mode

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
let gizmoMode = 'translate'; // 'translate' or 'rotate'
const rotationGizmoObjects = []; // Store rotation circle meshes
const lightCones = []; // Store light cone meshes for visualization
const lightConeHighlights = []; // Store highlight meshes for selected light cones
const rotationCircleScalar = 1.8; // Scalar to adjust rotation circle size
let rotationStartAngle = 0; // Starting angle on the rotation circle
let rotationStartDirection = null; // Starting light direction for rotation

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updateCameraMovement();
    controls.update();

    // Update gizmo size based on current zoom level
    if (selectedLightIndex !== null) {
        const lightSphere = lightMeshes[selectedLightIndex * 2];
        const cameraDistance = camera.position.distanceTo(lightSphere.position);
        let scale = cameraDistance * 0.05; // Smaller multiplier for reasonable arrow size

        // Enforce minimum scale so gizmos stay visible and outside highlight sphere (radius 0.75)
        const minScale = 1.2; // Ensures gizmos extend beyond the 0.75 radius highlight
        scale = Math.max(scale, minScale);

        // Update translation gizmo (arrows) scale
        if (gizmoObjects.length > 0) {
            gizmoObjects.forEach(gizmo => {
                gizmo.scale.set(scale, scale, scale);
            });
        }

        // Update rotation gizmo (circles) scale with scalar
        if (rotationGizmoObjects.length > 0) {
            const rotationScale = scale * rotationCircleScalar;
            rotationGizmoObjects.forEach(gizmo => {
                gizmo.scale.set(rotationScale, rotationScale, rotationScale);
            });
        }
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

    // Create light cone visualization
    createLightCone(lightIndex, sphere.position, newLight.direction);

    updateLightsDisplay();
    resultDiv.textContent = `${lamp} light added at (${x}, ${y}, ${z})`;
    resultDiv.style.color = '#4CAF50';
});

// Remove light
window.removeLight = (index) => {
    // If this is the selected light, deselect it first to clean up gizmos
    if (selectedLightIndex === index) {
        deselectLight();
    }

    lightsArray.splice(index, 1);

    // Remove visual representation (sphere and point light)
    const meshIndex = index * 2;
    if (lightMeshes[meshIndex]) scene.remove(lightMeshes[meshIndex]);
    if (lightMeshes[meshIndex + 1]) scene.remove(lightMeshes[meshIndex + 1]);
    lightMeshes.splice(meshIndex, 2);

    // Remove light cone
    if (lightCones[index]) {
        scene.remove(lightCones[index]);
        lightCones.splice(index, 1);
    }

    // Remove light cone highlight if it exists
    if (lightConeHighlights[index]) {
        scene.remove(lightConeHighlights[index]);
        lightConeHighlights.splice(index, 1);
    }

    // Remove outline if this light was selected
    if (lightOutlineMeshes[index]) {
        scene.remove(lightOutlineMeshes[index]);
        lightOutlineMeshes.splice(index, 1);
    }

    // Remove original material reference
    if (originalLightMaterials[index]) {
        originalLightMaterials.splice(index, 1);
    }

    // Adjust selected light index if necessary
    if (selectedLightIndex !== null && selectedLightIndex > index) {
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
    // Deselect current light first to clean up gizmos
    if (selectedLightIndex !== null) {
        deselectLight();
    }

    lightsArray.length = 0;

    // Remove all light meshes
    lightMeshes.forEach(mesh => scene.remove(mesh));
    lightMeshes.length = 0;

    // Remove all light cones
    lightCones.forEach(cone => {
        if (cone) scene.remove(cone);
    });
    lightCones.length = 0;

    // Remove all light cone highlights
    lightConeHighlights.forEach(highlight => {
        if (highlight) scene.remove(highlight);
    });
    lightConeHighlights.length = 0;

    // Remove all outline meshes
    lightOutlineMeshes.forEach(mesh => {
        if (mesh) scene.remove(mesh);
    });
    lightOutlineMeshes.length = 0;

    // Remove all original material references
    originalLightMaterials.length = 0;

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
