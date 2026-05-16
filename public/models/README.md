# Setting up GLB Models for ASL Letter Viewer

## Where to Get Models

You have several options for sourcing ASL hand gesture models:

### Option 1: CGTrader (Recommended for quality)
- **Site**: https://www.cgtrader.com
- **Search**: "hand gesture models", "sign language", "ASL alphabet"
- **Format**: Filter for `.glb` or `.gltf` models
- **Cost**: Most free or $5–$20 per pack
- **Quality**: High-quality topology, good for animation
- **How to use**:
  1. Download model pack (usually `.zip` or individual files)
  2. Extract into `public/models/`
  3. Verify filenames match: `A.glb`, `B.glb`, ..., `Z.glb` (uppercase)

### Option 2: IconScout (Good free/cheap options)
- **Site**: https://www.iconscout.com
- **Search**: "hand sign", "ASL", "gesture"
- **Format**: Look for 3D models in `.glb` format
- **Cost**: Many free, premium packs $10–$30
- **How to use**: Same as CGTrader — download, extract, verify naming

### Option 3: Sketchfab (Largest free library)
- **Site**: https://sketchfab.com
- **Search**: "ASL hand", "sign language alphabet"
- **Filter**: 
  - Format: `.glb` (downloadable)
  - License: Creative Commons OK (check terms)
- **Cost**: Free (most)
- **Quality**: Varies — vet models before committing
- **How to use**:
  1. Search for ASL/sign language collections
  2. Click model → Download (requires account)
  3. Extract `.glb` files
  4. Rename to match letter: `A.glb`, `B.glb`, etc.

### Option 4: Turbosquid
- **Site**: https://www.turbosquid.com
- **Search**: "ASL hand models", "sign language alphabet"
- **Cost**: $10–$50+ per model or pack
- **Quality**: Professional grade
- **How to use**: Same workflow as CGTrader

## File Structure

Once you have models, place them here:

```
public/
├── models/
│   ├── A.glb
│   ├── B.glb
│   ├── C.glb
│   ...
│   └── Z.glb
```

**CRITICAL**: File names must be **UPPERCASE single letter + .glb**. The code looks for `/models/A.glb`, not `/models/a.glb` or `/models/letter-a.glb`.

## Testing Your Models

### Quick Sanity Check

1. Download one or two models and place in `public/models/` (e.g., `A.glb`, `B.glb`)
2. Run the app:
   ```bash
   npm run dev
   ```
3. You should see the 3D model render in the canvas
4. Try dragging to rotate — OrbitControls should work

### Common Issues

| Issue | Fix |
|-------|-----|
| Model doesn't appear | Check browser console for 404. Verify filename is `UPPERCASE.glb`. Ensure file is in `public/models/`. |
| Model appears but looks broken | Some models have missing normals or bad topology. Try a different source. |
| Model is too small/big | The viewer's camera is at position `[0, 0, 2.5]`. If model doesn't fit, export GLB with correct scale in Blender. |
| Slow to swap letters | Models aren't preloading. The `preloadAllLetters()` function should trigger on app load. Check network tab in DevTools. |

## Performance Notes

- **Total file size**: 26 GLBs. If total > 15MB, initial load will be slow.
- **Optimization**: Use Blender's Draco compression when exporting GLB (`Export → Compression Level: 8`)
- **Caching**: The app uses `useGLTF` which caches models after first load. Subsequent swaps are instant.

## Next Steps

1. Pick a source (CGTrader, Sketchfab, or IconScout)
2. Download 2–3 models as a test (A, B, C)
3. Place them in `public/models/`
4. Run `npm run dev` and verify they load
5. If satisfied, download the full A–Z set
6. Place all 26 models in `public/models/`

That's it! The app is already configured to preload and swap them.
