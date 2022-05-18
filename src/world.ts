import { makeNoise3D } from 'open-simplex-noise';
import { Vertex } from './game';
import { vec2, vec3, vec3_add, vec3_sub } from './utils';
import * as Block from './block';

const MAX_CHUNKS_TO_GEN = 1;
const MAX_CHUNKS_TO_MESH = 1;

const CHUNK_X_SIZE = 8;
const CHUNK_Y_SIZE = 8;
const CHUNK_Z_SIZE = 8;

// how many chunks to render
const RENDER_RADIUS_X = 2;
const RENDER_RADIUS_Y = 2;
const RENDER_RADIUS_Z = 2;

type ChunkGraphics = {
    vao: WebGLVertexArrayObject,
    buffer: WebGLBuffer,
    nTriangles: number
  }

type Chunk = {
  // array must be CHUNK_X_SIZE*CHUNK_Y_SIZE*CHUNK_Z_SIZE
  blocks: Uint16Array,
  graphics?: ChunkGraphics
}

class World {

  private worldChunkCenterLoc: vec3;

  // noise function
  private readonly seed: number;
  private readonly noiseFn: (x: number, y: number, z: number) => number;

  // hashmap storing chunks
  private chunk_map: Map<string, Chunk>;

  // vector of the coordinates of chunks to generate
  private togenerate: Set<string>;
  // vector of the coordinates of chunks to mesh
  private tomesh: Set<string>;
  // vector of the coordinates of ready chunks
  private ready: Set<string>;

  private gl: WebGL2RenderingContext;
  private glPositionLoc: number;
  private glUvLoc: number;

  constructor(seed: number, loc: vec3, gl: WebGL2RenderingContext, positionLoc: number, uvLoc: number) {
    this.gl = gl;
    this.glPositionLoc = positionLoc;
    this.glUvLoc = uvLoc;
    this.seed = seed;
    this.noiseFn = makeNoise3D(seed);
    this.worldChunkCenterLoc = [
      Math.floor(loc[0] / CHUNK_X_SIZE),
      Math.floor(loc[1] / CHUNK_Y_SIZE),
      Math.floor(loc[2] / CHUNK_Z_SIZE),
    ];
    this.chunk_map = new Map();

    this.togenerate = new Set();
    this.tomesh = new Set();
    this.ready = new Set();

    this.updateCameraLoc();
  }

  private shouldBeLoaded = (worldChunkCoords: vec3) => {
    const disp = vec3_sub(worldChunkCoords, this.worldChunkCenterLoc);
    return (disp[0] >= -RENDER_RADIUS_X && disp[0] <= RENDER_RADIUS_X) &&
      (disp[1] >= -RENDER_RADIUS_Y && disp[1] <= RENDER_RADIUS_Y) &&
      (disp[2] >= -RENDER_RADIUS_Z && disp[2] <= RENDER_RADIUS_Z);
  }

  // if the camera new chunk coords misalign with our current chunk coords then
  updateCameraLoc = () => {
    // if any togenerate chunks now shouldn't be generated, remove them
    for (const coord of this.togenerate) {
      if (!this.shouldBeLoaded(JSON.parse(coord))) {
        this.togenerate.delete(coord);
      }
    }

    // if any tomesh chunks now shouldn't be loaded, unload them
    for (const coord of this.tomesh) {
      if (!this.shouldBeLoaded(JSON.parse(coord))) {
        let chunk = this.chunk_map.get(coord);
        if (chunk !== undefined) {
          if (chunk.graphics !== undefined) {
            this.deleteChunkGraphics(chunk.graphics);
          }
        }
        this.chunk_map.delete(coord);
        this.tomesh.delete(coord);
      }
    }

    // if any ready chunks shouldnt be loaded, unload them
    for (const coord of this.ready) {
      if (!this.shouldBeLoaded(JSON.parse(coord))) {
        let chunk = this.chunk_map.get(coord);
        if (chunk !== undefined) {
          if (chunk.graphics !== undefined) {
            this.deleteChunkGraphics(chunk.graphics);
          }
        }
        this.chunk_map.delete(coord);
        this.ready.delete(coord);
      }
    }

    // initialize all of our neighboring chunks to be on the load list
    for (let x = -RENDER_RADIUS_X; x <= RENDER_RADIUS_X; x++) {
      for (let y = -RENDER_RADIUS_Y; y <= RENDER_RADIUS_Y; y++) {
        for (let z = -RENDER_RADIUS_Z; z <= RENDER_RADIUS_Z; z++) {
          const chunkCoord = vec3_add(this.worldChunkCenterLoc, [x, y, z]);
          this.togenerate.add(JSON.stringify(chunkCoord));
        }
      }
    }
  }

  makeChunkGraphics = (blocks: Uint16Array, offset: vec3) => {
    const vertexes = createMesh(blocks, offset);
    const nTriangles = vertexes.length;

    const data = vertexes.flatMap(v => [...v.position, ...v.uv]);

    const vao = this.gl.createVertexArray()!;
    this.gl.bindVertexArray(vao);

    const buffer = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array(data),
      this.gl.STATIC_DRAW
    );

    // setup our attributes to tell WebGL how to pull
    // the data from the buffer above to the position attribute
    this.gl.enableVertexAttribArray(this.glPositionLoc);
    this.gl.vertexAttribPointer(
      this.glPositionLoc,
      3,              // size (num components)
      this.gl.FLOAT,  // type of data in buffer
      false,          // normalize
      5 * 4,          // stride (0 = auto)
      0 * 4,          // offset
    );
    this.gl.enableVertexAttribArray(this.glUvLoc);
    this.gl.vertexAttribPointer(
      this.glUvLoc,
      2,              // size (num components)
      this.gl.FLOAT,  // type of data in buffer
      false,          // normalize
      5 * 4,          // stride (0 = auto)
      3 * 4,          // offset
    );

    return {
      vao,
      buffer,
      nTriangles
    };
  }

  deleteChunkGraphics = (graphics:ChunkGraphics) => {
            this.gl.deleteBuffer(graphics.buffer);
            this.gl.deleteVertexArray(graphics.vao);
  }

  update = () => {
    // generate at most MAX_CHUNKS_TO_GEN chunks
    let genned_chunks = 0;
    for (const coord of this.togenerate) {
      if (genned_chunks < MAX_CHUNKS_TO_GEN) {
        this.togenerate.delete(coord);
        this.chunk_map.set(coord, {
          blocks: genChunkData(JSON.parse(coord), this.noiseFn),
        });
        this.tomesh.add(coord);
        genned_chunks++;
      }
    }

    // mesh at most MAX_CHUNKS_TO_MESH chunks
    let meshed_chunks = 0;
    for (const coord of this.tomesh) {
      if (meshed_chunks < MAX_CHUNKS_TO_MESH) {
        this.tomesh.delete(coord);
        let chunk = this.chunk_map.get(coord);
        if (chunk !== undefined) {
          if (chunk.graphics !== undefined) {
              this.deleteChunkGraphics(chunk.graphics);
          }
          const parsedCoord = JSON.parse(coord);
          const offset:vec3 = [parsedCoord[0]*CHUNK_X_SIZE, parsedCoord[1]*CHUNK_Y_SIZE, parsedCoord[2]*CHUNK_Z_SIZE];
          chunk.graphics = this.makeChunkGraphics(chunk.blocks, offset);
          this.ready.add(coord);
          meshed_chunks++;
        }
      }
    }
  }

  render = () => {
    for (const coord of this.ready) {
      let chunk = this.chunk_map.get(coord);
      if (chunk !== undefined && chunk.graphics !== undefined) {
        this.gl.bindVertexArray(chunk.graphics.vao);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, chunk.graphics.nTriangles);
      }
    }

  }

}


// generate chunk data
function genChunkData(worldChunkCoords: vec3, noise: (x: number, y: number, z: number) => number) {
  // generate chunk, we need to give it the block coordinate to generate at
  const chunkOffset = [
    worldChunkCoords[0] * CHUNK_X_SIZE,
    worldChunkCoords[1] * CHUNK_Y_SIZE,
    worldChunkCoords[2] * CHUNK_Z_SIZE
  ];

  const blocks = new Uint16Array(CHUNK_X_SIZE * CHUNK_Y_SIZE * CHUNK_Z_SIZE);

  const scale1 = 20.0;
  for (let x = 0; x < CHUNK_X_SIZE; x++) {
    const off_x = x * CHUNK_Y_SIZE * CHUNK_Z_SIZE;
    for (let y = 0; y < CHUNK_Y_SIZE; y++) {
      const off_xy = off_x + y * CHUNK_Z_SIZE;
      for (let z = 0; z < CHUNK_Z_SIZE; z++) {
        // this is the offset within the blocks array to store the value
        const off_xyz = off_xy + z;

        // calculate world coordinates in blocks
        const wx = x + chunkOffset[0];
        const wy = y + chunkOffset[1];
        const wz = z + chunkOffset[2];
        const val = noise(wx / scale1, wy / scale1, wz / scale1);

        if (val > 0) {
          blocks[off_xyz] = 1; // grass
        } else {
          blocks[off_xyz] = 0; // air
        }
      }
    }
  }

  return blocks;
}

let q = 0;

function createMesh(blocks: Uint16Array, offset: vec3) {
  function index(x: number, y: number, z: number) {
    return x * CHUNK_Y_SIZE * CHUNK_Z_SIZE + y * CHUNK_Z_SIZE + z;
  }

  const vertexes: Vertex[] = [];

  for (let x = 0; x < CHUNK_X_SIZE; x++) {
    for (let y = 0; y < CHUNK_Y_SIZE; y++) {
      for (let z = 0; z < CHUNK_Z_SIZE; z++) {
        const bi = blocks[index(x, y, z)];
        // check that its not transparent
        if (Block.DEFS[bi].transparent) {
          continue;
        }

        // get chunk location
        const fx = x + offset[0];
        const fy = y + offset[1];
        const fz = z + offset[2];

        // calculate vertexes
        const v000: vec3 = [fx + 0, fy + 0, fz + 0];
        const v100: vec3 = [fx + 1, fy + 0, fz + 0];
        const v001: vec3 = [fx + 0, fy + 0, fz + 1];
        const v101: vec3 = [fx + 1, fy + 0, fz + 1];
        const v010: vec3 = [fx + 0, fy + 1, fz + 0];
        const v110: vec3 = [fx + 1, fy + 1, fz + 0];
        const v011: vec3 = [fx + 0, fy + 1, fz + 1];
        const v111: vec3 = [fx + 1, fy + 1, fz + 1];

        const xoff = Block.TILE_TEX_XSIZE;
        const yoff = Block.TILE_TEX_YSIZE;

        // left face
        if (x === 0 || Block.DEFS[blocks[index(x - 1, y, z)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.LEFT;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v000, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v010, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v001, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v001, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v010, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v011, uv: [bx + xoff, by + yoff] });
        }
        // right face
        if (x === CHUNK_X_SIZE - 1 || Block.DEFS[blocks[index(x + 1, y, z)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.RIGHT;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v100, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v101, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v110, uv: [bx + xoff, by + yoff] });
          vertexes.push({ position: v101, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v111, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v110, uv: [bx + xoff, by + yoff] });
        }
        // upper face
        if (y === 0 || Block.DEFS[blocks[index(x, y - 1, z)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.UP;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v001, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v100, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v000, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v001, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v101, uv: [bx + xoff, by + yoff] });
          vertexes.push({ position: v100, uv: [bx + xoff, by + 0.00] });
        }
        // lower face
        if (y === CHUNK_Y_SIZE - 1 || Block.DEFS[blocks[index(x, y + 1, z)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.DOWN;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v010, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v110, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v011, uv: [bx + xoff, by + yoff] });
          vertexes.push({ position: v110, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v111, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v011, uv: [bx + xoff, by + yoff] });
        }
        // back face
        if (z === 0 || Block.DEFS[blocks[index(x, y, z - 1)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.BACK;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v000, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v100, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v010, uv: [bx + xoff, by + yoff] });
          vertexes.push({ position: v100, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v110, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v010, uv: [bx + xoff, by + yoff] });
        }
        // front face
        if (z === CHUNK_Z_SIZE - 1 || Block.DEFS[blocks[index(x, y, z + 1)]].transparent) {
          const bx = Block.TILE_TEX_XSIZE * Block.FRONT;
          const by = Block.TILE_TEX_YSIZE * bi;
          vertexes.push({ position: v011, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v101, uv: [bx + xoff, by + 0.00] });
          vertexes.push({ position: v001, uv: [bx + 0.00, by + 0.00] });
          vertexes.push({ position: v011, uv: [bx + 0.00, by + yoff] });
          vertexes.push({ position: v111, uv: [bx + xoff, by + yoff] });
          vertexes.push({ position: v101, uv: [bx + xoff, by + 0.00] });
        }
      }
    }
  }
  return vertexes;
}

export default World;
