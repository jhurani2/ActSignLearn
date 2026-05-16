import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';

/**
 * TestModel - loads a single GLB file
 * This is a throwaway component to verify GLB loading works
 */
function TestModel() {
  // Replace with your actual model path once you have GLBs
  const { scene } = useGLTF('/models/A.glb');
  return <primitive object={scene} />;
}

/**
 * TestViewer - throwaway sanity check
 * Confirms that:
 * 1. GLB files load from public/models/
 * 2. Canvas renders without errors
 * 3. OrbitControls work (drag to rotate)
 * 4. Lighting is adequate
 */
export function TestViewer() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        {/* Model with loading fallback */}
        <Suspense fallback={null}>
          <TestModel />
        </Suspense>

        {/* Drag-to-rotate */}
        <OrbitControls />
      </Canvas>
      
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        padding: '10px 15px',
        borderRadius: '4px',
        fontSize: '14px',
        fontFamily: 'monospace'
      }}>
        <p>🧪 TestViewer - Sanity Check</p>
        <p>✓ If model appears: GLB path is correct</p>
        <p>✓ Drag to rotate</p>
      </div>
    </div>
  );
}

export default TestViewer;
