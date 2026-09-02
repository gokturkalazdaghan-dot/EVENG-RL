import { createKahin, floor } from "@/lib/seer-rig";
import type { OracleKind } from "@/lib/oracle";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function SeerGLB({ pose, waiting }: { pose: OracleKind; waiting: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const poseRef = useRef(pose);
  const waitRef = useRef(waiting);
  poseRef.current = pose;
  waitRef.current = waiting;

  useEffect(() => {
    const host = wrap.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 1.05, 3.15);
    camera.lookAt(0, 0.95, 0);

    scene.add(new THREE.HemisphereLight(0xffe8f2, 0xc9a090, 1.15));
    const key = new THREE.DirectionalLight(0xfff0f6, 1.05);
    key.position.set(1.4, 2.4, 1.8);
    key.castShadow = true;
    scene.add(key);

    const { root, clips } = createKahin();
    scene.add(root);
    scene.add(floor());

    const hips = root.getObjectByName("hips") ?? root;
    const mixer = new THREE.AnimationMixer(hips);
    const actions = Object.fromEntries(clips.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, THREE.AnimationAction>;
    Object.values(actions).forEach((a) => {
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
    });

    let current = "";
    const play = (name: string) => {
      if (current === name || !actions[name]) return;
      actions[name].reset().fadeIn(0.25).play();
      if (current && actions[current]) actions[current].fadeOut(0.25);
      current = name;
    };

    const setSize = () => {
      const w = host.clientWidth || 280;
      const h = host.clientHeight || 260;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(host);

    const clock = new THREE.Clock();
    let x = 0;
    let dir = 1;
    let raf = 0;
    const tick = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const waitingNow = waitRef.current;
      const poseNow = poseRef.current;
      if (waitingNow) play(poseNow === "palm" ? "Palm" : poseNow === "dream" ? "Dream" : "Idle");
      else play("Walk");

      if (!waitingNow) {
        x += dir * dt * 0.55;
        if (x > 0.72) dir = -1;
        if (x < -0.72) dir = 1;
        root.position.x = x;
        root.rotation.y = dir > 0 ? 0.35 : -0.35;
      } else {
        root.rotation.y += (0.15 - root.rotation.y) * 0.04;
      }
      mixer.update(dt);
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      mixer.stopAllAction();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) m.dispose();
      });
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={wrap} className="seer-glb" />;
}
