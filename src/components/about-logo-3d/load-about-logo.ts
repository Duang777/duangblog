import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createDuangStackedLogoModel } from "./createDuangStackedLogoModel";

const INITIAL_CAMERA_POS = new THREE.Vector3(0.15, 0.45, 4.6);
const INITIAL_LOOK_AT = new THREE.Vector3(0, 0.05, 0);

type MountOptions = {
  compact?: boolean;
};

function createAboutScene(
  renderer: THREE.WebGLRenderer,
  compact: boolean
): THREE.Scene {
  const scene = new THREE.Scene();
  if (!compact) {
    scene.background = new THREE.Color(0xfaf8f5);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = compact ? 0.28 : 0.32;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfffaf5, 0xe8e0d6, compact ? 0.85 : 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e8, compact ? 1.4 : 1.65);
  key.position.set(3.8, 5.5, 4.2);
  if (!compact) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 6;
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-4, 2.2, 2.5);
  scene.add(fill);

  if (!compact) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.15;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  return scene;
}

/** Mount interactive logo. Returns dispose. */
export function mountAboutLogo(
  container: HTMLElement,
  options: MountOptions = {}
): () => void {
  const compact = options.compact ?? false;
  const width = container.clientWidth;
  const height = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: compact,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  if (compact) {
    renderer.setClearColor(0x000000, 0);
  } else {
    renderer.setClearColor(0xfaf8f5, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = createAboutScene(renderer, compact);
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.copy(INITIAL_CAMERA_POS);
  camera.lookAt(INITIAL_LOOK_AT);

  const logo = createDuangStackedLogoModel({ scale: compact ? 0.72 : 1 });
  if (compact) {
    logo.position.y -= 0.06;
  }
  scene.add(logo);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI * 0.25;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.target.copy(INITIAL_LOOK_AT);

  const resetView = () => {
    camera.position.copy(INITIAL_CAMERA_POS);
    controls.target.copy(INITIAL_LOOK_AT);
    controls.update();
    logo.rotation.set(0, 0, 0);
    logo.position.set(0, 0, 0);
  };

  const onDblClick = (e: MouseEvent) => {
    e.preventDefault();
    resetView();
  };
  container.addEventListener("dblclick", onDblClick);

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 1 || h < 1) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  };

  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  const clock = new THREE.Clock();
  const tick = logo.userData.sculptRuntime?.tick as ((t: number) => void) | undefined;

  renderer.setAnimationLoop(() => {
    const t = clock.elapsedTime;
    tick?.(t);
    controls.update();
    renderer.render(scene, camera);
  });

  return () => {
    container.removeEventListener("dblclick", onDblClick);
    ro.disconnect();
    renderer.setAnimationLoop(null);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    logo.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    scene.environment?.dispose();
  };
}
