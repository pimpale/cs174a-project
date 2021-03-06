import { RADIANS, vec3_dup, vec3_norm, vec3_cross, vec3_add, vec3, mat4, mat4_perspective, mat4_mul, mat4_look_at, mat4_axis_angle, mat4_vec_mul, vec4_extend_vec3, vec3_truncate_vec4, } from './utils';


export class CameraBasis {
  readonly front: vec3;
  readonly right: vec3;
  readonly up: vec3;

  //  this.front = vec3_norm([
  //    Math.cos(yaw) * Math.cos(pitch),
  //    Math.sin(pitch),
  //    Math.sin(yaw) * Math.cos(pitch),
  //  ]);
  //  // calculate others from via gram schmidt process
  //  this.right = vec3_norm(vec3_cross(this.front, worldup));
  //  this.up = vec3_norm(vec3_cross(this.right, this.front));


  constructor(pitch: number, yaw: number, worldup:vec3, worldright:vec3) {
    // complete world basis
    const worldup4 = vec4_extend_vec3(worldup, 0);
    const worldright4= vec4_extend_vec3(worldright, 0);
    const worldfront4 = vec4_extend_vec3(vec3_cross(worldup, worldright), 0);

    // calculate yaw matrix
    const yawmat = mat4_axis_angle(worldup, yaw);
    // calculate pitch matrix using transformed worldright
    const transformed_worldright = vec3_truncate_vec4(mat4_vec_mul(yawmat, worldright4));
    const pitchmat = mat4_axis_angle(transformed_worldright, pitch);

    // calculate combined rotation matrix
    const rmat = mat4_mul(pitchmat, yawmat);

    // transform the world basis vectors
    this.right = vec3_truncate_vec4(mat4_vec_mul(rmat, worldright4));
    this.up = vec3_truncate_vec4(mat4_vec_mul(rmat, worldup4));
    this.front = vec3_truncate_vec4(mat4_vec_mul(rmat, worldfront4));
  }
}

// The camera is the logical camera for the game world
// it doesn't actually move around, that's controlled by the player
export class Camera {
  private pos: vec3;
  private dir: vec3;

  private readonly canvas: HTMLCanvasElement;

  constructor(loc: vec3, dir: vec3, canvas: HTMLCanvasElement) {
    this.pos = loc;
    this.dir = dir;
    this.canvas = canvas;
  }

  getPos = () => vec3_dup(this.pos);
  setPos = (pos: vec3) => this.pos = vec3_dup(pos);

  getDir = () => vec3_dup(this.dir);
  setDir = (dir: vec3) => this.dir = vec3_dup(dir);

  getMvp = (worldup:vec3) => {
    const fov = RADIANS(90.0);
    const aspect_ratio = this.canvas.width / this.canvas.height;
    const projection = mat4_perspective(fov, aspect_ratio, 0.1, 100.0);

    // calculate the view matrix using our camera basis
    const view = mat4_look_at(this.pos, vec3_add(this.pos, this.dir), worldup);

    // compute final matrix
    return mat4_mul(projection, view);
  }
}
