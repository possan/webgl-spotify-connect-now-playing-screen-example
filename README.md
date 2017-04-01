WebGL Now Playing Hack
======================

![Obligatory 10mb gif](kung10mb.gif)

A example of how to use the newly released [Spotify Connect Web APIs](https://developer.spotify.com/web-api/web-api-connect-endpoint-reference/) to render the currently playing artwork in a slightly different way using WebGL.

[Click here to open the online version](https://possan.github.io/webgl-spotify-connect-now-playing-screen-example)

Download the repo, run `python -m SimpleHTTPServer 8000` in the folder that you just downloaded to host a webserver on port 8000, open `http://localhost:8000` in your webgl capable browser. It should ask you for permission to know what you are currently playing and to control playback.

While it's running, you can click on the progress bar/scrubber to seek in the track, or use your keyboard to control playback, `space` toggles play/pause, `left` skips to the previous track, `right` skips to the next track.

It uses my [polyserver](https://github.com/possan/polyserver) hack to vectorize the album covers into triangle data for the renderer, please don't overload it :)

Enjoy.
