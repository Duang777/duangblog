import * as THREE from 'three';
import { LOGO_LAYERS, type LogoLayer } from './contours';

/**
 * Procedural Duang stacked-ribbon logo from the flat reference.
 * Bezier-fitted silhouettes → smooth ExtrudeGeometry (no pixel stair-steps).
 */

export interface DuangStackedLogoOptions {
  scale?: number;
  depth?: number;
  color?: number;
}

/** 米棕色 */
const IVORY = 0xc4b09a;

function makeIvoryMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.65,
    envMapIntensity: 0.22,
  });
}

function shapeFromCubics(layer: LogoLayer): THREE.Shape {
  const shape = new THREE.Shape();
  const first = layer.cubics[0];
  shape.moveTo(first.p0[0], first.p0[1]);
  for (const c of layer.cubics) {
    shape.bezierCurveTo(c.c1[0], c.c1[1], c.c2[0], c.c2[1], c.p3[0], c.p3[1]);
  }
  shape.closePath();
  return shape;
}

export function createDuangStackedLogoModel(
  options: DuangStackedLogoOptions = {}
): THREE.Group {
  const scale = options.scale ?? 1.0;
  const depth = options.depth ?? 0.3;
  const color = options.color ?? IVORY;

  const root = new THREE.Group();
  root.name = 'duang-stacked-logo';

  const ivory = makeIvoryMaterial(color);
  const nodes: Record<string, THREE.Object3D> = {};
  const layers: THREE.Mesh[] = [];
  const zStagger = 0.04;

  LOGO_LAYERS.forEach((layer, index) => {
    const shape = shapeFromCubics(layer);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.012,
      bevelOffset: 0,
      bevelSegments: 6,
      curveSegments: 64,
    });
    geo.translate(0, 0, -depth / 2 + (1 - index) * zStagger);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, ivory);
    mesh.name = layer.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    nodes[layer.id] = mesh;
    layers.push(mesh);
  });

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  for (const child of root.children) {
    child.position.sub(center);
  }

  root.scale.setScalar(scale * 1.55);

  root.userData.sculptRuntime = {
    nodes,
    sockets: {},
    materials: { ivory },
    layers,
    destructionGroups: LOGO_LAYERS.map((l) => l.id),
    tick: (t: number) => {
      root.rotation.y = Math.sin(t * 0.2) * 0.05;
      root.position.y = Math.sin(t * 0.85) * 0.018;
    },
  };

  return root;
}
