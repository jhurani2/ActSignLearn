import React, { Suspense, Component, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, useFBX, Html } from '@react-three/drei';

function GltfHandModel({ letter, modelUrl }) {
  const source = modelUrl || `/models/${letter}.glb`;
  const { scene } = useGLTF(source);
  return <primitive object={scene} dispose={null} />;
}

function FbxHandModel({ modelUrl }) {
  const fbx = useFBX(modelUrl);
  return <primitive object={fbx} dispose={null} />;
}

function HandModel({ letter, modelUrl, modelFormat }) {
  if (modelFormat === 'fbx') {
    return <FbxHandModel modelUrl={modelUrl} />;
  }
  return <GltfHandModel letter={letter} modelUrl={modelUrl} />;
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.sourceKey !== this.props.sourceKey) {
      if (this.state.hasError) {
        this.setState({ hasError: false });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return <ModelUnavailable letter={this.props.letter} />;
    }
    return this.props.children;
  }
}

function ModelUnavailable({ letter }) {
  return (
    <Html center>
      <div style={{
        background: 'rgba(0, 0, 0, 0.72)',
        color: '#fff',
        borderRadius: 12,
        padding: '12px 18px',
        fontSize: 14,
        fontFamily: 'system-ui',
        textAlign: 'center'
      }}>
        Model unavailable for {letter}
      </div>
    </Html>
  );
}

function LoadingOverlay() {
  return (
    <Html center>
      <div style={{
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        borderRadius: 12,
        padding: '12px 18px',
        fontSize: 14,
        fontFamily: 'system-ui'
      }}>
        Loading model...
      </div>
    </Html>
  );
}

function IconImageViewer({ src, letter }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1115' }}>
      <img
        src={src}
        alt={`IconScout asset for ${letter}`}
        style={{ maxWidth: '82%', maxHeight: '82%', objectFit: 'contain', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))' }}
      />
    </div>
  );
}

export default function ModelViewer({ letter, modelUrl }) {
  const localModelUrl = `/models/${letter}.glb`;
  const [useRemote, setUseRemote] = useState(Boolean(modelUrl));
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [remoteAssetType, setRemoteAssetType] = useState('model');
  const [remoteAssetFormat, setRemoteAssetFormat] = useState('glb');

  useEffect(() => {
    setUseRemote(Boolean(modelUrl));
    setShowUnavailable(false);
    setRemoteAssetType('model');
    setRemoteAssetFormat('glb');
  }, [letter, modelUrl]);

  useEffect(() => {
    if (!useRemote || !modelUrl) return undefined;

    const controller = new AbortController();

    async function detectAssetType() {
      try {
        const response = await fetch(modelUrl, { method: 'GET', signal: controller.signal });
        const headerType = (response.headers.get('x-iconscout-asset-type') || '').toLowerCase();
        const headerFormat = (response.headers.get('x-iconscout-asset-format') || '').toLowerCase();
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (response.body && typeof response.body.cancel === 'function') {
          response.body.cancel().catch(() => {});
        }

        if (headerType.includes('image') || contentType.startsWith('image/')) {
          setRemoteAssetType('image');
          setRemoteAssetFormat('image');
          return;
        }

        if (headerFormat.includes('fbx')) {
          setRemoteAssetFormat('fbx');
        } else {
          setRemoteAssetFormat('glb');
        }
        setRemoteAssetType('model');
      } catch {
        setRemoteAssetType('model');
        setRemoteAssetFormat('glb');
      }
    }

    detectAssetType();

    return () => {
      controller.abort();
    };
  }, [useRemote, modelUrl]);

  const activeModelUrl = useRemote && modelUrl ? modelUrl : localModelUrl;
  const activeModelFormat = useRemote ? remoteAssetFormat : 'glb';

  const handleModelError = () => {
    if (useRemote && modelUrl) {
      setUseRemote(false);
      return;
    }
    setShowUnavailable(true);
  };

  return (
    <div className="model-slot">
      {useRemote && modelUrl && remoteAssetType === 'image' ? (
        <IconImageViewer src={modelUrl} letter={letter} />
      ) : (
        <Canvas camera={{ position: [0, 0, 2.8], fov: 45 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 5]} intensity={0.9} />
          <directionalLight position={[-4, -3, -3]} intensity={0.4} />

          <Suspense fallback={<LoadingOverlay />}>
            {showUnavailable ? (
              <ModelUnavailable letter={letter} />
            ) : (
              <ModelErrorBoundary
                letter={letter}
                sourceKey={`${letter}:${activeModelUrl}`}
                onError={handleModelError}
              >
                <HandModel letter={letter} modelUrl={activeModelUrl} modelFormat={activeModelFormat} />
              </ModelErrorBoundary>
            )}
          </Suspense>

          <OrbitControls enablePan={false} enableZoom={true} />
        </Canvas>
      )}
    </div>
  );
}
