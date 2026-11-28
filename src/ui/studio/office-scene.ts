import * as T from "three";

export function createStudioScene(container: HTMLElement) {
  const scene = new T.Scene();
  scene.background = new T.Color("#1b252b");
  scene.fog = new T.FogExp2("#1b252b", 0.017);
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.append(renderer.domElement);

  const camera = new T.OrthographicCamera();
  camera.position.set(20, 16, 23);
  const target = new T.Vector3(1, 0.3, 0);
  camera.lookAt(target);
  const room = new T.Group();
  scene.add(room);
  function material(
    color: string,
    roughness = 0.76,
    metalness = 0,
    extra: T.MeshStandardMaterialParameters = {},
  ) {
    return new T.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });
  }
  const wood = material("#73503b"),
    deskTop = material("#ad7650"),
    trim = material("#6a4a35");
  const black = material("#232728"),
    cream = material("#bab59b"),
    gray = material("#626c68");
  const chrome = material("#818684", 0.39, 0.44),
    wall = material("#586865"),
    led = material("#69d6b2", 0.35, 0, {
      emissive: "#52d9ad",
      emissiveIntensity: 1.4,
    });
  const amber = material("#f2ae50", 0.48, 0, {
    emissive: "#ed9d39",
    emissiveIntensity: 1.6,
  });
  function mesh(
    geo: T.BufferGeometry,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    parent = room,
  ) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: T.Material,
    parent = room,
  ) {
    return mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function cyl(
    a: number,
    b: number,
    h: number,
    x: number,
    y: number,
    z: number,
    mat: T.Material,
    parent = room,
  ) {
    return mesh(new T.CylinderGeometry(a, b, h, 18), mat, x, y, z, parent);
  }
  function sphere(
    r: number,
    x: number,
    y: number,
    z: number,
    mat: T.Material,
    parent = room,
  ) {
    return mesh(new T.SphereGeometry(r, 16, 12), mat, x, y, z, parent);
  }
  function at(x: number, y: number, z: number, rotation = 0) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotation;
    room.add(g);
    return g;
  }
  let random = 456;
  function rand() {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  }
  const floorColors = [
    "#89684e",
    "#9c7757",
    "#a58263",
    "#946e51",
    "#9d7858",
    "#805c43",
    "#b38a63",
  ].map((x) => material(x, 0.9));
  box(100, 0.2, 100, 0, -0.55, 0, material("#21292d"));
  box(14.8, 0.45, 10.8, 0, -0.28, 0, wood);
  for (let z = 0; z < 27; z++)
    for (let x = 0; x < 6; x++) {
      const s = (z % 2) * 0.45,
        w = 2.45;
      const m = box(
        w - 0.035,
        0.055,
        0.392,
        -6.14 + x * w,
        -0.02,
        -5.2 + z * 0.398,
        floorColors[Math.floor(rand() * floorColors.length)]!,
      );
      m.position.x += (x > 0 && x < 5 ? s * (x % 2 ? 1 : -1) : 0) * 0.1;
    }
  box(14.8, 4, 0.22, 0, 1.97, -5.45, wall);
  box(0.22, 4, 10.8, -7.4, 1.97, 0, wall);
  box(14.67, 0.22, 0.12, 0, 0.15, -5.3, trim);
  box(0.12, 0.22, 10.65, -7.25, 0.15, 0, trim);
  const windowGlow = material("#deb981", 0.38, 0.04, {
    emissive: "#d99543",
    emissiveIntensity: 0.75,
  });
  for (const x of [-4.9, -1.65, 1.6, 4.85]) {
    box(2.74, 2.28, 0.11, x, 2.46, -5.3, black);
    box(2.54, 2.06, 0.13, x, 2.46, -5.19, windowGlow);
    for (const dx of [-1.23, 0, 1.23])
      box(0.065, 2.1, 0.08, x + dx, 2.46, -5.1, trim);
    box(2.55, 0.09, 0.08, x, 2.62, -5.1, trim);
    for (let i = 0; i < 9; i++)
      box(2.48, 0.018, 0.075, x, 1.51 + i * 0.223, -5.1, trim);
  }
  function paper(base: string, heading: string, ink = "#39362b") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const g = canvas.getContext("2d")!;
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = ink;
    g.font = "bold 42px Arial";
    g.fillText(heading, 32, 63);
    for (let y = 94; y < 230; y += 32) {
      g.fillRect(34, y, 10, 10);
      g.fillRect(63, y + 4, 100 + rand() * 310, 3);
    }
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    return new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide });
  }
  const poster = paper("#b5ac88", "SPARK / 1970");
  mesh(new T.PlaneGeometry(2.5, 1.18), poster, -7.24, 2.65, 1.1).rotation.y =
    Math.PI / 2;
  const pages = paper("#ccb98f", "BUILD NOTES");
  const shipping = paper("#ba8c59", "PARTS");
  const screenMat = paper("#143a32", "SPARK BUILD", "#91dbb2");
  function face(
    r: number,
    h: number,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    p: T.Group,
  ) {
    return mesh(new T.PlaneGeometry(r, h), mat, x, y, z, p);
  }
  function lamp(x: number, z: number, group: T.Group) {
    cyl(0.12, 0.16, 0.045, x, 0.8, z, black, group);
    cyl(0.023, 0.023, 0.42, x, 1.02, z, chrome, group);
    const s = cyl(0.085, 0.225, 0.16, x + 0.05, 1.25, z, cream, group);
    s.rotation.z = 0.19;
    cyl(0.14, 0.14, 0.022, x + 0.047, 1.165, z, amber, group);
  }
  function desk(x: number, z: number, rotate = 0) {
    const g = at(x, 0, z, rotate);
    box(2.05, 0.13, 1.15, 0, 0.71, 0, deskTop, g);
    for (const a of [-0.88, 0.88])
      for (const b of [-0.46, 0.46]) box(0.12, 0.68, 0.1, a, 0.34, b, black, g);
    box(0.55, 0.57, 1.01, -0.69, 0.34, 0, wood, g);
    for (let i = 0; i < 3; i++) {
      box(0.5, 0.15, 0.04, -0.69, 0.14 + i * 0.17, 0.52, deskTop, g);
      box(0.17, 0.017, 0.04, -0.69, 0.157 + i * 0.17, 0.553, chrome, g);
    }
    box(0.87, 0.11, 0.66, 0.02, 0.82, -0.12, black, g);
    box(0.84, 0.62, 0.63, 0.02, 1.15, -0.2, cream, g);
    box(0.72, 0.48, 0.045, 0.02, 1.16, 0.135, black, g);
    face(0.63, 0.36, screenMat, 0.02, 1.17, 0.162, g);
    box(0.69, 0.055, 0.3, 0.03, 0.8, 0.383, cream, g);
    for (let a = 0; a < 10; a++)
      for (let b = 0; b < 3; b++)
        box(
          0.05,
          0.02,
          0.056,
          -0.26 + a * 0.064,
          0.837,
          0.28 + b * 0.077,
          gray,
          g,
        );
    lamp(0.76, -0.31, g);
    const page = face(0.37, 0.32, pages, -0.68, 0.783, 0.27, g);
    page.rotation.x = -Math.PI / 2;
    page.rotation.z = 0.14;
    cyl(0.066, 0.05, 0.1, 0.74, 0.82, 0.2, cream, g);
    const chair = at(x + 0.0, 0.0, z, rotate);
    chair.translateZ(0.94);
    cyl(0.23, 0.31, 0.06, 0, 0.12, 0, chrome, chair);
    cyl(0.035, 0.039, 0.36, 0, 0.29, 0, chrome, chair);
    box(0.65, 0.12, 0.61, 0, 0.48, 0, material("#48635b"), chair);
    box(0.62, 0.49, 0.12, 0, 0.73, 0.28, material("#48635b"), chair);
    return g;
  }
  const skin = material("#c18b66"),
    hair = material("#342e2c"),
    denim = material("#334b57");
  const cloth = ["#8a4b46", "#506c73", "#997247", "#586a4d", "#be9672"].map(
    (x) => material(x),
  );
  function limb(
    a: [number, number, number],
    b: [number, number, number],
    r: number,
    mat: T.Material,
    g: T.Group,
  ) {
    const A = new T.Vector3(...a),
      B = new T.Vector3(...b),
      mid = A.clone().add(B).multiplyScalar(0.5);
    const m = cyl(r, r * 0.93, A.distanceTo(B), mid.x, mid.y, mid.z, mat, g);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      B.sub(A).normalize(),
    );
  }
  function person(
    x: number,
    z: number,
    rotate: number,
    idx: number,
    sitting: boolean,
  ) {
    const g = at(x, 0, z, rotate),
      hip = sitting ? 0.55 : 0.75,
      neck = hip + 0.39;
    const body = sphere(0.24, 0, hip + 0.19, 0, cloth[idx]!, g);
    body.scale.set(1, 0.96, 0.69);
    cyl(0.082, 0.078, 0.12, 0, neck, 0, skin, g);
    const head = sphere(0.151, 0, neck + 0.15, 0, skin, g);
    head.scale.y = 1.2;
    const scalp = sphere(0.153, 0, neck + 0.205, -0.012, hair, g);
    scalp.scale.set(1, 0.64, 0.98);
    sphere(0.04, 0.023, neck + 0.14, 0.145, skin, g);
    for (const s of [-1, 1]) {
      limb(
        [s * 0.12, hip, 0],
        [s * 0.13, sitting ? 0.49 : 0.39, sitting ? 0.34 : 0.025],
        0.082,
        denim,
        g,
      );
      limb(
        [s * 0.13, sitting ? 0.49 : 0.39, sitting ? 0.34 : 0.025],
        [s * 0.14, 0.1, sitting ? 0.38 : 0.055],
        0.061,
        denim,
        g,
      );
      box(0.15, 0.085, 0.24, s * 0.14, 0.064, sitting ? 0.44 : 0.12, black, g);
      limb(
        [s * 0.19, neck - 0.08, 0.01],
        [s * 0.25, hip + 0.15, 0.17],
        0.056,
        cloth[idx]!,
        g,
      );
      limb(
        [s * 0.25, hip + 0.15, 0.17],
        [s * 0.19, hip + 0.19, 0.38],
        0.041,
        skin,
        g,
      );
      sphere(0.05, s * 0.19, hip + 0.19, 0.38, skin, g);
    }
    return g;
  }
  const rust = material("#9d4d34"),
    green = material("#3f6b66"),
    gold = material("#a08b4f");
  function arcade(
    x: number,
    z: number,
    rotate: number,
    paint: T.Material,
    primary: boolean,
  ) {
    const g = at(x, 0, z, rotate);
    const s = new T.Shape();
    s.moveTo(-0.46, 0);
    s.lineTo(0.45, 0);
    s.lineTo(0.45, 0.82);
    s.lineTo(0.59, 1.08);
    s.lineTo(0.23, 1.25);
    s.lineTo(0.13, 2.04);
    s.lineTo(-0.07, 2.25);
    s.lineTo(-0.46, 2.22);
    s.closePath();
    const geom = new T.ExtrudeGeometry(s, {
      depth: 0.79,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    });
    geom.rotateY(-Math.PI / 2);
    geom.translate(0.375, 0, 0);
    mesh(geom, paint, 0, 0, 0, g);
    box(0.72, 0.52, 0.075, 0, 1.61, 0.193, black, g).rotation.x = -0.08;
    box(
      0.59,
      0.36,
      0.09,
      0,
      1.63,
      0.229,
      primary
        ? led
        : material("#426373", 0.5, 0, {
            emissive: "#487790",
            emissiveIntensity: 0.7,
          }),
      g,
    ).rotation.x = -0.08;
    for (let i = 0; i < 5; i++)
      box(
        0.05,
        0.02,
        0.013,
        -0.22 + i * 0.088,
        1.54 + i * 0.038,
        0.284,
        cream,
        g,
      );
    box(0.71, 0.25, 0.06, 0, 2.07, 0.1, primary ? amber : gold, g);
    if (primary) face(0.6, 0.17, paper("#e0ac61", "SPARK"), 0, 2.08, 0.14, g);
    box(0.72, 0.1, 0.36, 0, 1.02, 0.392, cream, g).rotation.x = -0.14;
    cyl(0.017, 0.017, 0.12, -0.22, 1.13, 0.47, chrome, g);
    sphere(0.052, -0.22, 1.2, 0.47, rust, g);
    for (let i = 0; i < 3; i++)
      cyl(
        0.038,
        0.038,
        0.024,
        0.02 + i * 0.105,
        1.086,
        0.46,
        [rust, gold, green][i]!,
        g,
      );
    box(0.22, 0.28, 0.056, 0, 0.51, 0.45, black, g);
    box(0.09, 0.018, 0.062, 0, 0.575, 0.48, chrome, g);
    return g;
  }
  const people: T.Group[] = [];
  desk(-4.96, -3.53, Math.PI);
  people.push(person(-4.98, -2.59, Math.PI, 0, true));
  desk(-2.4, -3.53, Math.PI);
  people.push(person(-2.4, -2.58, Math.PI, 1, true));
  desk(0.17, -3.53, Math.PI);
  people.push(person(0.17, -2.6, Math.PI, 2, true));
  desk(-5.68, 1.19, Math.PI / 2);
  people.push(person(-4.75, 1.16, -Math.PI / 2, 3, true));
  desk(-5.68, 3.69, Math.PI / 2);
  const lab = arcade(4.3, 1.25, -0.28, rust, true);
  const cabinets = [
    lab,
    arcade(6.08, 1.6, -0.3, green, false),
    arcade(5.69, -0.37, -0.08, gold, false),
  ];
  people.push(person(3.39, 2.47, 2.66, 4, false));
  const plank = material("#5c4b3d");
  for (const x of [3.65, 5.75]) {
    box(1.8, 1.89, 0.07, x, 0.95, -4.35, black);
    for (let y = 0.2; y < 1.9; y += 0.44) {
      box(1.8, 0.07, 0.55, x, y, -4.12, plank);
      for (let i = 0; i < 5; i++) {
        const m = box(
          0.21,
          0.18 + rand() * 0.18,
          0.33,
          x - 0.65 + i * 0.31,
          y + 0.17,
          -4.12,
          [wood, gray, cream, rust][i % 4]!,
        );
        m.rotation.y = (rand() - 0.5) * 0.23;
      }
    }
  }
  const rug = material("#4f5f60");
  box(3.6, 0.03, 2.02, 3.48, 0.032, 3.75, rug);
  for (let i = 0; i < 10; i++)
    box(3.41, 0.007, 0.016, 3.48, 0.052, 2.85 + i * 0.19, material("#64777a"));
  for (const [x, z] of [
    [-2.7, 3.4],
    [-2.15, 3.65],
    [6.2, 4.3],
  ] as const) {
    box(0.52, 0.42, 0.51, x, 0.24, z, wood);
    face(0.4, 0.2, shipping, x, 0.26, z + 0.26, room);
  }
  const foliage = material("#5e7954"),
    flowerPot = material("#946348");
  for (const [x, z] of [
    [-6.73, 4.74],
    [-6.55, -1.13],
    [6.88, 4.63],
  ] as const) {
    cyl(0.23, 0.15, 0.4, x, 0.24, z, flowerPot);
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      const m = sphere(
        0.19,
        x + Math.cos(a) * 0.16,
        0.61 + (j % 3) * 0.12,
        z + Math.sin(a) * 0.16,
        foliage,
      );
      m.scale.set(0.6, 1.6, 0.8);
      m.rotation.z = Math.cos(a) * 0.64;
    }
  }
  const daylight = new T.DirectionalLight("#fbc47e", 3.2);
  daylight.position.set(-1, 9, -2);
  daylight.target.position.set(1, 0, 1);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(2048, 2048);
  Object.assign(daylight.shadow.camera, {
    left: -14,
    right: 14,
    top: 14,
    bottom: -14,
    near: 0.1,
    far: 29,
  });
  daylight.shadow.normalBias = 0.045;
  scene.add(daylight, daylight.target);
  scene.add(new T.HemisphereLight("#c7dbe7", "#625042", 1.7));
  const fill = new T.DirectionalLight("#8fbbd3", 1.18);
  fill.position.set(3, 5, 9);
  scene.add(fill);
  const glow = new T.PointLight("#55d6b0", 10, 4, 2);
  glow.position.copy(lab.position).add(new T.Vector3(-0.12, 1.8, 0.52));
  scene.add(glow);

  let initialized = false;
  function draw() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const aspect = width / height;
    const viewHeight = Math.max(13.8, 17 / aspect);
    const viewWidth = viewHeight * aspect;
    Object.assign(camera, {
      left: -viewWidth * 0.54,
      right: viewWidth * 0.46,
      top: viewHeight * 0.52,
      bottom: -viewHeight * 0.48,
      near: 0.1,
      far: 110,
    });
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera);
    initialized = true;
  }
  const observer = new ResizeObserver(draw);
  observer.observe(container);
  return {
    update(teamSize: number, projectCount: number, hasProducts: boolean) {
      people.forEach((person, i) => {
        person.visible = i < teamSize;
      });
      cabinets.forEach((cabinet, i) => {
        cabinet.visible = i < projectCount + Number(hasProducts);
      });
      glow.visible = cabinets[0]!.visible;
      draw();
    },
    dispose() {
      observer.disconnect();
      const materials = new Set<T.Material>();
      scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        object.geometry.dispose();
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(mat);
      });
      for (const mat of materials) {
        if (mat instanceof T.MeshBasicMaterial) mat.map?.dispose();
        mat.dispose();
      }
      if (initialized) daylight.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
