attribute vec3 aVertexPosition;
attribute vec4 aVertexColor;
attribute vec4 aVertexData1;
attribute vec4 aVertexData2;

uniform float time;
uniform float progress;
uniform float wobble1;
uniform float wobble2;

uniform vec3 eyeVector;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vEyeVector;

float inOutQuint(float t, float b, float c, float d) {
    t /= d;
    float ts = t * t;
    float tc = ts * t;
    return b+c*(6.0*tc*ts + -15.0*ts*ts + 10.0*tc);
}

mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

float snoise(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float progresscurve(float normprog) {
    if (normprog < -2.0) return -1.0;
    if (normprog > 2.0) return 1.0;
    if (normprog >= -2.0 && normprog < -0.5) return inOutQuint( normprog + 2.0, 1.0, -1.0, 1.5 );
    if (normprog > 0.5) return inOutQuint( normprog - 0.5, 0.0, 1.0, 1.5 );
    return 0.0;
}

void main(void) {
    float randomindex = aVertexData1.x;
    float pivot_x = aVertexData1.y;
    float pivot_y = aVertexData1.z;
    float facerandom1 = aVertexData2.x;
    float facerandom2 = aVertexData2.y;
    float facerandom3 = aVertexData2.z;
    float progressrandom = aVertexData1.x;

    float p = progresscurve( progress * 1.0 + progressrandom / 5.0 );

    float w1 = wobble1;
    float w2 = wobble2;

    float z = -1.0 * abs(p);
    float clean_z = z;

    z *= 0.8;
    z += (w1 * aVertexColor.x * facerandom2 / 2.0) * sin(pivot_y * 4.0 + time / 1933.0);
    z += (w2 * aVertexColor.y * facerandom3 / 2.0) * cos(pivot_x * 4.0 + time / 1333.0);

    mat4 localrot = rotationMatrix(vec3(facerandom1 + clean_z, facerandom2, facerandom3), clean_z * 100.0 + p * facerandom2 * 30.0);

    vec4 localpos = vec4(aVertexPosition, 1.0) - vec4(pivot_x, pivot_y, 0, 0);
    vec3 localnorm = vec3(0, 0, 1.0);

    vec4 rotpos = localpos * localrot;
    rotpos += vec4(pivot_x, pivot_y, 0, 0);
    rotpos += vec4(0.0, 0.0, z, 0.0);
    rotpos += vec4(facerandom1 * clean_z / 3.0, facerandom2 * clean_z / 3.0, 0.0, 0.0);

    gl_Position = uPMatrix * uMVMatrix * rotpos;

    float aa = 1.0 - abs(clean_z);

    vColor = aVertexColor * vec4(aa, aa, aa, 1.0);
    vNormal = vec3(vec4(localnorm, 0.0) * localrot);
    vEyeVector = eyeVector;
}
