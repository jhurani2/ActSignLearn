import React, { Suspense, Component, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, useFBX, Html } from '@react-three/drei';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const MIN_ROTATION_X = -22;
const MAX_ROTATION_X = 18;
const MIN_ROTATION_Y = -76;
const MAX_ROTATION_Y = 76;
const DEFAULT_ROTATION = { x: -7, y: 0 };

function getLocalHandImageUrl(letter) {
  return `/hand_models/letter_${String(letter || '').toLowerCase()}.png`;
}

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

function StaticImageFallback({ letter }) {
  return (
    <div className="hand-png-fallback" role="img" aria-label={`ASL hand reference unavailable for ${letter}`}>
      <span>{letter}</span>
    </div>
  );
}

function PngHandImageViewer({ src, letter, interactive = true, onImageError }) {
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [dragging, setDragging] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, rotationX: -7, rotationY: 0 });
  const depthLayers = [-12, -8, -4, 0];

  useEffect(() => {
    setRotation(DEFAULT_ROTATION);
    setImageFailed(false);
  }, [letter, src]);

  const resetRotation = () => {
    setRotation(DEFAULT_ROTATION);
  };

  const startDrag = (event) => {
    if (!interactive) return;

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      rotationX: rotation.x,
      rotationY: rotation.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!dragging || !interactive) return;

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    setRotation({
      x: clamp(dragRef.current.rotationX - deltaY * 0.18, MIN_ROTATION_X, MAX_ROTATION_X),
      y: clamp(dragRef.current.rotationY + deltaX * 0.22, MIN_ROTATION_Y, MAX_ROTATION_Y),
    });
  };

  const stopDrag = (event) => {
    if (!interactive) return;

    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Some browsers release capture before pointercancel bubbles.
    }
  };

  const handleKeyDown = (event) => {
    if (!interactive) return;

    const step = event.shiftKey ? 10 : 5;
    if (event.key === 'ArrowLeft') {
      setRotation((current) => ({ ...current, y: clamp(current.y - step, MIN_ROTATION_Y, MAX_ROTATION_Y) }));
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'ArrowRight') {
      setRotation((current) => ({ ...current, y: clamp(current.y + step, MIN_ROTATION_Y, MAX_ROTATION_Y) }));
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'ArrowUp') {
      setRotation((current) => ({ ...current, x: clamp(current.x - step, MIN_ROTATION_X, MAX_ROTATION_X) }));
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'ArrowDown') {
      setRotation((current) => ({ ...current, x: clamp(current.x + step, MIN_ROTATION_X, MAX_ROTATION_X) }));
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'Home') {
      resetRotation();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleImageError = () => {
    if (typeof onImageError === 'function') {
      onImageError();
      return;
    }
    setImageFailed(true);
  };

  if (imageFailed) {
    return <StaticImageFallback letter={letter} />;
  }

  return (
    <div
      className={`hand-png-viewer ${dragging ? 'dragging' : ''}`}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={handleKeyDown}
    >
      <img
        className="hand-png-backdrop"
        src={src}
        alt=""
        aria-hidden="true"
        draggable="false"
        onError={handleImageError}
      />
      <div className="hand-png-stage" role="img" aria-label={`ASL hand reference for ${letter}`}>
        <div
          className="hand-png-stack"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          }}
        >
          {depthLayers.map((depth, index) => (
            <img
              key={depth}
              className="hand-png-layer hand-png-depth-layer"
              src={src}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={handleImageError}
              style={{
                opacity: 0.18 + index * 0.08,
                transform: `translate3d(${index * 0.6}px, ${index * 0.4}px, ${depth}px)`,
              }}
            />
          ))}
          <img
            className="hand-png-layer hand-png-main-layer"
            src={src}
            alt=""
            aria-hidden="true"
            draggable="false"
            onError={handleImageError}
          />
        </div>
      </div>
      <div
        className="hand-viewer-controls"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <button
          className="hand-reset-button"
          type="button"
          aria-label="Reset hand image rotation"
          title="Reset rotation"
          onClick={(event) => {
            event.stopPropagation();
            resetRotation();
          }}
        >
          <svg
            className="hand-home-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3.5 10.4 12 3.8l8.5 6.6" />
            <path d="M5.8 9.6V20h4.4v-5.8h3.6V20h4.4V9.6" />
          </svg>
        </button>
        <span className="hand-rotate-affordance" aria-hidden="true">
          <span className="hand-rotate-icon" />
        </span>
      </div>
    </div>
  );
}

export default function ModelViewer({ letter, modelUrl }) {
  const localImageUrl = getLocalHandImageUrl(letter);
  const [useRemote, setUseRemote] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [remoteAssetType, setRemoteAssetType] = useState('checking');
  const [remoteAssetFormat, setRemoteAssetFormat] = useState('glb');

  useEffect(() => {
    setUseRemote(false);
    setShowUnavailable(false);
    setRemoteAssetType('checking');
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

  const activeModelUrl = useRemote && modelUrl ? modelUrl : null;
  const activeModelFormat = remoteAssetFormat;

  const handleModelError = () => {
    if (useRemote && modelUrl) {
      setUseRemote(false);
      setRemoteAssetType('image');
      return;
    }
    setShowUnavailable(true);
  };

  const handleLocalImageError = () => {
    if (modelUrl) {
      setUseRemote(true);
      setRemoteAssetType('checking');
      return;
    }
    setShowUnavailable(true);
  };

  if (showUnavailable && (!useRemote || !modelUrl)) {
    return (
      <div className="model-slot">
        <StaticImageFallback letter={letter} />
      </div>
    );
  }

  if (!useRemote || !modelUrl) {
    return (
      <div className="model-slot">
        <PngHandImageViewer
          src={localImageUrl}
          letter={letter}
          onImageError={handleLocalImageError}
        />
      </div>
    );
  }

  if (remoteAssetType === 'checking') {
    return (
      <div className="model-slot">
        <StaticImageFallback letter={letter} />
      </div>
    );
  }

  if (remoteAssetType === 'image') {
    return (
      <div className="model-slot">
        <PngHandImageViewer src={modelUrl} letter={letter} />
      </div>
    );
  }

  return (
    <div className="model-slot">
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
    </div>
  );
}
