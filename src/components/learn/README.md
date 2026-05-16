# ASL Learn Feature - Complete Setup Guide

## Overview

The learn feature provides an interactive 3D viewer for ASL (American Sign Language) letter signs. Users can:
- Click letters A–Z to view different signs
- Drag to rotate the 3D model
- Use arrow keys for quick navigation
- See tips and descriptions for each sign

## Architecture

```
LearnPage (main container)
├── LetterSelector (A–Z grid, left panel)
├── HandModelViewer (3D canvas, center)
│   └── Canvas with OrbitControls
├── LetterInfo (tips panel, right)
└── Keyboard nav + model preloading
```

### Component Files

| File | Purpose |
|------|---------|
| `LearnPage.jsx` | Main page — wires all components, manages letter state, handles keyboard nav |
| `HandModelViewer.jsx` | 3D viewer — loads GLB, renders with lighting, handles rotations |
| `LetterSelector.jsx` | A–Z button grid — user selects letter |
| `LetterInfo.jsx` | Tips panel — shows hand shape tips from `signMeta.js` |
| `TestViewer.jsx` | Throwaway sanity check — proves GLB loading works |

### Data Files

| File | Purpose |
|------|---------|
| `src/data/signMeta.js` | Static JS object with tips/descriptions for each letter |
| `public/models/*.glb` | 3D hand models (one per letter, uppercase) |

## Quick Start

### 1. Install & Run

```bash
npm install
npm run dev
```

Visit `http://localhost:5173` (Vite default)

### 2. Get GLB Models

See [public/models/README.md](../models/README.md) for sourcing options (CGTrader, Sketchfab, IconScout).

**For now**, download 2–3 test models:
- Visit [Sketchfab](https://sketchfab.com) → search "ASL hand" or "sign language"
- Download `.glb` files
- Place in `public/models/` as `A.glb`, `B.glb`, `C.glb`

### 3. Test the Viewer

The TestViewer component is your sanity check:

```jsx
// In App.js, temporarily replace LearnPage with TestViewer:
import TestViewer from './components/learn/TestViewer';

export default function App() {
  return <TestViewer />;
}
```

Then:
1. Run `npm run dev`
2. You should see a 3D model with a label "🧪 TestViewer"
3. Drag to rotate — if it works, your GLB path is correct

### 4. Integrate LearnPage

Once GLBs are loading:

```jsx
import { LearnPage } from './components/learn/LearnPage';

export default function App() {
  return <LearnPage />;
}
```

Now you have:
- Full A–Z letter grid
- 3D rotatable models
- Tips panel with sign descriptions
- Arrow key navigation
- Model preloading (instant swaps)

## Key Features

### 1. Instant Model Swaps
- `preloadAllLetters()` loads all 26 GLBs on app start
- No 500ms "waiting" when you switch letters
- Uses `useGLTF.preload()` from drei

### 2. Keyboard Navigation
- **Arrow Right**: Next letter (A→B→C)
- **Arrow Left**: Previous letter (C→B→A)
- **Drag**: Rotate model with mouse
- **Scroll**: Zoom in/out

### 3. Loading State
- While swapping letters, "Loading model…" appears
- `Suspense` boundary in HandModelViewer handles this
- Feels snappy thanks to preloading

### 4. Responsive Layout
- Letter grid (left): 280px fixed
- 3D viewer (center): 1fr (takes remaining space)
- Tips panel (right): 280px fixed
- Footer: keyboard shortcuts hint

## Customization

### Change Default Letter
In `LearnPage.jsx`:
```jsx
const [selectedLetter, setSelectedLetter] = useState('A'); // Change this
```

### Adjust Camera Position
In `HandModelViewer.jsx`:
```jsx
<Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
```
- `position`: [x, y, z] — move closer/farther from model
- `fov`: 50 — field of view (lower = zoom in)

### Lighting Adjustments
```jsx
<ambientLight intensity={0.6} /> {/* Overall brightness */}
<directionalLight intensity={0.8} /> {/* Sun-like light */}
```

### Edit Tips for Each Letter
Edit `src/data/signMeta.js`:
```js
A: {
  tips: ["Your tip 1", "Your tip 2", "Your tip 3"],
  description: "Your description"
},
```

## Troubleshooting

### Models Don't Load
1. Check browser console (F12) for 404 errors
2. Verify filenames: `A.glb`, `B.glb` (UPPERCASE)
3. Ensure files are in `public/models/`
4. Restart dev server: `npm run dev`

### Models Appear but Look Weird
- Bad topology or missing normals in GLB
- Try a different source model
- Use Blender to re-export with correct settings

### Slow Model Swaps
- Check Network tab in DevTools — are models preloading?
- Ensure `preloadAllLetters()` is called on page load
- Try reducing total GLB file size (use Draco compression)

### Camera View Wrong
- Model might be too big/small
- Try adjusting camera position in `HandModelViewer.jsx`
- Or re-export GLB in Blender with correct scale

## Performance Targets

- **Initial load**: < 2s (depends on total GLB size)
- **Letter swap**: < 100ms (instant due to preloading)
- **Rotation smoothness**: 60fps (OrbitControls is optimized)

**File size budget**: Keep total of all 26 GLBs < 15MB for snappy loads.

## Next: Integration with PracticeMode

Your app already has a `Palmread.jsx` with mode switching (learn | practice).

To integrate LearnPage:

```jsx
// In Palmread.jsx
import { LearnPage } from './components/learn/LearnPage';
import PracticeMode from './components/PracticeMode';

const [mode, setMode] = useState('learn');

return (
  <>
    {/* tab switcher */}
    {mode === 'learn' ? <LearnPage /> : <PracticeMode />}
  </>
);
```

The two modes are completely independent — switching tabs doesn't affect state in the other (thanks to `useGLTF` caching).

## File Checklist

- ✅ `src/components/learn/LearnPage.jsx`
- ✅ `src/components/learn/HandModelViewer.jsx`
- ✅ `src/components/learn/LetterSelector.jsx`
- ✅ `src/components/learn/LetterInfo.jsx`
- ✅ `src/components/learn/TestViewer.jsx`
- ✅ `src/data/signMeta.js`
- ✅ `public/models/` (folder created, waiting for GLB files)

## Quick Test Commands

```bash
# Install deps
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview build locally
npm run preview
```

Then visit `http://localhost:5173`.

---

**Questions?** Check the code comments in each component — they explain the "why" behind each piece.
