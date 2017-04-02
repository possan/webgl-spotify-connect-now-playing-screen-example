precision mediump float;

uniform sampler2D tColor;
uniform sampler2D tDepth;

varying vec4 vPosition;
varying vec2 vTexture;
// varying vec3 vEyeVector;

uniform float fBeat1;
uniform float fBeat2;
uniform float fBeat3;

// From https://github.com/Jam3/glsl-fast-gaussian-blur/blob/master/13.glsl
vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.411764705882353) * direction;
  vec2 off2 = vec2(3.2941176470588234) * direction;
  vec2 off3 = vec2(5.176470588235294) * direction;
  color += texture2D(image, uv) * 0.1964825501511404;
  color += texture2D(image, uv + (off1 / resolution)) * 0.2969069646728344;
  color += texture2D(image, uv - (off1 / resolution)) * 0.2969069646728344;
  color += texture2D(image, uv + (off2 / resolution)) * 0.09447039785044732;
  color += texture2D(image, uv - (off2 / resolution)) * 0.09447039785044732;
  color += texture2D(image, uv + (off3 / resolution)) * 0.010381362401148057;
  color += texture2D(image, uv - (off3 / resolution)) * 0.010381362401148057;
  return color;
}

// #ifdef GL_ES
// precision mediump float;
// #endif

// blur via https://www.shadertoy.com/view/XdfGDH
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

void main(void) {
    // vec3 lightDir = normalize(vec3(-0.3, 0.2, 0.1));
    // vec3 specular = vNormal * vEyeVector;
    // float vspec = 5.0 * pow(max(0.0, dot(reflect(-lightDir, vNormal), vEyeVector)), 3.0);
    // float bri = vspec;

    vec4 col = texture2D(tColor, vTexture.xy);
    vec4 dep = texture2D(tDepth, vTexture.xy);

    // vec4 col = blur13(tColor, vTexture.xy, vec2(0.1, 0.1), vec2(1.0, 0.0));

    // vec4 o = vec4(0.0, vPosition.x / 10.0, vPosition.y / 10.0, 1.0) + col;
    // o = vec4(o.r, o.g, o.b, 1.0);
    // o = vec4(dep.r, 0.0, 0.0, 1.0);

    float foc = max(0.0, min(1.0,  1.0 - (3.0 * abs(0.5 - dep.r))));

    vec4 blurred = blurrr(tColor, vTexture.xy, 0.008, 0.004);// * abs(0.8 - dep.r));

    vec4 o = vec4(0.0, 0.0, 0.0, 1.0);

    vec4 col2 = texture2D(tColor, ((vTexture.xy - vec2(0.5,0.5)) * vec2(0.998 + 0.003 * fBeat1,1.0 + 0.003 * fBeat1)) + vec2(0.5 + 0.001 * fBeat1,0.5));
    vec4 col3 = texture2D(tColor, ((vTexture.xy - vec2(0.5,0.5)) * vec2(1.002 + 0.003 * fBeat1,1.0 + 0.003 * fBeat1)) + vec2(0.503 - 0.0015 * fBeat2,0.5));

    o = vec4(col2.r, col.g, col3.b, 1.0);

    // o += col;// * (1.0 - dep.r * 0.3);

    o += blurred * ( foc + fBeat1 * 0.3 );
    // o /= 2.0;

    // foc = dep.r;

    // o += vec4(col2.r, col2.g, col3.b, 1.0);// * col3;

    gl_FragColor = o;
}
