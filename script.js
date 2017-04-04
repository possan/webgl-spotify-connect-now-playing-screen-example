// --------------------------------------------------------------------------------------
//
// This is how quick and dirty code looks like, if you're into linting and things, this you better
// leave now...
//
// --------------------------------------------------------------------------------------

// Global all the things/variables!

// auth
var CLIENT_ID = '8da32c6e9f9f4edab31faa41d9f10afd';
var SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state'
];
var accessToken;

// webgl renderer
var gl;
var shaderProgram;
var shaderProgram2;
var mvMatrix = mat4.create();
var pMatrix = mat4.create();
var eyeFrom = vec3.create();
var eyeTo = vec3.create();
var eyeVector = vec3.create();

// webgl objects
var cubeVertexPositionBuffer;
var cubeVertexColorBuffer;
var cubeVertexIndexBuffer;
var cubeVertexData1Buffer;
var cubeVertexData2Buffer;
var lastTrackPositionUpdate = 0;
var firstTime = 0;
var globalTime = 0;
var state = 'blank';
var stateStart = 0;
var beatValue = 0.0;
var beatValue2 = 0.0;
var beatValue4 = 0.0;
var beatDelta = 0.0;
var rttFramebuffer;
var rttTexture;
var rttDepthFramebuffer;
var rttDepthTexture;
var noiseTexture;
var postVertexPositionBuffer;
var postVertexTextureBuffer;
var postVertexIndexBuffer;

// player state
var artistName = '';
var albumImageURL = '';
var albumName = '';
var albumURI = '';
var visibleAlbumURI = '';
var trackedTrackURI = '';
var nextVectorData = null;
var trackDuration = 180000;
var trackURI = '';
var trackPosition = 0;
var trackPlaying = false;
var trackName = '';
var trackAnalysis = null;
var trackBeats = [];
var nextTrackBeat = 0;

// misc ui
var closetimer = 0;



// --------------------------------------------------------------------------------------
// Some polyfills
// --------------------------------------------------------------------------------------

window.requestAnimFrame = (function() {
  return window.requestAnimationFrame ||
         window.webkitRequestAnimationFrame ||
         window.mozRequestAnimationFrame ||
         window.oRequestAnimationFrame ||
         window.msRequestAnimationFrame ||
         function(callback) {
           window.setTimeout(callback, 1000/60);
         };
})();



// --------------------------------------------------------------------------------------
// Network code
// --------------------------------------------------------------------------------------

function createRequest(method, url, onload) {
  var request = new XMLHttpRequest();
  request.open(method, url);
  if (method != 'GET') {
    request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
  }
  request.onerror = function () {};
  request.onload = onload.bind(this, request);
  return request;
}

function requestFile(filename, callback) {
  createRequest('GET', filename + '?cachebust=' + Date.now(), function(request) {
    if (request.status >= 200 && request.status < 400) {
      callback(request.responseText);
    }
  }).send();
}

function createAuthorizedRequest(method, url, onload) {
  var request = createRequest(method, url, onload);
  request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
  return request;
}

function _pollCurrentlyPlaying(callback) {
  createAuthorizedRequest(
    'GET',
    'https://api.spotify.com/v1/me/player/currently-playing',
    function(request) {
      if (request.status < 200 || request.status >= 400) {
        callback();
        return;
      }

      var data = JSON.parse(request.responseText);
      console.log('got data', data);
      if (data.item) {
        albumURI = data.item.album.uri;
        albumImageURL = data.item.album.images[0].url;
        trackName = data.item.name;
        albumName = data.item.album.name;
        artistName = data.item.artists[0].name;
        setNowPlayingTrack(data.item.uri);
        trackPosition = data.progress_ms;
        trackDuration = data.item.duration_ms;
        trackPlaying = data.is_playing
      }
      callback();
    }
  ).send();
}

var pollDebounce = 0;
function pollCurrentlyPlaying(delay) {
  if (pollDebounce) {
    clearTimeout(pollDebounce);
  }
  pollDebounce = setTimeout(
      _pollCurrentlyPlaying.bind(this, pollCurrentlyPlaying.bind(this)),
      delay || 5000);
}

function getUserInformation(callback) {
  createAuthorizedRequest('GET', 'https://api.spotify.com/v1/me', function(request) {
    if (request.status < 200 || request.status >= 400) {
      callback(null);
      return;
    }

    console.log('got data', request.responseText);
    var data = JSON.parse(request.responseText);
    callback(data);
  }).send();
}

function sendPlayCommand(payload) {
  createAuthorizedRequest('PUT', 'https://api.spotify.com/v1/me/player/play', function(request) {
    if (request.status >= 200 && request.status < 400) {
      console.log('play command response', request.responseText);
    }
    pollCurrentlyPlaying(1500);
  }).send(JSON.stringify(payload));
}

function sendCommand(method, command, querystring) {
  console.log('COMMAND: ' + command);
  var url = 'https://api.spotify.com/v1/me/player/' + command + (querystring ? ('?' + querystring) : '');
  createAuthorizedRequest(method, url, function (request) {
    if (request.status >= 200 && request.status < 400) {
      console.log('commant response', request.responseText);
    }
    pollCurrentlyPlaying(1500);
  }).send();
}

function fetchVectors(albumimage, callback) {
  createRequest('POST', 'https://ilovepolygons.possan.se/convert', function (request) {
    if (request.status >= 200 && request.status < 400) {
      nextVectorData = JSON.parse(request.responseText);
      callback();
    }
  }).send('url=' + encodeURIComponent(albumimage) + '&cutoff=10000&threshold=20');
}

function sendPlayContext(uri, offset) {
  sendPlayCommand({
    context_uri: uri,
    offset: {
      position: offset || 0
    }
  });
}



// --------------------------------------------------------------------------------------
// WebGL Rendering code
// --------------------------------------------------------------------------------------

function initWebGL(canvas) {
  try {
    gl = canvas.getContext("webgl", {alpha: true});
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch (e) {}

  if (!gl) {
    alert("Could not initialise WebGL, sorry :-( *sad panda*");
  }

  var downsample = 1; // reduce rendering quality

  function fit() {
    var w = document.body.offsetWidth;
    var h = document.body.offsetHeight;
    canvas.width = Math.floor(w / downsample);
    canvas.height = Math.floor(h / downsample);
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  }

  window.addEventListener('resize', function (r) {
    console.log('window resized.');
    fit();
  });

  fit();
}

function initTextureFramebuffer() {
  rttFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
  rttFramebuffer.width = 1024;
  rttFramebuffer.height = 1024;

  rttTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, rttTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttFramebuffer.width, rttFramebuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  var renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, rttFramebuffer.width, rttFramebuffer.height);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initTextureFramebuffer2() {
  rttDepthFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, rttDepthFramebuffer);
  rttDepthFramebuffer.width = 1024;
  rttDepthFramebuffer.height = 1024;

  rttDepthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, rttDepthTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttDepthFramebuffer.width, rttDepthFramebuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  var renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, rttDepthFramebuffer.width, rttDepthFramebuffer.height);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttDepthTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initNoiseTexture() {
  noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var data = new Uint8Array(128 * 128 * 4);
  for(var j=0; j<128*128*4; j++) {
    data[j] = Math.floor(Math.random() * 255);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

  // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttDepthFramebuffer.width, rttDepthFramebuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function initWebGLShader2(callback) {
  console.log('init shader2...');
  shaderProgram2 = gl.createProgram();
  requestFile('shader2.vs', function (vscode2) {
    requestFile('shader2.fs', function (fscode2) {
      var fragmentShader;
      var vertexShader;

      fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      vertexShader = gl.createShader(gl.VERTEX_SHADER);

      gl.shaderSource(fragmentShader, fscode2);
      gl.compileShader(fragmentShader);
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('Compilation error: ', gl.getShaderInfoLog(fragmentShader));
      }

      gl.shaderSource(vertexShader, vscode2);
      gl.compileShader(vertexShader);
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('Compilation error: ', gl.getShaderInfoLog(vertexShader));
      }

      gl.attachShader(shaderProgram2, vertexShader);
      gl.attachShader(shaderProgram2, fragmentShader);
      gl.linkProgram(shaderProgram2);

      if (!gl.getProgramParameter(shaderProgram2, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
      }

      gl.useProgram(shaderProgram2);

      shaderProgram2.vertexPositionAttribute = gl.getAttribLocation(shaderProgram2, "aVertexPosition");
      shaderProgram2.vertexTextureAttribute = gl.getAttribLocation(shaderProgram2, "aVertexTexture");
      shaderProgram2.tColor = gl.getUniformLocation(shaderProgram2, "tColor");
      shaderProgram2.tDepth = gl.getUniformLocation(shaderProgram2, "tDepth");
      shaderProgram2.tNoise = gl.getUniformLocation(shaderProgram2, "tNoise");

      shaderProgram2.timeUniform = gl.getUniformLocation(shaderProgram2, "time");
      shaderProgram2.beat1Uniform = gl.getUniformLocation(shaderProgram2, "fBeat1");
      shaderProgram2.beat2Uniform = gl.getUniformLocation(shaderProgram2, "fBeat2");
      shaderProgram2.beat3Uniform = gl.getUniformLocation(shaderProgram2, "fBeat3");

      console.log('shader2 done.');
      callback();
    });
  });
}

function initWebGLShader1(callback) {
  console.log('init shader1...');
  shaderProgram = gl.createProgram();
  requestFile('shader.vs', function (vscode) {
    requestFile('shader.fs', function (fscode) {
      var fragmentShader;
      var vertexShader;

      fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      vertexShader = gl.createShader(gl.VERTEX_SHADER);

      gl.shaderSource(fragmentShader, fscode);
      gl.compileShader(fragmentShader);
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('Compilation error: ', gl.getShaderInfoLog(fragmentShader));
      }

      gl.shaderSource(vertexShader, vscode);
      gl.compileShader(vertexShader);
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('Compilation error: ', gl.getShaderInfoLog(vertexShader));
      }

      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);

      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
      }

      gl.useProgram(shaderProgram);

      shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
      shaderProgram.vertexData1Attribute = gl.getAttribLocation(shaderProgram, "aVertexData1");
      shaderProgram.vertexData2Attribute = gl.getAttribLocation(shaderProgram, "aVertexData2");
      shaderProgram.vertexColorAttribute = gl.getAttribLocation(shaderProgram, "aVertexColor");

      shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
      shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
      shaderProgram.pMatrixUniform2 = gl.getUniformLocation(shaderProgram, "uPMatrix2");
      shaderProgram.mvMatrixUniform2 = gl.getUniformLocation(shaderProgram, "uMVMatrix2");

      shaderProgram.eyeVector = gl.getUniformLocation(shaderProgram, "eyeVector");

      shaderProgram.timeUniform = gl.getUniformLocation(shaderProgram, "time");
      shaderProgram.progressUniform = gl.getUniformLocation(shaderProgram, "progress");
      shaderProgram.wobble1Uniform = gl.getUniformLocation(shaderProgram, "wobble1");
      shaderProgram.wobble2Uniform = gl.getUniformLocation(shaderProgram, "wobble2");
      shaderProgram.writeDepthUniform = gl.getUniformLocation(shaderProgram, "uWriteDepth");

      console.log('shader1 done.');
      callback();
    });
  });
}

function setMatrixUniforms() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform2, false, pMatrix);
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform2, false, mvMatrix);
  gl.uniform3f(shaderProgram.eyeVector, false, eyeVector[0], eyeVector[1], eyeVector[2]);
}

function initWebGLBuffers() {
  cubeVertexPositionBuffer = gl.createBuffer();
  cubeVertexColorBuffer = gl.createBuffer();
  cubeVertexIndexBuffer = gl.createBuffer();
  cubeVertexData1Buffer = gl.createBuffer();
  cubeVertexData2Buffer = gl.createBuffer();

  postVertexPositionBuffer = gl.createBuffer();
  postVertexTextureBuffer = gl.createBuffer();
  postVertexIndexBuffer = gl.createBuffer();
}

function updateBuffers(vectordata) {
  var vertices = [];
  var colors = [];
  var cubeVertexIndices = [];
  var verticesdata2 = [];
  var verticesdata3 = [];

  function addFace(x0, y0, x1, y1, x2, y2, r, g, b) {
    var xc = (x0 + x1 + x2) / 3.0;
    var yc = (y0 + y1 + y2) / 3.0;

    var R = 0.0;
    R += xc * 4.0;
    R += -0.05 + Math.random() * 0.1;
    R += r - b;

    var dx = (0.0 - xc);
    var dy = (0.0 - yc);
    var d = Math.sqrt(dx * dx + dy * dy);
    var br = 1.0; // Math.max(0.0, d);

    var rx = -1.0 + Math.random() * 2.0;
    var ry = d * 0.2 + -1.0 + Math.random() * 2.0;
    var rz = d * d; // -1.0 + Math.random() * 2.0;

    // X, Y, 0
    vertices.push(x0);
    vertices.push(y0);
    vertices.push(0.0);

    vertices.push(x1);
    vertices.push(y1);
    vertices.push(0.0);

    vertices.push(x2);
    vertices.push(y2);
    vertices.push(0.0);

    // R, G, B, A
    colors.push(r * br);
    colors.push(g * br);
    colors.push(b * br);
    colors.push(1.0);

    colors.push(r * br);
    colors.push(g * br);
    colors.push(b * br);
    colors.push(1.0);

    colors.push(r * br);
    colors.push(g * br);
    colors.push(b * br);
    colors.push(1.0);

    // Face 1
    cubeVertexIndices.push(cubeVertexIndices.length);
    cubeVertexIndices.push(cubeVertexIndices.length);
    cubeVertexIndices.push(cubeVertexIndices.length);

    // RANDOMINDEX);  PIVOT_X);  PIVOT_Y
    verticesdata2.push(R);
    verticesdata2.push(xc);
    verticesdata2.push(yc);
    verticesdata2.push(0.0);

    verticesdata2.push(R);
    verticesdata2.push(xc);
    verticesdata2.push(yc);
    verticesdata2.push(0.0);

    verticesdata2.push(R);
    verticesdata2.push(xc);
    verticesdata2.push(yc);
    verticesdata2.push(0.0);

    // RANDOMINDEX); PIVOT_X); PIVOT_Y
    verticesdata3.push(rx);
    verticesdata3.push(ry);
    verticesdata3.push(rz);
    verticesdata3.push(0.0);

    verticesdata3.push(rx);
    verticesdata3.push(ry);
    verticesdata3.push(rz);
    verticesdata3.push(0.0);

    verticesdata3.push(rx);
    verticesdata3.push(ry);
    verticesdata3.push(rz);
    verticesdata3.push(0.0);
  }

  if (vectordata) {
    var scale = 1.0 / vectordata.height;
    var xoffset = vectordata.width / 2;
    var yoffset = vectordata.height / 2;
    for (var i = 0; i < vectordata.tris.length; i++) {
      var x = vectordata.tris[i];
      addFace(-((x.x0 + xoffset) * scale - 1.0), -((x.y0 + yoffset) * scale - 1.0), -((x.x1 + xoffset) * scale - 1.0), -((x.y1 + yoffset) * scale - 1.0), -((x.x2 + xoffset) * scale - 1.0), -((x.y2 + yoffset) * scale - 1.0),
              x.r / 255.0, x.g / 255.0, x.b / 255.0);
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  cubeVertexPositionBuffer.itemSize = 3;

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  cubeVertexColorBuffer.itemSize = 4;

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexData1Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verticesdata2), gl.STATIC_DRAW);
  cubeVertexData1Buffer.itemSize = 4;

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexData2Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verticesdata3), gl.STATIC_DRAW);
  cubeVertexData2Buffer.itemSize = 4;

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeVertexIndices), gl.STATIC_DRAW);
  cubeVertexIndexBuffer.numItems = cubeVertexIndices.length;
}

function updatePostBuffer() {
  var vertices = [];
  var texture = [];
  var indices = [];

  var R = 1.0;

  vertices.push(-R)
  vertices.push(-R)
  vertices.push(0)
  texture.push(0.0)
  texture.push(0.0)

  vertices.push( R)
  vertices.push(-R)
  vertices.push(0)
  texture.push(1.0)
  texture.push(0.0)

  vertices.push( R)
  vertices.push( R)
  vertices.push(0)
  texture.push(1.0)
  texture.push(1.0)

  indices.push(indices.length);
  indices.push(indices.length);
  indices.push(indices.length);

  vertices.push(-R)
  vertices.push(-R)
  vertices.push(0)
  texture.push(0.0)
  texture.push(0.0)

  vertices.push(-R)
  vertices.push(R)
  vertices.push(0)
  texture.push(0.0)
  texture.push(1.0)

  vertices.push(R)
  vertices.push(R)
  vertices.push(0)
  texture.push(1.0)
  texture.push(1.0)

  indices.push(indices.length);
  indices.push(indices.length);
  indices.push(indices.length);

  gl.bindBuffer(gl.ARRAY_BUFFER, postVertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  postVertexPositionBuffer.itemSize = 3;

  gl.bindBuffer(gl.ARRAY_BUFFER, postVertexTextureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texture), gl.STATIC_DRAW);
  postVertexTextureBuffer.itemSize = 2;

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, postVertexIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  postVertexIndexBuffer.numItems = indices.length;

}

function drawScene() {
  gl.enable(gl.DEPTH_TEST);

  // gl.useProgram(shaderProgram);

  var fov = 70 + 40 * Math.sin(globalTime / 9000.0);
  mat4.perspective(fov, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);

  var T = globalTime + 150 * beatDelta;

  eyeFrom = [
    0.0 + 0.3 * Math.sin(T / 1950),
    0.0 + 0.3 * Math.cos(T / 1730),
    0.0 + 0.4 * Math.cos(T / 1463) - 0.6 //  + 0.1 * beatValue
  ];

  eyeTo = [
    0.0 + 0.1 * Math.sin(T / 2250),
    0.0 + 0.1 * Math.cos(T / 1730),
    0.0 + 0.1 * Math.cos(T / 1963) + 0.0
  ];

  vec3.subtract(eyeTo, eyeFrom, eyeVector);
  vec3.normalize(eyeVector);

  mat4.lookAt(eyeFrom, eyeTo, [
    0.0 + 0.1 * Math.sin(globalTime / 3650),
    1.0,
    0.0 + 0.1 * Math.cos(globalTime / 2650)
  ], mvMatrix);

  setMatrixUniforms();

  if (cubeVertexIndexBuffer && cubeVertexIndexBuffer.numItems > 0) {
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    gl.enableVertexAttribArray(shaderProgram.vertexColorAttribute);
    gl.enableVertexAttribArray(shaderProgram.vertexData1Attribute);
    gl.enableVertexAttribArray(shaderProgram.vertexData2Attribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, cubeVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexColorAttribute, cubeVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexData1Buffer);
    gl.vertexAttribPointer(shaderProgram.vertexData1Attribute, cubeVertexData1Buffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexData2Buffer);
    gl.vertexAttribPointer(shaderProgram.vertexData2Attribute, cubeVertexData2Buffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer);
    gl.drawElements(gl.TRIANGLES, cubeVertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(shaderProgram.vertexData2Attribute);
    gl.disableVertexAttribArray(shaderProgram.vertexData1Attribute);
    gl.disableVertexAttribArray(shaderProgram.vertexColorAttribute);
    gl.disableVertexAttribArray(shaderProgram.vertexPositionAttribute);
  }
}


function drawScene2() {
  // gl.enable(gl.DEPTH_TEST);
  // gl.useProgram(shaderProgram2);

  if (postVertexIndexBuffer && postVertexIndexBuffer.numItems > 0) {
    gl.enableVertexAttribArray(shaderProgram2.vertexTextureAttribute);
    gl.enableVertexAttribArray(shaderProgram2.vertexPositionAttribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, postVertexPositionBuffer);
    gl.vertexAttribPointer(shaderProgram2.vertexPositionAttribute, postVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, postVertexTextureBuffer);
    gl.vertexAttribPointer(shaderProgram2.vertexTextureAttribute, postVertexTextureBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rttTexture);
    gl.uniform1i(shaderProgram2.tColor, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rttDepthTexture);
    gl.uniform1i(shaderProgram2.tDepth, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
    gl.uniform1i(shaderProgram2.tNoise, 2);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, postVertexIndexBuffer);
    gl.drawElements(gl.TRIANGLES, postVertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null)

    gl.disableVertexAttribArray(shaderProgram2.vertexTextureAttribute);
    gl.disableVertexAttribArray(shaderProgram2.vertexPositionAttribute);
  }
}

function tick() {
  requestAnimFrame(tick);

  var t = (new Date()).getTime();
  if (lastTrackPositionUpdate == 0) {
    lastTrackPositionUpdate = t;
  }

  var dt = t - lastTrackPositionUpdate;
  lastTrackPositionUpdate = t;

  if (trackPlaying) {
    trackPosition += dt;
  }

  // find beat changes
  // console.log('trackPosition', trackPosition);
  var i = nextTrackBeat;
  while(i < trackBeats.length && trackPosition > trackBeats[i]) {
    // console.log('comparing beat #' + i)
    i ++;
  }
  if (i > nextTrackBeat) {
    console.log('BEAT #' + i + ' at ' + trackPosition + ' ms')
    nextTrackBeat = i;
    beatValue = 1.0;
    if (i % 2 == 0) beatValue2 = 1.0;
    if (i % 4 == 0) beatValue4 = 1.0;
    if (i % 2 == 0) beatDelta += 1.0;
  }

  var progress = -2.0;
  var stateTime = 0;

  if (state == 'blank') {
    progress = -2.0;
    if (albumURI != visibleAlbumURI) {
      console.log('Album URI changed: ' + albumURI);
      visibleAlbumURI = albumURI;
      console.log('Got album image..');
      fetchVectors(albumImageURL, function () {
        console.log('Got album vectors..');
        updateBuffers(nextVectorData);
        nextVectorData = null;
        state = 'fadein';
        stateTime = 0.0;
        stateStart = globalTime;
      });
    }
  } else if (state == 'fadein') {
    stateTime = globalTime - stateStart;
    progress = -2.0 + stateTime / 7000.0;
    if (stateTime > 14000.0) {
      console.log('Fade in done.');
      state = 'visible';
      stateTime = 0.0;
      stateStart = globalTime;
    }
  } else if (state == 'visible') {
    progress = 0.0;
    if (albumURI != visibleAlbumURI) {
      console.log('Fading out...');
      state = 'fadeout';
      stateTime = 0.0;
      stateStart = globalTime;
    }
  } else if (state == 'fadeout') {
    stateTime = globalTime - stateStart;
    progress = 0.0 + stateTime / 2500.0;
    if (stateTime > 5000.0) {
      console.log('Faded out.');
      state = 'blank';
      stateTime = 0.0;
      stateStart = globalTime;
    }
  }

  var t2 = Math.sin(globalTime / 1000.0) * Math.max(0, 0.3 + 0.5 * Math.sin(globalTime / 4600.0));
  var t3 = Math.cos(globalTime / 1300.0) * Math.max(0, 0.3 + 0.5 * Math.cos(globalTime / 5400.0));

  t2 += beatValue * 0.2 * Math.max(0, 0.3 + 0.5 * Math.sin(globalTime / 3600.0));
  t3 += beatValue2 * 0.2 * Math.max(0, 0.3 + 0.5 * Math.sin(globalTime / 5100.0));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
  gl.useProgram(shaderProgram)
  gl.uniform1f(shaderProgram.timeUniform, globalTime);
  gl.uniform1f(shaderProgram.progressUniform, progress);
  gl.uniform1f(shaderProgram.wobble1Uniform, t2);
  gl.uniform1f(shaderProgram.wobble2Uniform, t3);
  gl.uniform1i(shaderProgram.writeDepthUniform, 0);
  // gl.useProgram(null)
  // gl.bindTexture(gl.TEXTURE_2D, null);

  gl.viewport(0, 0, rttFramebuffer.width, rttFramebuffer.height);
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawScene();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, rttDepthFramebuffer);
  // gl.useProgram(shaderProgram)
  gl.uniform1f(shaderProgram.timeUniform, globalTime);
  gl.uniform1f(shaderProgram.progressUniform, progress);
  gl.uniform1f(shaderProgram.wobble1Uniform, t2);
  gl.uniform1f(shaderProgram.wobble2Uniform, t3);
  gl.uniform1i(shaderProgram.writeDepthUniform, 1);
  // gl.useProgram(null)
  // gl.bindTexture(gl.TEXTURE_2D, null);

  gl.viewport(0, 0, rttDepthFramebuffer.width, rttDepthFramebuffer.height);
  gl.clearColor(1.0, 1.0, 1.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawScene();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindTexture(gl.TEXTURE_2D, rttTexture);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.bindTexture(gl.TEXTURE_2D, rttDepthTexture);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform1i(shaderProgram.writeDepthUniform, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawScene();

  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(shaderProgram2)
  gl.uniform1f(shaderProgram2.timeUniform, globalTime);
  gl.uniform1f(shaderProgram2.beat1Uniform, beatValue);
  gl.uniform1f(shaderProgram2.beat2Uniform, beatValue2);
  gl.uniform1f(shaderProgram2.beat3Uniform, beatValue4);
  drawScene2();


  var timeNow = new Date().getTime();
  if (firstTime == 0) {
    firstTime = timeNow;
  }
  globalTime = timeNow - firstTime;

  beatValue -= 0.015;
  if (beatValue < 0.0) {
    beatValue = 0.0;
  }
  beatValue2 -= 0.015;
  if (beatValue2 < 0.0) {
    beatValue2 = 0.0;
  }
  beatValue4 -= 0.015;
  if (beatValue4 < 0.0) {
    beatValue4 = 0.0;
  }
}




// --------------------------------------------------------------------------------------
// DOM UI
// --------------------------------------------------------------------------------------

function updateTrackPosition() {
  // var t = (new Date()).getTime();
  // if (lastTrackPositionUpdate == 0) {
  //   lastTrackPositionUpdate = t;
  // }

  // var dt = t - lastTrackPositionUpdate;
  // lastTrackPositionUpdate = t;

  // if (trackPlaying) {
  //   trackPosition += dt;
  // }

  var w = trackPosition * 100 / trackDuration;
  w = Math.max(Math.min(100, w), 0);
  document.getElementById('trackpositionfill').style.width = w + '%';
}

function hideLogin() {
  document.getElementById('biglogin').style.display = 'none';
}

function showLogin() {
  document.getElementById('biglogin').style.display = 'block';
}

function toast(title, subtitle) {
  document.getElementById('text').innerText = title || '';
  document.getElementById('text2').innerText = subtitle || '';
  document.getElementById('toast').className = 'toast visible';

  clearTimeout(closetimer);
  closetimer = setTimeout(function () {
    document.getElementById('toast').className = 'toast';
  }, 5000);
}

function fetchTrackAnalysis() {
  var id = trackURI.split(':')[2];
  createAuthorizedRequest('GET', 'https://api.spotify.com/v1/audio-analysis/' + id, function(request) {
    if (request.status < 200 || request.status >= 400) {
      // callback(null);
      return;
    }

    var data = JSON.parse(request.responseText);
    console.log('got analysis data', data);
    trackAnalysis = data;
    trackBeats = data.beats.map(function(x) {
      return Math.round(x.start * 1000.0);
    });
    trackBeats.sort(function(a, b) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    console.log('beats', trackBeats);
    // callback(data);
  }).send();

}

function setNowPlayingTrack(uri) {
  if (uri == trackURI) {
    return;
  }

  trackURI = uri;
  trackAnalysis = null;
  nextTrackBeat = 0;
  trackBeats = [];

  toast(trackName, artistName + ' - ' + albumName);
  fetchTrackAnalysis();
}

function login() {
  var redirect_uri = location.protocol + '//' + location.host + location.pathname;
  var url = 'https://accounts.spotify.com/authorize?client_id=' + CLIENT_ID +
            '&redirect_uri=' + encodeURIComponent(redirect_uri) +
            '&scope=' + SCOPES.join('%20') +
            '&response_type=token';
  console.log('login url', url);
  location.href = url;
}

function connect() {
  console.log('Connecting with access token: ' + accessToken);
  getUserInformation(function(userinfo) {
    if (!userinfo) {
      accessToken = '';
      showLogin();
      return;
    }

    hideLogin();
    toast('Hello ' + (userinfo.display_name || userinfo.id) + '!', 'Make sure you\'re playing something in Spotify!');
    pollCurrentlyPlaying(2000);
  });
}

function validateAuthentication() {
  console.log('location.hash', location.hash);
  var lochash = location.hash.substr(1);
  var newAccessToken = lochash.substr(lochash.indexOf('access_token=')).split('&')[0].split('=')[1];
  if (newAccessToken) {
    localStorage.setItem('access_token', newAccessToken);
    accessToken = newAccessToken;
  } else {
    accessToken = localStorage.getItem('access_token');
  }
  if (accessToken) {
    connect();
  } else {
    showLogin();
  }
}

function initUI() {
  document.getElementById('trackposition').addEventListener('mousedown', function(event) {
    var time = event.offsetX * trackDuration / document.body.offsetWidth;
    trackPosition = time;
    nextTrackBeat = 0;
    sendCommand('PUT', 'seek', 'position_ms='+Math.round(time));
  });

  setInterval(updateTrackPosition, 1000);
}

function initKeyboard() {
  window.addEventListener('keyup', function (event) {
    console.log('key up', event.keyCode);

    // some hidden presets '1' .. '0'
    if (event.keyCode == 49) { sendPlayContext('spotify:album:2gaw3G7HBQuz93N8X89JIA', 1); }
    if (event.keyCode == 50) { sendPlayContext('spotify:album:2KWlNb50pLNM11pGqqVdSX'); }
    if (event.keyCode == 51) { sendPlayContext('spotify:album:7xrc6SpiFhcgBaLYbqfB7k', 1); }
    if (event.keyCode == 52) { sendPlayContext('spotify:album:64XdBdXNdguPHzBg8bdk5A'); }
    if (event.keyCode == 53) { sendPlayContext('spotify:album:64XidJaSHIS1XMb4Po77b1', 9); }
    if (event.keyCode == 54) { sendPlayContext('spotify:album:4wJmWEuo2ezowJeJVdQWYS', 1); }
    if (event.keyCode == 55) { sendPlayContext('spotify:album:5uTGqtnYpSRYiFTEuQcmNE', 0); }
    if (event.keyCode == 56) { sendPlayContext('spotify:album:4QNlqYSMYCPiKZfzUfH7jK', 1); }
    if (event.keyCode == 57) { sendPlayContext('spotify:album:29JfxOC3yMXwy3KlX8WFUQ', 1); }
    if (event.keyCode == 48) { sendPlayContext('spotify:album:68zh8sbZPMeJb7GnqomRJS', 0); }

    // left
    if (event.keyCode == 37) {
      sendCommand('POST', 'previous');
    }

    // right
    if (event.keyCode == 39) {
      sendCommand('POST', 'next');
    }

    // space
    if (event.keyCode == 32) {
      if (trackPlaying) {
        trackPlaying = false;
        sendCommand('PUT', 'pause');
      } else {
        trackPlaying = true;
        sendCommand('PUT', 'play');
      }
    }
  });
}



// --------------------------------------------------------------------------------------
// Bootstrapping
// --------------------------------------------------------------------------------------

function bootstrap() {
  initWebGL(document.getElementById("canvas"));
  initTextureFramebuffer();
  initTextureFramebuffer2();
  initNoiseTexture();
  initWebGLBuffers();
  initKeyboard();
  initUI();
  validateAuthentication();
  initWebGLShader1(function() {
    initWebGLShader2(function() {
      updatePostBuffer();
      tick();
    });
  });
}

window.addEventListener('load', bootstrap);
