"""Test script to demonstrate pathogen database functionality"""

from src.data import get_pathogen_database

# Load the pathogen database
db = get_pathogen_database()

print("=" * 80)
print("Pathogen Database Test")
print("=" * 80)

# Show all available pathogens
print("\nAvailable Pathogens:\n")
db.print_database()

# Demonstrate individual pathogen retrieval
print("=" * 80)
print("Getting specific pathogens:\n")

pathogen_names = ["E. coli", "COVID-19 (Omicron)", "Influenza A"]
for name in pathogen_names:
    info = db.get_pathogen_info(name)
    print(f"{name}:")
    print(f"  k-value: {info['k_value']}")
    print(f"  Description: {info['description']}")
    print()

# Demonstrate batch retrieval
print("=" * 80)
print("Getting multiple pathogens as Pathogen objects:\n")

pathogens = db.get_pathogens_by_names(pathogen_names)
for p in pathogens:
    print(f"  {p.name}: k={p.k_value}")

print("\n" + "=" * 80)
print("Test completed successfully!")
print("=" * 80)
