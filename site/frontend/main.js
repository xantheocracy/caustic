import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
camera.position.z = 5;

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Create cube with translucent faces
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshStandardMaterial({
    color: 0xff69b4,
    metalness: 0.3,
    roughness: 0.4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Add solid edges
const edges = new THREE.EdgesGeometry(geometry);
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xff69b4, linewidth: 2 });
const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
scene.add(edgeLines);

// Generate synthetic heatmap data
function generateHeatmapData(numPoints = 50) {
    const data = [];
    for (let i = 0; i < numPoints; i++) {
        // Random positions on the bottom surface of the cube (y = -1)
        const x = (Math.random() - 0.5) * 2; // -1 to 1
        const z = (Math.random() - 0.5) * 2; // -1 to 1
        const intensity = Math.random(); // 0 to 1
        data.push({ x, z, intensity });
    }
    return data;
}

// Interpolate intensity at a point using inverse distance weighting
function interpolateIntensity(x, z, dataPoints) {
    let weightedSum = 0;
    let weightSum = 0;
    const power = 2; // Power parameter for IDW

    dataPoints.forEach(point => {
        const dx = x - point.x;
        const dz = z - point.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 0.001) {
            // If very close to a data point, return its intensity directly
            return point.intensity;
        }

        const weight = 1 / Math.pow(distance, power);
        weightedSum += point.intensity * weight;
        weightSum += weight;
    });

    return weightedSum / weightSum;
}

// Create heatmap visualization on bottom surface
function createHeatmap(data, resolution = 64) {
    const y = -1.001; // Slightly below bottom surface to avoid z-fighting

    // Create a plane geometry for the heatmap
    const planeGeometry = new THREE.PlaneGeometry(2, 2, resolution - 1, resolution - 1);

    // Generate vertex colors based on interpolated intensity
    const colors = [];
    const positions = planeGeometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getY(i); // Note: plane's Y becomes our Z

        // Interpolate intensity at this vertex
        const intensity = interpolateIntensity(x, z, data);

        // Color based on intensity (blue = low, red = high)
        const color = new THREE.Color();
        color.setHSL((1 - intensity) * 0.7, 1, 0.5);

        colors.push(color.r, color.g, color.b);
    }

    planeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create material with vertex colors
    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    });

    const heatmapPlane = new THREE.Mesh(planeGeometry, material);

    // Rotate plane to align with bottom surface (horizontal)
    heatmapPlane.rotation.x = -Math.PI / 2;
    heatmapPlane.position.y = y;

    return heatmapPlane;
}

// Generate and add heatmap
const heatmapData = generateHeatmapData(50);
const heatmap = createHeatmap(heatmapData, 64);
scene.add(heatmap);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Mouse controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.minDistance = 0;
controls.maxDistance = 20;

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
