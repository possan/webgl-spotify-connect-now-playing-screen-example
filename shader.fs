precision mediump float;

varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vEyeVector;

uniform mat4 uMVMatrix2;
uniform mat4 uPMatrix2;

void main(void) {
    vec3 lightDir = normalize(vec3(-0.3, 0.2, 0.1));
    vec3 specular = vNormal * vEyeVector;
    float vspec = 5.0 * pow(max(0.0, dot(reflect(-lightDir, vNormal), vEyeVector)), 3.0);
    float bri = vspec;
    gl_FragColor = vColor + vec4(bri, bri, bri, 0.0);
}
