import { makeNoise4D } from 'open-simplex-noise';
import { createShader, createProgram } from './webgl';
import Camera from './camera';
import World from './world';
import {vec3, vec2, mat4_to_uniform} from './utils';

export type Vertex = {
  position: vec3,
  uv: vec2,
}

const vs = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec2 a_uv;

// premultiplied mvp matrix
uniform mat4 u_mvpMat;

out vec2 v_uv;

void main() {
   v_uv = a_uv;
   gl_Position = u_mvpMat * vec4(a_position, 1.0);
}
`;

const fs = `#version 300 es
precision highp float;
in vec2 v_uv;

out vec4 v_outColor;

void main() {

  // TODO: start using textures instead of directly using the uv coordinates
  // Also, use the uv coordinates to index into the texture

  v_outColor = vec4(v_uv, 0.0, 1.0);
}
`;

function genPlane(xseg: number, yseg: number): vec2[] {

  let vertexes: vec2[] = [];

  for (let xi = 0; xi < xseg; xi++) {
    const x = xi / xseg;
    const nx = (xi+1) / xseg;
    for (let yi = 0; yi < yseg; yi++) {
      const y = yi / yseg;
      const ny = (yi+1) / yseg;

      // add two triangles

      // upper triangle
      vertexes.push([x, y]);
      vertexes.push([nx, y]);
      vertexes.push([x, ny]);
      // lower triangle
      vertexes.push([nx, y]);
      vertexes.push([nx, ny]);
      vertexes.push([x, ny]);
    }
  }

  return vertexes;
}
function convertColor(color: number) {
  return [
    (color >> 16) / 0xFF,
    ((color >> 8) & 0xFF) / 0xFF,
    (color & 0xFF) / 0xFF,
  ];
}



class Game {

  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private world: World;

  private gl: WebGL2RenderingContext;

  private mvpMatLoc: WebGLUniformLocation;

  private filledbuffer!: WebGLBuffer;

  private requestID?:number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.camera = new Camera([0,0,0], this.canvas);


    this.gl = canvas.getContext('webgl2')!
    this.gl.enable(this.gl.DEPTH_TEST);

    const program = createProgram(
      this.gl,
      [
        createShader(this.gl, this.gl.VERTEX_SHADER, vs),
        createShader(this.gl, this.gl.FRAGMENT_SHADER, fs),
      ]
    )!;

    // get attribute locations
    const positionLoc = this.gl.getAttribLocation(program, 'a_position');
    const uvLoc = this.gl.getAttribLocation(program, 'a_uv');

    this.world = new World(42, [0, 0, 0], this.gl, positionLoc, uvLoc);

    // retrieve uniforms
    this.mvpMatLoc= this.gl.getUniformLocation(program, "u_mvpMat")!;

    this.gl.useProgram(program);

    // resize canvas on window
    this.resizeCanvas();
    this.canvas.addEventListener('resize', this.resizeCanvas);
  }

  resizeCanvas = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  displayHelp = () => this.animationLoop();


  animationLoop = () => {
    this.camera.update()
    this.world.update()

    {
      // set uniform
      const mvpMat = this.camera.getMvp();
      this.gl.uniformMatrix4fv(this.mvpMatLoc, false, mat4_to_uniform(mvpMat));

      // draw triangles
      this.world.render();
    }
    this.requestID = window.requestAnimationFrame(this.animationLoop);
  }

}


export default Game;
