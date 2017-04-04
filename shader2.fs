precision mediump float;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNoise;

uniform float time;
uniform float fBeat1;
uniform float fBeat2;
uniform float fBeat3;

varying vec4 vPosition;
varying vec2 vTexture;

// inspiration
// https://www.shadertoy.com/view/XdfGDH
// https://www.shadertoy.com/view/4t23Rc
// https://github.com/Jam3/glsl-fast-gaussian-blur/blob/master/13.glsl

// varying vec3 vEyeVector;

// vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
//   vec4 color = vec4(0.0);
//   vec2 off1 = vec2(1.411764705882353) * direction;
//   vec2 off2 = vec2(3.2941176470588234) * direction;
//   vec2 off3 = vec2(5.176470588235294) * direction;
//   color += texture2D(image, uv) * 0.1964825501511404;
//   color += texture2D(image, uv + (off1 / resolution)) * 0.2969069646728344;
//   color += texture2D(image, uv - (off1 / resolution)) * 0.2969069646728344;
//   color += texture2D(image, uv + (off2 / resolution)) * 0.09447039785044732;
//   color += texture2D(image, uv - (off2 / resolution)) * 0.09447039785044732;
//   color += texture2D(image, uv + (off3 / resolution)) * 0.010381362401148057;
//   color += texture2D(image, uv - (off3 / resolution)) * 0.010381362401148057;
//   return color;
// }

// // #ifdef GL_ES
// // precision mediump float;
// // #endif

float normpdf(in float x, in float sigma) {
  return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
}

vec4 blurrr(sampler2D image, vec2 position, float width, float height) {
  const int mSize = 7;
  const int kSize = (mSize-1)/2;
  float kernel[mSize];
  vec3 final_colour = vec3(0.0);

  //create the 1-D kernel
  float sigma = 7.0;
  float Z = 0.0;
  for (int j = 0; j <= kSize; ++j) {
    kernel[kSize+j] = kernel[kSize-j] = normpdf(float(j), sigma);
  }

  // get the normalization factor (as the gaussian has been clamped)
  for (int j = 0; j < mSize; ++j) {
    Z += kernel[j];
  }

    //read out the texels
  for (int i=-kSize; i <= kSize; ++i) {
    for (int j=-kSize; j <= kSize; ++j) {
      final_colour +=
        kernel[kSize+j] * kernel[kSize+i] *
        texture2D(image, (position + (vec2(width * float(i), height * float(j))))).rgb;
    }
  }

  return vec4(final_colour/(Z*Z), 1.0);
}

vec4 rgbShift(in sampler2D tex, in vec2 p, in vec4 shift) {
    shift *= 2.0*shift.w - 1.0;
    vec2 rs = vec2(shift.x,-shift.y);
    vec2 gs = vec2(shift.y,-shift.z);
    vec2 bs = vec2(shift.z,-shift.x);
    float r = texture2D(tex, p+rs, 0.0).x;
    float g = texture2D(tex, p+gs, 0.0).y;
    float b = texture2D(tex, p+bs, 0.0).z;
    return vec4(r,g,b,1.0);
}

vec4 noise( in vec2 p ) {
    return texture2D(tNoise, p, 0.0);
}

vec4 vec4pow( in vec4 v, in float p ) {
    // Don't touch alpha (w), we use it to choose the direction of the shift
    // and we don't want it to go in one direction more often than the other
    return vec4(pow(v.x,p),pow(v.y,p),pow(v.z,p),v.w);
}

#define AMPLITUDE 0.1
#define SPEED 0.05

/*






    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 block = floor(fragCoord.xy / vec2(16));
  vec2 uv_noise = block / vec2(64);
  uv_noise += floor(vec2(iGlobalTime) * vec2(1234.0, 3543.0)) / vec2(64);
  
  float block_thresh = pow(fract(iGlobalTime * 1236.0453), 2.0) * 0.2;
  float line_thresh = pow(fract(iGlobalTime * 2236.0453), 3.0) * 0.7;
  
  vec2 uv_r = uv, uv_g = uv, uv_b = uv;

    // glitch some blocks and lines
  if  (GLITCH && (texture(iChannel1, uv_noise).r < block_thresh ||
    texture(iChannel1, vec2(uv_noise.y, 0.0)).g < line_thresh)) {

    vec2 dist = (fract(uv_noise) - 0.5) * audioEnvelope;
    fragCoord.x -= dist.x * 250.1 * audioEnvelope;
    fragCoord.y -= dist.y * 250.2 * audioEnvelope;
  }


*/

void main(void) {
    vec2 p = vTexture.xy;
    vec4 n1 = vec4pow(noise(vec2(SPEED*time/4999.0 + sin(time/13100.0),2.0*SPEED*time/8000.0+p.y/(10.0-fBeat3*2.0) )),13.0);

    vec2 bp = vTexture.xy + vec2(0, n1.g * 0.2); // vsync problems

    // vec4 col = texture2D(tColor, bp);
    vec4 dep = texture2D(tDepth, bp);

    // col *= col;

    vec4 blurred = blurrr(tColor, bp, 0.003, 0.003);// * abs(0.8 - dep.r));
    // vec4 col2 = texture2D(tColor, ((bp - vec2(0.5,0.5)) * vec2(0.998 + 0.03 * fBeat1,1.0 + 0.003 * fBeat1)) + vec2(0.5 + 0.01 * dep.r * fBeat1,0.5));
    // vec4 col3 = texture2D(tColor, ((bp - vec2(0.5,0.5)) * vec2(1.002 + 0.03 * fBeat1,1.0 + 0.003 * fBeat1)) + vec2(0.503 - 0.01 * dep.r * fBeat2,0.5));
    vec4 o = vec4(0.0, 0.0, 0.0, 1.0);

    float fb = (fBeat3 * fBeat2) + n1.g + 0.3 * sin(time / 3791.0);
    float ifb = 1.0 - fb;

    vec4 shift =
      vec4pow(noise(vec2(SPEED*time/7000.0 + p.x / 300.0,2.0*SPEED*time/9000.0+p.y/(25.0-fBeat1*5.0) )), 13.0)
      * fBeat1
      * vec4(AMPLITUDE, AMPLITUDE, AMPLITUDE, 1.0);

    o += rgbShift(tColor, p, shift) * ifb;
    o += blurred * fb;
    o += blurred * (0.04 + fBeat3 * 0.1); // always a little blur
    o -= texture2D(tNoise, (p + bp) * 5.0 + vec2(time / 700.0, time / 90.0)).r * vec4(1.0,1.0,1.0,1.0) * n1.g * n1.r;
    o *= (1.0 + 3.0 * texture2D(tNoise, (p + bp) * 9.0 + vec2(0, time / 19.0)).r * n1.b);

    vec2 pc = 1.0 * (p - vec2(0.5, 0.5));
    pc *= pc;
    float l = length(pc);

    // o *= vec4(1.0,1.0,1.0,1.0) * (1.0 - l * 5.0);
    o *= vec4(1.0,1.0,1.0,1.0) * (1.0 - l * 3.0);

    // o += vec4(0.1, 0.1, 0.1, 1.0) * (1.0 - l * 7.0) * texture2D(tNoise, (p + bp) * 9.0 + vec2(0, time / 19.0)).r;

    gl_FragColor = o;
}
