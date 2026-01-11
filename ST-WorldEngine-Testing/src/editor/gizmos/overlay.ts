import { Vector3 } from '../../world/schema';
import { BoundingBox, BoundsHandle, GizmoHandle, createBoundsHandles } from './handles';
import { SnapSettings, defaultSnapSettings, snapVector } from './snapping';

export interface GizmoInteraction {
  handle: GizmoHandle;
  start: Vector3;
  current: Vector3;
  delta: Vector3;
  snappedDelta: Vector3;
}

export class GizmoOverlay {
  private handles = new Map<string, GizmoHandle>();
  private active?: { handle: GizmoHandle; start: Vector3 };
  private bounds?: BoundingBox;
  private snap: SnapSettings = defaultSnapSettings;

  setSnapSettings(settings: Partial<SnapSettings>): SnapSettings {
    this.snap = { ...this.snap, ...settings };
    return this.snap;
  }

  getSnapSettings(): SnapSettings {
    return this.snap;
  }

  setHandles(handles: GizmoHandle[]): void {
    this.handles = new Map(handles.map((handle) => [handle.id, handle]));
  }

  useBounds(bounds: BoundingBox): BoundsHandle[] {
    this.bounds = bounds;
    const handles = createBoundsHandles(bounds);
    this.setHandles(handles);
    return handles;
  }

  beginInteraction(handleId: string, start: Vector3): GizmoInteraction | undefined {
    const handle = this.handles.get(handleId);
    if (!handle) {
      return undefined;
    }

    this.active = { handle, start };
    return {
      handle,
      start,
      current: start,
      delta: { x: 0, y: 0, z: 0 },
      snappedDelta: { x: 0, y: 0, z: 0 },
    };
  }

  updateInteraction(current: Vector3): GizmoInteraction | undefined {
    if (!this.active) {
      return undefined;
    }

    const delta = subtractVectors(current, this.active.start);
    const snappedDelta = snapVector(delta, this.snap);
    const boundedCurrent = this.bounds ? constrainToBounds(current, this.bounds) : current;

    return {
      handle: this.active.handle,
      start: this.active.start,
      current: boundedCurrent,
      delta,
      snappedDelta,
    };
  }

  endInteraction(): void {
    this.active = undefined;
  }

  getHandles(): GizmoHandle[] {
    return Array.from(this.handles.values());
  }

  getBounds(): BoundingBox | undefined {
    return this.bounds;
  }
}

const subtractVectors = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const constrainToBounds = (value: Vector3, bounds: BoundingBox): Vector3 => ({
  x: clamp(value.x, bounds.min.x, bounds.max.x),
  y: clamp(value.y, bounds.min.y, bounds.max.y),
  z: clamp(value.z, bounds.min.z, bounds.max.z),
});
