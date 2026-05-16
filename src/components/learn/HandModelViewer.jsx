import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html } from '@react-three/drei'
import { Suspense } from 'react'

function HandModel({ letter }) {
  try {
    const { scene } = useGLTF(`/models/${letter.toLowerCase()}.glb`)
    return <primitive object={scene} scale={1.5} />
  } catch (e) {
    return (
      <Html center>
        <div style={{ color: '#666', fontSize: 14, textAlign: 'center' }}>
          Model file not ready
        </div>
      </Html>
    )
  }
}

function LoadingSpinner() {
  return (
    <Html center>
      <div style={{ color: '#888', fontSize: 13 }}>Loading model...</div>
    </Html>
  )
}

function ErrorBoundary({ children }) {
  return (
    <Html center>
      <div style={{ color: '#d97706', fontSize: 13 }}>Model unavailable</div>
    </Html>
  )
}

export default function HandModelViewer({ letter }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#f3f4f6', borderRadius: '12px' }}>
      <Canvas style={{ width: '100%', height: '100%' }} camera={{ position: [0, 0, 3], fov: 45 }} onCreated={(state) => {
        state.gl.setClearColor('#f3f4f6')
      }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <Suspense fallback={<LoadingSpinner />}>
          <HandModel letter={letter} />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={5} />
      </Canvas>
    </div>
  )
}

// Preload all 26 letter models on page load for instant swaps
const letters = 'abcdefghijklmnopqrstuvwxyz'.split('')
letters.forEach((letter) => {
  useGLTF.preload(`/models/${letter}.glb`)
})
