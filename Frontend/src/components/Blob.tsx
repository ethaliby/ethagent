import { useRef, useMemo, useCallback, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const snoise3D = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const blobDisplaceFn = /* glsl */ `
float getBlobRadius(vec3 dir, float time) {
  float n1 = snoise(dir * 0.8 + time * 0.1);
  float n2 = snoise(dir * 1.6 + time * 0.18 + 100.0) * 0.5;
  return 0.9 + (n1 + n2) * 0.07;
}
`;

const dustVert = /* glsl */ `
${snoise3D}
${blobDisplaceFn}

uniform float uTime;
uniform float uImpulse;

attribute float aPhase;
attribute float aGold;
attribute float aSize;

varying float vAlpha;
varying float vGold;

void main() {
  vec3 basePos = position;
  vec3 dir = normalize(basePos);
  float r = length(basePos);

  float spiralSpeed = 0.08 + aPhase * 0.06;
  float spiralAngle = uTime * spiralSpeed + aPhase * 6.28;
  float cosA = cos(spiralAngle);
  float sinA = sin(spiralAngle);
  float tiltAngle = uTime * spiralSpeed * 0.3 + aPhase * 3.14;
  float cosT = cos(tiltAngle);
  float sinT = sin(tiltAngle);
  vec3 spiralDir = vec3(
    dir.x * cosA - dir.z * sinA,
    dir.y * cosT - (dir.x * sinA + dir.z * cosA) * sinT * 0.3,
    (dir.x * sinA + dir.z * cosA) * cosT + dir.y * sinT * 0.3
  );
  spiralDir = normalize(spiralDir);

  float blobRadius = getBlobRadius(spiralDir, uTime);

  float attractionNoise = snoise(spiralDir * 1.5 + uTime * 0.08 + aPhase * 40.0);
  float attraction = smoothstep(-1.5, -0.2, attractionNoise);

  vec3 surfacePos = spiralDir * blobRadius;
  vec3 tangent = normalize(cross(spiralDir, vec3(0.0, 1.0, 0.01)));
  vec3 bitangent = normalize(cross(spiralDir, tangent));
  float flowSpeed = snoise(spiralDir * 2.0 + uTime * 0.15 + aPhase * 20.0);
  float flowSpeed2 = snoise(spiralDir * 2.0 + uTime * 0.12 + aPhase * 30.0 + 77.0);
  surfacePos += tangent * flowSpeed * 0.03 + bitangent * flowSpeed2 * 0.02;

  vec3 freePos = spiralDir * (blobRadius + (r - 0.9) * 0.15);
  vec3 pos = mix(freePos, surfacePos, attraction);

  pos += dir * uImpulse * 0.05;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  float surfaceAlpha = 0.55 + 0.2 * abs(flowSpeed);
  float freeAlpha = 0.0;
  vAlpha = mix(freeAlpha, surfaceAlpha, attraction);
  vGold = aGold;

  gl_PointSize = aSize * (35.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}
`;

const streakVert = /* glsl */ `
${snoise3D}
${blobDisplaceFn}

uniform float uTime;
uniform float uImpulse;
uniform float uClickType;
uniform float uClickSeed;
uniform float uVisibleLayer;
uniform vec3 uClickDir;
uniform float uClickMode;
uniform float uFormation;

attribute float aPhase;
attribute float aAlphaBase;
attribute float aSize;
attribute float aStreakId;
attribute float aDepthLayer;
attribute float aLayerType;

varying float vAlpha;
varying float vLayerType;
varying float vGolden;

void main() {
  vLayerType = aLayerType;
  vGolden = 0.0;

  float debugType = aLayerType > 4.5 ? 4.0 : aLayerType;
  if (uVisibleLayer > 0.5 && abs(debugType - uVisibleLayer) > 0.5) {
    gl_PointSize = 0.0;
    gl_Position = vec4(0.0);
    vAlpha = 0.0;
    return;
  }

  vec3 dir = normalize(position);
  vec3 pos;
  vec3 noiseDir;

  bool isContourFamily = (aLayerType > 1.5 && aLayerType < 2.5) || aLayerType > 4.5;
  if (isContourFamily) {
    float rotAngle = uTime * 0.02;
    float rc = cos(rotAngle);
    float rs = sin(rotAngle);
    float tiltAngle = uTime * 0.008;
    float rct = cos(tiltAngle);
    float rst = sin(tiltAngle);
    vec3 rotDir = vec3(
      dir.x * rc - dir.z * rs,
      dir.y * rct + (dir.x * rs + dir.z * rc) * rst * 0.2,
      (dir.x * rs + dir.z * rc) * rct - dir.y * rst * 0.2
    );
    rotDir = normalize(rotDir);
    float blobR = getBlobRadius(rotDir, uTime) * aDepthLayer * uFormation;

    if (uImpulse > 0.01) {
      float facing = dot(rotDir, uClickDir);
      float n3 = snoise(rotDir * 0.6 + uClickSeed) * uImpulse * 1.2;
      if (uClickMode < 0.0) {
        float fleeZone = smoothstep(0.1, 0.95, facing);
        blobR += n3 * (1.0 - fleeZone);
        blobR -= uImpulse * 0.35 * fleeZone;
      } else {
        float expandWeight = smoothstep(-0.6, 1.0, facing);
        blobR += n3 * expandWeight;
      }
    }

    vec3 worldPos = rotDir * blobR;
    pos = vec3(worldPos.xy, 0.0);
    noiseDir = rotDir;
  } else {
    float rotSpeed = 0.02 + aStreakId * 0.001;
    float rotAngle = uTime * rotSpeed + aStreakId * 0.7;
    float c = cos(rotAngle);
    float s = sin(rotAngle);
    float tiltAngle = uTime * rotSpeed * 0.4 + aStreakId * 1.3;
    float ct = cos(tiltAngle);
    float st = sin(tiltAngle);
    vec3 finalDir = vec3(
      dir.x * c - dir.z * s,
      dir.y * ct + (dir.x * s + dir.z * c) * st * 0.2,
      (dir.x * s + dir.z * c) * ct - dir.y * st * 0.2
    );
    finalDir = normalize(finalDir);
    float blobR = getBlobRadius(finalDir, uTime) * aDepthLayer * uFormation;

    if (uImpulse > 0.01) {
      float facing = dot(finalDir, uClickDir);
      float n3 = snoise(finalDir * 0.6 + uClickSeed) * uImpulse * 1.2;
      if (uClickMode < 0.0) {
        float fleeZone = smoothstep(0.1, 0.95, facing);
        blobR += n3 * (1.0 - fleeZone);
        blobR -= uImpulse * 0.35 * fleeZone;
      } else {
        float expandWeight = smoothstep(-0.6, 1.0, facing);
        blobR += n3 * expandWeight;
      }
    }

    pos = finalDir * blobR;
    noiseDir = finalDir;
  }

  float globalFacing = dot(normalize(pos), uClickDir);
  float expandWeight = smoothstep(-0.6, 1.0, globalFacing);
  pos += normalize(pos) * uImpulse * 0.06 * expandWeight;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  float visibility = snoise(noiseDir * 2.0 + uTime * 0.12 + aStreakId * 17.0);
  float flicker = smoothstep(-0.2, 0.3, visibility);
  float depthFade = 0.5 + aDepthLayer * 0.5;

  if (aLayerType > 1.5 && aLayerType < 2.5) {
    vAlpha = aAlphaBase;
  } else {
    vAlpha = aAlphaBase * flicker * depthFade;
  }

  if (aLayerType < 1.5) {
    vec3 viewDir = normalize(cameraPosition - pos);
    float facing = abs(dot(normalize(pos), viewDir));
    float rim = 1.0 - facing;
    vAlpha *= smoothstep(0.05, 0.85, rim);
  }

  float goldZone = smoothstep(-0.1, 0.6, pos.x / 0.9);
  float goldVertical = 1.0 - abs(pos.y / 0.9) * 0.5;
  vGolden = goldZone * goldVertical;

  gl_PointSize = aSize * (35.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}
`;

const particleFrag = /* glsl */ `
varying float vAlpha;
varying float vGold;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
  vec3 color = mix(vec3(0.7), vec3(0.788, 0.659, 0.298), vGold);
  gl_FragColor = vec4(color, alpha);
}
`;

const streakFrag = /* glsl */ `
varying float vAlpha;
varying float vLayerType;
varying float vGolden;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;

  float alpha;
  if (vLayerType > 1.5 && vLayerType < 3.5) {
    alpha = smoothstep(0.5, 0.25, dist) * vAlpha;
  } else {
    alpha = step(dist, 0.35) * vAlpha;
  }

  vec3 baseColor = vec3(0.8);
  vec3 goldColor = vec3(0.85, 0.7, 0.32);
  vec3 color = mix(baseColor, goldColor, vGolden * 0.55);

  gl_FragColor = vec4(color, alpha);
}
`;

function DustCloud({
  count,
  timeRef,
  impulseRef,
}: {
  count: number;
  timeRef: React.RefObject<number>;
  impulseRef: React.RefObject<number>;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, phases, golds, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const gl = new Float32Array(count);
    const sz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.93 + Math.random() * 0.04;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      ph[i] = Math.random();
      gl[i] = Math.random() < 0.08 ? 0.5 + Math.random() * 0.5 : 0.0;

      sz[i] = 0.03 + Math.random() * 0.06;
    }

    return { positions: pos, phases: ph, golds: gl, sizes: sz };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uImpulse: { value: 0 },
  }), []);

  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = timeRef.current;
    matRef.current.uniforms.uImpulse.value = impulseRef.current;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aGold" args={[golds, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={dustVert}
        fragmentShader={particleFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

function StreakParticles({
  timeRef,
  impulseRef,
  clickTypeRef,
  clickSeedRef,
  visibleLayerRef,
  clickDirRef,
  clickModeRef,
  formationRef,
}: {
  timeRef: React.RefObject<number>;
  impulseRef: React.RefObject<number>;
  clickTypeRef: React.RefObject<number>;
  clickSeedRef: React.RefObject<number>;
  visibleLayerRef: React.RefObject<number>;
  clickDirRef: React.RefObject<THREE.Vector3>;
  clickModeRef: React.RefObject<number>;
  formationRef: React.RefObject<number>;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, alphas, sizes, phases, streakIds, depthLayers, layerTypes } = useMemo(() => {
    const pos: number[] = [];
    const alp: number[] = [];
    const sz: number[] = [];
    const ph: number[] = [];
    const sid: number[] = [];
    const dl: number[] = [];
    const lt: number[] = [];

    let streakId = 0;

    const skinCount = 95000;
    for (let i = 0; i < skinCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.9 + (Math.random() - 0.5) * 0.025;

      pos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      alp.push(0.7 + Math.random() * 0.3);
      sz.push(0.05 + Math.random() * 0.07);
      ph.push(Math.random());
      sid.push(0);
      dl.push(1.0);
      lt.push(1.0);
    }

    streakId = 1;

    const haloLayers = 20;
    const maxHaloSpread = 0.126;
    const addHalo = (x: number, y: number, z: number, fade: number, alphaCore: number, depth: number, id: number, haloType = 4.0) => {
      for (let h = 0; h < haloLayers; h++) {
        const haloT = (h + 1) / haloLayers;
        const spread = haloT * maxHaloSpread;
        const haloAlpha = fade * alphaCore * Math.pow(1.0 - haloT, 2.5) * 1.2;

        const ox = (Math.random() - 0.5) * spread * 2;
        const oy = (Math.random() - 0.5) * spread * 2;
        const oz = (Math.random() - 0.5) * spread * 2;

        pos.push(x + ox, y + oy, z + oz);
        alp.push(haloAlpha);
        sz.push(0.03 + Math.random() * 0.06);
        ph.push(Math.random());
        sid.push(id);
        dl.push(depth);
        lt.push(haloType);
      }
    };

    const rimExtraCount = 85000;
    for (let i = 0; i < rimExtraCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.52;
      const r = 0.9 + (Math.random() - 0.5) * 0.018;

      pos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      alp.push(0.8 + Math.random() * 0.2);
      sz.push(0.04 + Math.random() * 0.05);
      ph.push(Math.random());
      sid.push(0);
      dl.push(1.0);
      lt.push(1.0);
    }

    const ultraRimCount = 75000;
    for (let i = 0; i < ultraRimCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.174;
      const r = 0.9 + (Math.random() - 0.5) * 0.012;

      pos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      alp.push(0.85 + Math.random() * 0.15);
      sz.push(0.03 + Math.random() * 0.04);
      ph.push(Math.random());
      sid.push(0);
      dl.push(1.0);
      lt.push(1.0);
    }

    const smallCount = Math.random() < 0.5 ? 1 : 2;
    const refletDefs: { ppl: number; depth: number; alphaCore: number; curled: boolean }[] = [
      { ppl: 1200, depth: 0.95, alphaCore: 1.0, curled: false },
      { ppl: 300 + Math.floor(Math.random() * 150), depth: 0.95, alphaCore: 0.85, curled: true },
    ];
    if (smallCount === 2) {
      refletDefs.push({ ppl: 250 + Math.floor(Math.random() * 150), depth: 0.75, alphaCore: 0.75, curled: true });
    }

    for (const ref of refletDefs) {
      {
        let theta = Math.random() * Math.PI * 2;
        let phi = ref.curled
          ? Math.PI / 2 + (Math.random() - 0.5) * 0.8
          : Math.acos(2 * Math.random() - 1);
        const dTheta = ref.curled
          ? (0.015 + Math.random() * 0.01) * (Math.random() > 0.5 ? 1 : -1)
          : (0.004 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1);
        const dPhiBias = ref.curled
          ? (0.005 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1)
          : (Math.random() - 0.5) * 0.002;
        const refletPPL = ref.ppl;

        for (let p = 0; p < refletPPL; p++) {
          const t = p / refletPPL;
          const r = 0.9;

          const x = r * Math.sin(phi) * Math.cos(theta);
          const y = r * Math.sin(phi) * Math.sin(theta);
          const z = r * Math.cos(phi);

          const fade = Math.sin(t * Math.PI);

          pos.push(x, y, z);
          alp.push(fade * ref.alphaCore);
          sz.push(0.35 + Math.random() * 0.05);
          ph.push(Math.random());
          sid.push(streakId);
          dl.push(ref.depth);
          lt.push(3.0);

          addHalo(x, y, z, fade, ref.alphaCore, ref.depth, streakId, 4.0);

          theta += dTheta;
          phi += dPhiBias + (Math.random() - 0.5) * 0.0005;
          phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi));
        }
        streakId++;
      }
    }

    return {
      positions: new Float32Array(pos),
      alphas: new Float32Array(alp),
      sizes: new Float32Array(sz),
      phases: new Float32Array(ph),
      streakIds: new Float32Array(sid),
      depthLayers: new Float32Array(dl),
      layerTypes: new Float32Array(lt),
    };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uImpulse: { value: 0 },
    uClickType: { value: 0 },
    uClickSeed: { value: 0 },
    uVisibleLayer: { value: 0 },
    uClickDir: { value: new THREE.Vector3(0, 0, 1) },
    uClickMode: { value: 1.0 },
    uFormation: { value: 0 },
  }), []);

  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = timeRef.current;
    matRef.current.uniforms.uImpulse.value = impulseRef.current;
    matRef.current.uniforms.uClickType.value = clickTypeRef.current;
    matRef.current.uniforms.uClickSeed.value = clickSeedRef.current;
    matRef.current.uniforms.uVisibleLayer.value = visibleLayerRef.current;
    matRef.current.uniforms.uClickDir.value.copy(clickDirRef.current);
    matRef.current.uniforms.uClickMode.value = clickModeRef.current;
    matRef.current.uniforms.uFormation.value = formationRef.current;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aAlphaBase" args={[alphas, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aStreakId" args={[streakIds, 1]} />
        <bufferAttribute attach="attributes-aDepthLayer" args={[depthLayers, 1]} />
        <bufferAttribute attach="attributes-aLayerType" args={[layerTypes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={streakVert}
        fragmentShader={streakFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

function BlobScene() {
  const timeRef = useRef(0);
  const impulseRef = useRef(0);
  const clickTypeRef = useRef(0);
  const visibleLayerRef = useRef(0);
  const clickDirRef = useRef(new THREE.Vector3(0, 0, 1));
  const clickModeRef = useRef(1.0);
  const formationRef = useRef(0);
  const { gl, camera } = useThree();

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const blobSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.95), []);

  const zoomDoneRef = useRef(false);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    timeRef.current = (timeRef.current + delta) % 10000;

    if (formationRef.current < 0.999) {
      formationRef.current += (1.0 - formationRef.current) * 1.5 * delta;
    } else {
      formationRef.current = 1;
    }

    const win = window as any;
    const sp = win.__scrollProgress;
    const dezoom = win.__blobDezoom;
    const targetZ = win.__blobTargetZ;

    if (sp) {
      const raw = Math.min(1, Math.max(0, (sp.current - 0.03) / 0.77));
      const progress = raw * raw;
      camera.position.z = 2.8 - progress * 2.7;
      zoomDoneRef.current = progress >= 1;
    } else if (dezoom?.active) {
      camera.position.z += (2.8 - camera.position.z) * 3.5 * delta;
      win.__blobDezoomProgress = Math.min(1, (camera.position.z - 0.1) / 2.7);
      if (camera.position.z > 2.75) {
        camera.position.z = 2.8;
        dezoom.active = false;
        zoomDoneRef.current = false;
        win.__blobDezoomProgress = 1;
        dezoom.onComplete?.();
      }
    } else if (targetZ !== undefined) {
      camera.position.z = targetZ;
      zoomDoneRef.current = true;
    }

    impulseRef.current *= 0.978;
    if (impulseRef.current < 0.005) {
      impulseRef.current = 0;
      clickTypeRef.current = 0;
    }
  });

  const clickSeedRef = useRef(0);
  const handleClick = useCallback((e: MouseEvent) => {
    if (zoomDoneRef.current) return;

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);
    const ray = raycaster.ray;
    const hitPoint = new THREE.Vector3();
    const hit = ray.intersectSphere(blobSphere, hitPoint);

    if (hit) {
      clickDirRef.current.copy(hitPoint).normalize();
      clickModeRef.current = 1.0;
    } else {
      const closest = new THREE.Vector3();
      ray.closestPointToPoint(new THREE.Vector3(0, 0, 0), closest);
      clickDirRef.current.copy(closest).normalize();
      clickModeRef.current = -1.0;
    }

    clickTypeRef.current = 2;
    clickSeedRef.current = Math.random() * 1000.0;
    impulseRef.current = 1.0;
  }, [gl, camera, raycaster, blobSphere]);

  useEffect(() => {
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [handleClick]);

  useEffect(() => {
    const labels = ["ALL", "PEAU (skin)", "CONTOUR", "REFLETS", "HALO"];
    const handleKey = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (key >= 0 && key <= 4) {
        visibleLayerRef.current = key;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <StreakParticles timeRef={timeRef} impulseRef={impulseRef} clickTypeRef={clickTypeRef} clickSeedRef={clickSeedRef} visibleLayerRef={visibleLayerRef} clickDirRef={clickDirRef} clickModeRef={clickModeRef} formationRef={formationRef} />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.5}
          luminanceSmoothing={0.9}
          intensity={0.15}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export default function Blob() {
  const [ready, setReady] = useState(false);

  return (
    <div
      className="fixed inset-0 z-0 transition-opacity duration-500"
      style={{ opacity: ready ? 1 : 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, 2.8], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))}
      >
        <BlobScene />
      </Canvas>
    </div>
  );
}
