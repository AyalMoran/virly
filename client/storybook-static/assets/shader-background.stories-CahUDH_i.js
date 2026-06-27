import{r as v,j as y}from"./iframe-DZ5yRNij.js";import"./preload-helper-C1FmrZbK.js";const C=`
  attribute vec4 aVertexPosition;
  void main() {
    gl_Position = aVertexPosition;
  }
`,A=`
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;

  const float overallSpeed = 0.015;
  const float gridSmoothWidth = 0.015;
  const float axisWidth = 0.05;
  const float majorLineWidth = 0.025;
  const float minorLineWidth = 0.0125;
  const float majorLineFrequency = 5.0;
  const float minorLineFrequency = 1.0;
  const float scale = 5.0;
  const vec4 lineColor = vec4(0.21, 0.52, 0.56, 1.0);
  const float minLineWidth = 0.001;
  const float maxLineWidth = 0.02;
  const float lineSpeed = 1.0 * overallSpeed;
  const float lineAmplitude = 1.0;
  const float lineFrequency = 0.9;
  const float warpSpeed = 0.2 * overallSpeed;
  const float warpFrequency = 0.5;
  const float warpAmplitude = 1.0;
  const float offsetFrequency = 0.5;
  const float offsetSpeed = 1.33 * overallSpeed;
  const float minOffsetSpread = 0.6;
  const float maxOffsetSpread = 2.0;
  const int linesPerGroup = 16;

  #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
  #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
  #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
  #define drawPeriodicLine(freq, width, t) drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - (freq) / 2.0))

  float drawGridLines(float axis) {
    return drawCrispLine(0.0, axisWidth, axis)
          + drawPeriodicLine(majorLineFrequency, majorLineWidth, axis)
          + drawPeriodicLine(minorLineFrequency, minorLineWidth, axis);
  }

  float drawGrid(vec2 space) {
    return min(1.0, drawGridLines(space.x) + drawGridLines(space.y));
  }

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec4 fragColor;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

    space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
    space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

    vec4 lines = vec4(0.0);
    vec4 bgColor1 = vec4(0.07, 0.22, 0.25, 1.0);
    vec4 bgColor2 = vec4(0.76, 0.82, 0.60, 1.0);

    for(int l = 0; l < linesPerGroup; l++) {
      float normalizedLineIndex = float(l) / float(linesPerGroup);
      float offsetTime = iTime * offsetSpeed;
      float offsetPosition = float(l) + space.x * offsetFrequency;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);
      float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
      float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

      line = line + circle;
      lines += line * lineColor * rand;
    }

    fragColor = mix(bgColor1, bgColor2, uv.x);
    fragColor *= verticalFade;
    fragColor.a = 1.0;
    fragColor += lines;

    gl_FragColor = fragColor;
  }
`;function g(o,i,e){const t=o.createShader(i);return t?(o.shaderSource(t,e),o.compileShader(t),o.getShaderParameter(t,o.COMPILE_STATUS)?t:(console.error("Shader compile error:",o.getShaderInfoLog(t)),o.deleteShader(t),null)):null}function b(o,i,e){const t=g(o,o.VERTEX_SHADER,i),a=g(o,o.FRAGMENT_SHADER,e);if(!t||!a)return null;const r=o.createProgram();return r?(o.attachShader(r,t),o.attachShader(r,a),o.linkProgram(r),o.getProgramParameter(r,o.LINK_STATUS)?r:(console.error("Shader program link error:",o.getProgramInfoLog(r)),o.deleteProgram(r),null)):null}function x(){const o=v.useRef(null);return v.useEffect(()=>{const i=o.current;if(!i)return;const e=i.getContext("webgl");if(!e){console.warn("WebGL not supported.");return}const t=b(e,C,A),a=e.createBuffer();if(!t||!a)return;e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);const r={program:t,attribLocations:{vertexPosition:e.getAttribLocation(t,"aVertexPosition")},uniformLocations:{resolution:e.getUniformLocation(t,"iResolution"),time:e.getUniformLocation(t,"iTime")}},s=window.matchMedia("(prefers-reduced-motion: reduce)"),F=Date.now();let n=0;const c=()=>{const P=(Date.now()-F)/1e3;e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(r.program),e.uniform2f(r.uniformLocations.resolution,i.width,i.height),e.uniform1f(r.uniformLocations.time,P),e.bindBuffer(e.ARRAY_BUFFER,a),e.vertexAttribPointer(r.attribLocations.vertexPosition,2,e.FLOAT,!1,0,0),e.enableVertexAttribArray(r.attribLocations.vertexPosition),e.drawArrays(e.TRIANGLE_STRIP,0,4)},u=()=>{c(),n=requestAnimationFrame(u)},l=()=>{i.width=window.innerWidth,i.height=window.innerHeight,e.viewport(0,0,i.width,i.height),n===0&&c()};window.addEventListener("resize",l),l();const f=()=>{cancelAnimationFrame(n),n=0},h=()=>{n===0&&!document.hidden&&!s.matches&&(n=requestAnimationFrame(u))},m=()=>{s.matches?(f(),c()):h()},p=()=>{document.hidden?f():h()};return document.addEventListener("visibilitychange",p),s.addEventListener("change",m),m(),()=>{f(),document.removeEventListener("visibilitychange",p),s.removeEventListener("change",m),window.removeEventListener("resize",l),e.deleteBuffer(a),e.deleteProgram(t)}},[]),y.jsx("canvas",{ref:o,"aria-hidden":"true",className:"shader-background-canvas fixed left-0 top-0 h-full w-full"})}x.__docgenInfo={description:"",methods:[],displayName:"ShaderBackground"};const W={title:"Layout/ShaderBackground",component:x,parameters:{layout:"fullscreen",docs:{description:{component:`The app's full-screen WebGL backdrop. It stops its animation loop and paints
a single static frame under reduced motion (active in the catalog), so it
renders a stable frame rather than animating forever.`}}}},d={};var L,S,w;d.parameters={...d.parameters,docs:{...(L=d.parameters)==null?void 0:L.docs,source:{originalSource:"{}",...(w=(S=d.parameters)==null?void 0:S.docs)==null?void 0:w.source}}};const E=["Default"];export{d as Default,E as __namedExportsOrder,W as default};
