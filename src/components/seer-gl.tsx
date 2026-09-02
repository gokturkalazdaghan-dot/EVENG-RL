import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform vec2 u_tilt;
varying vec2 v_uv;
varying float v_lit;
void main() {
  float cy = cos(u_tilt.x), sy = sin(u_tilt.x);
  float cp = cos(u_tilt.y), sp = sin(u_tilt.y);
  vec3 p = vec3(a_pos.x, a_pos.y, 0.0);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  p.z -= 2.35;
  gl_Position = vec4(p.xy * (1.72 / -p.z), (p.z + 2.35) * 0.08, 1.0);
  v_uv = a_uv;
  v_lit = 0.86 + p.x * 0.18 - p.y * 0.06;
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying float v_lit;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float vig = smoothstep(1.15, 0.35, length(v_uv - 0.5));
  c.rgb *= v_lit;
  c.rgb = mix(c.rgb, c.rgb * vec3(1.06, 0.96, 1.04), 0.18);
  gl_FragColor = vec4(c.rgb * vig + c.rgb * (1.0 - vig) * 0.92, c.a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

type Handle = { draw: (tiltX: number, tiltY: number, media: HTMLImageElement | HTMLVideoElement) => void; drop: () => void };

function boot(canvas: HTMLCanvasElement): Handle | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0, -1, 1, 0, 0]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "a_pos");
  const aUv = gl.getAttribLocation(prog, "a_uv");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

  const uTilt = gl.getUniformLocation(prog, "u_tilt");
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(tiltX, tiltY, media) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uTilt, tiltX, tiltY);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
      } catch {
        return;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    drop() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}

export function SeerGL({
  still,
  motion,
  waiting,
}: {
  still: string;
  motion: string;
  waiting: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const handle = boot(canvas);
    if (!handle) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const yaw = Math.sin(t * 0.55) * 0.22;
      const pitch = Math.cos(t * 0.7) * 0.08;
      const vid = videoRef.current;
      const media = waiting && vid && vid.readyState >= 2 ? vid : img;
      if (media && (media instanceof HTMLImageElement ? media.complete : true)) {
        handle.draw(yaw, pitch, media);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      handle.drop();
    };
  }, [still, waiting, motion]);

  return (
    <div className="seer-gl">
      <img ref={imgRef} src={still} alt="" className="seer-tex" />
      {waiting ? (
        <video ref={videoRef} src={motion} autoPlay muted loop playsInline className="seer-tex" />
      ) : null}
      <canvas ref={canvasRef} className="seer-gl-canvas" />
    </div>
  );
}
