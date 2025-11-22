High level overview: 

I want to build a far-UV light simulator, which models a 3D room (defined by triangles) with various lights in, and for a given set of points, it calculates survival rates of various pathogens at these points. 

Specifics:

I want the environment to be modelled as a set of triangles in 3D space (representing triangular surfaces that light cannot pass through). They should be defined such that if you are looking at the front of the triangle, the points appear counter-clockwise. If they appear clockwise, then you are looking at the back of the triangle which will not be rendered or considered for raytraces.

For starters, I only want to implement point lights which emit light in every direction, and each light should have an intensity value. 

The process of calculating the survival rate at a given point is as follows:
1. Calculate UV light intensity at any point (using inverse square law)
2. Account for wall reflections (iterative bounces)
3. Convert intensity to dose (irradiance × time)
4. Estimate pathogen survival (using Chick-Watson empirical model)

For this reason, the simulation should be split into two stages:
Stage 1: Calculate UV light intensities at each desired point, factoring in reflections. (steps 1 and 2).
Stage 2: Calculate the pathogen survival rates over time for various pathogens at these points using the light intensities (steps 3 and 4).

The simulation should take as input:
- A list of triangles.
- A list of lights.
- A maximum reflection bounce count. 
- A list of points to calculate the survival rates for. 
- A list of pathogen k values.

Initially I don't want to consider any reflections. I just want to calculate the intensity at a given point by iterating over every lamp, considering whether the direct path to that lamp is uninterupted by a triangle (by doing a raytrace), and if it is uninterupted, the intensity at that point is calculated using the inverse square law (factoring in the intensity of the lamp).

I want the raytracing to be made as effecient as possible. My ideas for this are:
- Create a fast triangle lookup table by segmenting the space into a grid of cubes, where each cuibe contains a list of triangles that could possibly intersect with that cube. Then when raytracing, you can loop over only the triangles in the cubes which could intersect with the ray, instead of looping over all possible triangles.
- Only consider triangles which are facing the ray (not those facing against away from it), making use of the fact that the direction (clockwise or counter-clockwise) of the triangle faces encodes which side is facing out.