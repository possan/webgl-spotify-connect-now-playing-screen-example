attribute vec3 aVertexPosition;
attribute vec2 aVertexTexture;

varying vec2 vTexture;
varying vec4 vPosition;

void main(void) {
    vPosition = vec4(aVertexPosition, 1);
    vTexture = vec2(aVertexTexture);
    gl_Position = vec4(aVertexPosition, 1); // uPMatrix * uMVMatrix * rotpos;
}
