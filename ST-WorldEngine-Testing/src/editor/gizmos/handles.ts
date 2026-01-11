import { Vector3 } from '../../world/schema';

export type Axis = 'x' | 'y' | 'z' | 'uniform';

export type HandleKind = 'translate' | 'rotate' | 'scale' | 'bounds';

export interface GizmoHandle {
  id: string;
  kind: HandleKind;
  axis: Axis;
  position: Vector3;
  label?: string;
}

export interface BoundsHandle extends GizmoHandle {
  corner: 'min' | 'max' | 'center' | 'edge';
  face?: 'xy' | 'yz' | 'xz';
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

const midpoint = (a: number, b: number) => (a + b) / 2;

const vectorMidpoint = (a: Vector3, b: Vector3): Vector3 => ({
  x: midpoint(a.x, b.x),
  y: midpoint(a.y, b.y),
  z: midpoint(a.z, b.z),
});

export function createBoundsHandles(bounds: BoundingBox): BoundsHandle[] {
  const { min, max } = bounds;
  const center = vectorMidpoint(min, max);
  const faces: BoundsHandle[] = [
    {
      id: 'face-xy-max',
      kind: 'bounds',
      axis: 'z',
      face: 'xy',
      corner: 'edge',
      position: { x: center.x, y: center.y, z: max.z },
      label: 'Front',
    },
    {
      id: 'face-xy-min',
      kind: 'bounds',
      axis: 'z',
      face: 'xy',
      corner: 'edge',
      position: { x: center.x, y: center.y, z: min.z },
      label: 'Back',
    },
    {
      id: 'face-yz-max',
      kind: 'bounds',
      axis: 'x',
      face: 'yz',
      corner: 'edge',
      position: { x: max.x, y: center.y, z: center.z },
      label: 'Right',
    },
    {
      id: 'face-yz-min',
      kind: 'bounds',
      axis: 'x',
      face: 'yz',
      corner: 'edge',
      position: { x: min.x, y: center.y, z: center.z },
      label: 'Left',
    },
    {
      id: 'face-xz-max',
      kind: 'bounds',
      axis: 'y',
      face: 'xz',
      corner: 'edge',
      position: { x: center.x, y: max.y, z: center.z },
      label: 'Top',
    },
    {
      id: 'face-xz-min',
      kind: 'bounds',
      axis: 'y',
      face: 'xz',
      corner: 'edge',
      position: { x: center.x, y: min.y, z: center.z },
      label: 'Bottom',
    },
  ];

  const corners: BoundsHandle[] = [
    { id: 'corner-min', kind: 'bounds', axis: 'uniform', corner: 'min', position: min, label: 'Min' },
    { id: 'corner-max', kind: 'bounds', axis: 'uniform', corner: 'max', position: max, label: 'Max' },
  ];

  const centerHandle: BoundsHandle = {
    id: 'center',
    kind: 'bounds',
    axis: 'uniform',
    corner: 'center',
    position: center,
    label: 'Center',
  };

  return [...faces, ...corners, centerHandle];
}
