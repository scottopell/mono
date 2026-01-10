# Bubble Sort Color Visualizer

A web-based visualization tool for exploring bubble sort behavior on arrays where each element has a color property (red or green). The app tracks multiple metrics over time to identify potential emergent patterns in how colored elements behave during sorting.

## Features

- **Visual Array Display**: Bar chart representation with color-coded elements
- **Seeded Randomization**: Reproducible arrays using configurable random seed
- **Step-by-step or Animated Sorting**: Control the pace of visualization
- **Real-time Metrics Tracking**:
  - **Sortedness**: Percentage of array that is sorted (based on inversion count)
  - **Color Position**: Average index position of red vs green elements
  - **Clustering Index**: How grouped together same-colored elements are
  - **Color Inversions**: Inversion pairs split by cross-color vs same-color
  - **Swap Ratio**: Cumulative swaps between different colors vs same colors

## Usage

Open `index.html` in a web browser. No build step required.

### Controls

- **Array Size**: Number of elements (5-50)
- **Random Seed**: Seed for reproducible random generation
- **Speed**: Animation delay in milliseconds
- **Generate Array**: Create new random array
- **Start Sort**: Run bubble sort animation
- **Step**: Advance one comparison at a time
- **Reset**: Restore original unsorted array

## Hypothesis

The visualizer was built to explore whether color properties exhibit emergent behavior during bubble sort:

- Do elements of one color tend to drift in a particular direction?
- Does clustering of same-colored elements increase or decrease?
- Are cross-color swaps more or less frequent than same-color swaps?

The metrics panels help observe these patterns across different seeds and array sizes.

## Technical Details

- Pure HTML/CSS/JavaScript (no build tools)
- Uses Chart.js for real-time metric visualization
- Seeded PRNG (Mulberry32) for reproducibility
- Generator-based bubble sort for step-by-step control
