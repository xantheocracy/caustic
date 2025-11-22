import { Vector3 } from './vector';

/**
 * Represents a point light source that emits light in all directions.
 */
export class Light {
  constructor(
    public position: Vector3,
    public intensity: number // Total radiant intensity (watts)
  ) {}
}
