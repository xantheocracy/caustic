// Configuration for the UV Light Simulator
// Change this to your deployed backend URL for production

export const config = {
    // Default to localhost for development
    // For production, set this to your backend URL (e.g., Railway, Fly.io, Render)
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000'
        : 'https://caustic-production.up.railway.app'
};
