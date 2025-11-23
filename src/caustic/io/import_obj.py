"""
Import OBJ files and convert to JSON for frontend visualization.

Command-line usage:
    uv run python -m src.caustic.io.import_obj --file model.obj [--scale 0.5] [--output path] [--quiet]

Python usage:
    from caustic.io.import_obj import import_and_convert_obj
    json_path = import_and_convert_obj("model.obj", scale=0.5)
"""

import argparse
import sys
from pathlib import Path

from .scene_importer import SceneImporter
from .results import SimulationResultsWriter


def import_and_convert_obj(
    obj_filepath: str,
    scale: float = 1.0,
    output_dir: str = "site/frontend/settings",
    verbose: bool = True
) -> str:
    """
    Import an OBJ file and convert it to JSON format.

    Parses the OBJ file, converts to Triangle objects, and writes JSON to output_dir.
    Output filename is derived from input (e.g., model.obj -> model.json).

    Args:
        obj_filepath: Path to the OBJ file
        scale: Scale factor for coordinates (default: 1.0)
        output_dir: Output directory for JSON file (default: site/frontend/settings)
        verbose: Print progress messages (default: True)

    Returns:
        Path to the generated JSON file

    Raises:
        FileNotFoundError: If OBJ file doesn't exist
        ValueError: If OBJ parsing or JSON write fails
    """
    obj_path = Path(obj_filepath)

    # Verify OBJ file exists
    if not obj_path.exists():
        raise FileNotFoundError(f"OBJ file not found: {obj_filepath}")

    if verbose:
        print(f"Importing OBJ file: {obj_filepath}")

    # Import the OBJ file
    try:
        triangles = SceneImporter.import_obj(str(obj_path), scale=scale)
    except Exception as e:
        raise ValueError(f"Failed to parse OBJ file: {e}")

    if verbose:
        print(f"✓ Successfully imported {len(triangles)} triangles")

    # Prepare output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Generate output filename from input filename
    output_filename = obj_path.stem + ".json"
    output_filepath = output_path / output_filename

    if verbose:
        print(f"Writing JSON to: {output_filepath}")

    # Write the triangles to JSON
    try:
        SimulationResultsWriter.write(str(output_filepath), triangles, [], [], [])
    except Exception as e:
        raise ValueError(f"Failed to write JSON file: {e}")

    if verbose:
        print(f"✓ Successfully wrote to {output_filepath}")

    return str(output_filepath)


def main():
    """Command-line interface for importing OBJ files. Exit code: 0 on success, 1 on error."""
    parser = argparse.ArgumentParser(
        description="Import OBJ files and convert them to JSON for frontend visualization"
    )

    parser.add_argument(
        "--file",
        "-f",
        required=True,
        help="Path to the OBJ file to import"
    )

    parser.add_argument(
        "--scale",
        "-s",
        type=float,
        default=1.0,
        help="Scale factor to apply to the geometry (default: 1.0)"
    )

    parser.add_argument(
        "--output",
        "-o",
        default="site/frontend/settings",
        help="Output directory for the JSON file (default: site/frontend/settings)"
    )

    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="Suppress progress messages"
    )

    args = parser.parse_args()

    try:
        output_file = import_and_convert_obj(
            obj_filepath=args.file,
            scale=args.scale,
            output_dir=args.output,
            verbose=not args.quiet
        )
        if not args.quiet:
            print(f"\n✓ Import complete: {output_file}")
        return 0
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
