# Pathogen Database

The pathogen database (`src/data/pathogens.json`) contains UV sensitivity information for various pathogens using the Chick-Watson model parameters.

## Database Structure

The database is stored in JSON format with the following structure:

```json
{
  "pathogens": [
    {
      "name": "Pathogen Name",
      "k_value": 0.001,
      "description": "Description of the pathogen"
    }
  ]
}
```

- **name**: Unique identifier for the pathogen (used when requesting specific pathogens)
- **k_value**: Chick-Watson resistance parameter (higher = more UV-resistant)
- **description**: Brief description for reference

## Current Pathogens

| Pathogen | k-value | Description |
|----------|---------|-------------|
| E. coli | 0.001 | Gram-negative bacterium, common indicator organism |
| COVID-19 (Omicron) | 0.003 | SARS-CoV-2 Omicron variant |
| Influenza A | 0.002 | Seasonal influenza virus |
| MRSA | 0.0008 | Methicillin-resistant Staphylococcus aureus |
| Legionella pneumophila | 0.0015 | Causative agent of Legionnaires' disease |
| Mycobacterium tuberculosis | 0.0005 | Highly UV-resistant bacterium causing tuberculosis |
| Candida albicans | 0.0012 | Common fungal pathogen |
| Norovirus | 0.0025 | Leading cause of viral gastroenteritis |
| Rhinovirus | 0.0018 | Common cold virus |

## Using the Pathogen Database

### In Your Code

```python
from src.data import get_pathogen_database

# Get the global database instance
db = get_pathogen_database()

# Get a single pathogen
ecoli = db.get_pathogen("E. coli")

# Get multiple pathogens
pathogen_names = ["E. coli", "COVID-19 (Omicron)", "Influenza A"]
pathogens = db.get_pathogens_by_names(pathogen_names)

# Get all pathogens
all_pathogens = db.list_all_pathogens()

# List available pathogen names
names = db.list_pathogen_names()

# Get full pathogen information including description
info = db.get_pathogen_info("E. coli")
```

### Adding New Pathogens

Simply edit `src/data/pathogens.json` and add a new entry to the `pathogens` array:

```json
{
  "name": "New Pathogen",
  "k_value": 0.0015,
  "description": "Description of the pathogen"
}
```

The new pathogen will be immediately available when the database is loaded.

## k-values and UV Sensitivity

The k-value parameter in the Chick-Watson model determines how quickly a pathogen is inactivated by UV exposure:

- **Lower k-values** (0.0005-0.001): More UV-resistant pathogens
  - Example: Mycobacterium tuberculosis (0.0005)
  - Requires higher UV doses for effective inactivation

- **Higher k-values** (0.002-0.003): More UV-sensitive pathogens
  - Example: COVID-19 Omicron (0.003)
  - Inactivated more quickly by UV exposure

## Chick-Watson Model

The pathogen survival calculation uses the Chick-Watson model:

```
Survival Rate = exp(-k × dose)
```

Where:
- **k** = Chick-Watson resistance parameter (from database)
- **dose** = UV irradiance × exposure time (W/m² × seconds = J/m²)

Higher k-values result in lower survival rates for the same dose.
