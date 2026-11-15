// The finishing pass. The world is drawn into an HDR, multisampled target; this turns it into the
// picture on screen: bloom from the bright parts, filmic tone mapping, a little lens fringe,
// vignette and grain, plus the full-screen states of play (flash blindness, pain, the scope).

import * as THREE from 'three';

const VERT = 'varying vec2 uv_; void main(){ uv_ = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = `varying vec2 uv_; uniform sampler2D map;
  void main(){ vec3 c = texture2D(map, uv_).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(1.0, 2.2, l), 1.0); }`;

const BLUR = `varying vec2 uv_; uniform sampler2D map; uniform vec2 step_;
  void main(){ vec3 c = texture2D(map, uv_).rgb * 0.227;
    c += (texture2D(map, uv_ + step_ * 1.38).rgb + texture2D(map, uv_ - step_ * 1.38).rgb) * 0.316;
    c += (texture2D(map, uv_ + step_ * 3.23).rgb + texture2D(map, uv_ - step_ * 3.23).rgb) * 0.07;
    gl_FragColor = vec4(c, 1.0); }`;

const FINAL = `varying vec2 uv_; uniform sampler2D map; uniform sampler2D bloom;
  uniform float time, flash, hurt, scope, aspect;
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 d = uv_ - 0.5; float r2 = dot(d, d);
    vec3 c = vec3(texture2D(map, uv_ - d * r2 * 0.012).r, texture2D(map, uv_).g, texture2D(map, uv_ + d * r2 * 0.012).b);
    c += texture2D(bloom, uv_).rgb * 0.55;
    c *= 1.0 - r2 * 0.75;                               // vignette
    c = aces(c * 1.05);
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), -0.12); // a touch more saturation
    c = pow(c, vec3(1.0 / 2.2));
    c += (hash(uv_ * 900.0 + time) - 0.5) * 0.025;      // grain
    c = mix(c, vec3(0.55, 0.02, 0.0), hurt * smoothstep(0.08, 0.5, r2));
    // The scope: black outside the glass, hairlines across it.
    vec2 s = vec2(d.x * aspect, d.y); float sr = length(s);
    float glass = 1.0 - smoothstep(0.445, 0.455, sr);
    float hair = step(abs(s.x), 0.0012) + step(abs(s.y), 0.0012);
    c = mix(c, c * glass * (1.0 - min(1.0, hair) * 0.9), scope);
    gl_FragColor = vec4(mix(c, vec3(1.0), flash), 1.0);
  }`;

export function createPost(renderer) {
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const small = [0, 1].map(() => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const bright = pass(BRIGHT, { map: { value: target.texture } });
  const blur = pass(BLUR, { map: { value: null }, step_: { value: new THREE.Vector2() } });
  const final = pass(FINAL, {
    map: { value: target.texture }, bloom: { value: small[0].texture },
    time: { value: 0 }, flash: { value: 0 }, hurt: { value: 0 }, scope: { value: 0 }, aspect: { value: 1 },
  });

  function draw(material, to) {
    quad.material = material;
    renderer.setRenderTarget(to);
    renderer.render(scene, camera);
  }

  return {
    /** Draw the world into this, then call finish(). */
    target,
    /** Multisampling is the costliest step on a weak GPU: the view turns it off if frames run slow. */
    setSamples(n) {
      target.samples = n;
      target.dispose();
    },
    resize(w, h) {
      target.setSize(w, h);
      for (const t of small) t.setSize(w >> 2, h >> 2);
      final.uniforms.aspect.value = w / h;
    },
    /** flash, hurt and scope are 0..1 strengths of the full-screen states. */
    finish(time, flash, hurt, scope) {
      draw(bright, small[0]);
      blur.uniforms.map.value = small[0].texture;
      blur.uniforms.step_.value.set(1 / small[0].width, 0);
      draw(blur, small[1]);
      blur.uniforms.map.value = small[1].texture;
      blur.uniforms.step_.value.set(0, 1 / small[0].height);
      draw(blur, small[0]);
      const u = final.uniforms;
      u.time.value = time % 10; u.flash.value = flash; u.hurt.value = hurt; u.scope.value = scope;
      draw(final, null);
    },
  };
}
