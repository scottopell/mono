# Coffee Timer

A simple pour over coffee timer web app designed for distraction-free brewing. Built specifically for the Chemex pour over method with automated bloom timing and impossible-to-ignore alerts.

## Features

- **Two Recipe Presets**: Single portion (25g/350g) and double portion (50g/700g)
- **Automated Bloom Timer**: 60-second countdown that auto-advances to first pour
- **User-Paced Pouring**: Tap "Pour Complete" when you see the grounds cave in
- **Aggressive Check-In Alerts**: Flashing screen and haptic feedback if you haven't checked in within 60 seconds
- **Large, Readable Display**: Optimized for phone laying flat next to Chemex
- **No Audio**: Visual and haptic alerts only, perfect for quiet mornings

## Usage

1. Open `index.html` in a mobile browser
2. Select your recipe (single or double portion)
3. Tap "Start Brew"
4. **Bloom Phase**: Pour indicated amount of water, wait for 1-minute countdown
5. **First Pour**: Pour indicated amount when ready, tap "Pour Complete"
6. **Second Pour**: Pour remaining water, tap "Pour Complete"
7. Enjoy your coffee!

## Recipe Details

### Single Portion
- 25g coffee
- 350g total water
- Bloom: 50g water (1 minute)
- First pour: 150g water
- Second pour: 150g water

### Double Portion
- 50g coffee
- 700g total water
- Bloom: 100g water (1 minute)
- First pour: 300g water
- Second pour: 300g water

## Technical Details

Pure static web app with no dependencies:
- HTML5 for structure
- CSS3 for styling and animations
- Vanilla JavaScript for state management
- Web Vibration API for haptic feedback
- LocalStorage for recipe preference persistence

See `specs/` directory for detailed requirements and technical design.

## Development

No build process required. Simply open `index.html` in a browser to run locally.

For hosting, deploy the entire directory to any static hosting service (GitHub Pages, Netlify, Vercel, etc.).

## Browser Compatibility

- Requires modern browser with JavaScript enabled
- Haptic feedback requires mobile device with Vibration API support (iOS Safari, Chrome Android)
- Desktop browsers will show screen flash alerts only (no haptic)
