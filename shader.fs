precision mediump float;

varying vec4 vColor;
varying vec3 vNormal;
varying vec4 vEyeVector;
varying vec4 vEyePosition;

uniform mat4 uMVMatrix2;
uniform mat4 uPMatrix2;
uniform int uWriteDepth;

void main(void) {
    vec3 lightDir = normalize(vec3(-0.3, 0.2, 0.1));
    vec3 specular = vNormal * vEyeVector.xyz;
    float vspec = 5.0 * pow(max(0.0, dot(reflect(-lightDir, vNormal), vEyeVector.xyz)), 3.0);
    float bri = 0.0;
    if (uWriteDepth == 1) {
        gl_FragColor = vec4(vEyePosition.z * 1.0, 1.0, 0.0, 1.0);
    } else {
        gl_FragColor = vColor + vec4(bri, bri, bri, 0.0);
    }
}
