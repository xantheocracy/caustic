import { Vector3, Triangle, Light } from '../index';

/**
 * Creates a simple cubic room with a central block.
 * Room dimensions: 10×10×10 units
 * Block dimensions: 2×2×2 units at the center
 */
export function createSimpleRoomEnvironment(): {
  triangles: Triangle[];
  lights: Light[];
} {
  const triangles: Triangle[] = [];

  // Room dimensions
  const roomSize = 10;
  const roomMin = 0;
  const roomMax = roomSize;

  // Room construction: all triangles face inward
  // Each wall consists of 2 triangles

  // Floor (y = 0, faces upward into room)
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMin),
      new Vector3(roomMax, roomMin, roomMax),
      new Vector3(roomMin, roomMin, roomMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMin),
      new Vector3(roomMax, roomMin, roomMin),
      new Vector3(roomMax, roomMin, roomMax)
    )
  );

  // Ceiling (y = roomMax, faces downward into room)
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMax, roomMin),
      new Vector3(roomMin, roomMax, roomMax),
      new Vector3(roomMax, roomMax, roomMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMax, roomMin),
      new Vector3(roomMax, roomMax, roomMax),
      new Vector3(roomMax, roomMax, roomMin)
    )
  );

  // Front wall (z = roomMin, faces inward)
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMin),
      new Vector3(roomMin, roomMax, roomMin),
      new Vector3(roomMax, roomMax, roomMin)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMin),
      new Vector3(roomMax, roomMax, roomMin),
      new Vector3(roomMax, roomMin, roomMin)
    )
  );

  // Back wall (z = roomMax, faces inward)
  triangles.push(
    new Triangle(
      new Vector3(roomMax, roomMin, roomMax),
      new Vector3(roomMax, roomMax, roomMax),
      new Vector3(roomMin, roomMax, roomMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMax, roomMin, roomMax),
      new Vector3(roomMin, roomMax, roomMax),
      new Vector3(roomMin, roomMin, roomMax)
    )
  );

  // Left wall (x = roomMin, faces inward)
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMax),
      new Vector3(roomMin, roomMax, roomMax),
      new Vector3(roomMin, roomMax, roomMin)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMin, roomMin, roomMax),
      new Vector3(roomMin, roomMax, roomMin),
      new Vector3(roomMin, roomMin, roomMin)
    )
  );

  // Right wall (x = roomMax, faces inward)
  triangles.push(
    new Triangle(
      new Vector3(roomMax, roomMin, roomMin),
      new Vector3(roomMax, roomMax, roomMin),
      new Vector3(roomMax, roomMax, roomMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(roomMax, roomMin, roomMin),
      new Vector3(roomMax, roomMax, roomMax),
      new Vector3(roomMax, roomMin, roomMax)
    )
  );

  // Central hovering block (2×2×2, centered at 5,4,5)
  // Triangles face outward
  const blockMin = 4;
  const blockMax = 6;

  // Block bottom (y = blockMin, faces downward/outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMin, blockMin, blockMax),
      new Vector3(blockMax, blockMin, blockMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMax, blockMin, blockMax),
      new Vector3(blockMax, blockMin, blockMin)
    )
  );

  // Block top (y = blockMax, faces upward/outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMax, blockMin),
      new Vector3(blockMax, blockMax, blockMax),
      new Vector3(blockMin, blockMax, blockMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMax, blockMin),
      new Vector3(blockMax, blockMax, blockMin),
      new Vector3(blockMax, blockMax, blockMax)
    )
  );

  // Block front (z = blockMin, faces outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMax, blockMin, blockMin),
      new Vector3(blockMax, blockMax, blockMin)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMax, blockMax, blockMin),
      new Vector3(blockMin, blockMax, blockMin)
    )
  );

  // Block back (z = blockMax, faces outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMax),
      new Vector3(blockMax, blockMax, blockMax),
      new Vector3(blockMax, blockMin, blockMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMax),
      new Vector3(blockMin, blockMax, blockMax),
      new Vector3(blockMax, blockMax, blockMax)
    )
  );

  // Block left (x = blockMin, faces outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMin, blockMax, blockMin),
      new Vector3(blockMin, blockMax, blockMax)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMin, blockMin, blockMin),
      new Vector3(blockMin, blockMax, blockMax),
      new Vector3(blockMin, blockMin, blockMax)
    )
  );

  // Block right (x = blockMax, faces outward)
  triangles.push(
    new Triangle(
      new Vector3(blockMax, blockMin, blockMin),
      new Vector3(blockMax, blockMax, blockMax),
      new Vector3(blockMax, blockMax, blockMin)
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(blockMax, blockMin, blockMin),
      new Vector3(blockMax, blockMin, blockMax),
      new Vector3(blockMax, blockMax, blockMax)
    )
  );

  // Single light at top center of room, just below ceiling
  const lights = [new Light(new Vector3(5, 9.5, 5), 1000)]; // 1000 W intensity

  return { triangles, lights };
}

/**
 * Generate test points on the floor of the room at various positions
 */
export function generateFloorTestPoints(): Vector3[] {
  const points: Vector3[] = [];
  const floorY = 0.1; // Slightly above the floor

  // Create a grid of test points
  for (let x = 1; x < 10; x += 2) {
    for (let z = 1; z < 10; z += 2) {
      points.push(new Vector3(x, floorY, z));
    }
  }

  return points;
}
